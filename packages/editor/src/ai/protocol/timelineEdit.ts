import { defaultAnimatableTransform } from "../../engine/animatable";
import {
  findClipInTracks,
  isFreelyResizableClip,
  moveClip,
  rippleDeleteMany,
  splitClipAt,
  trimClipEdge,
} from "../../engine/timelineOps";
import { placeStickerOnTracks } from "../../media/addStickerToTimeline";
import {
  placeTextOnTracks,
  textPropsForPreset,
  type TextPresetId,
} from "../../media/addTextToTimeline";
import { placeImageOnTracks } from "../../media/placeImageOnTracks";
import type { Clip, TextProps, Track } from "../../project/types";
import { findSticker, loadStickerManifest } from "../../stickers/manifest";
import { frameDurationMs, getEditorStore } from "../../store/editorStore";
import {
  normalizeTextProps,
  replaceContentKeepingBaseStyle,
} from "../../text/runs";
import {
  assertEditable,
  isToolResult,
  mergeText,
  resolveClipId,
} from "../tools/clipHelpers";
import { markBatchDirty, type MutationBatch } from "../tools/mutationBatch";
import type { ToolResult } from "../tools/types";

function applyTracks(
  batch: MutationBatch,
  tracks: Track[],
  label: string,
  data: Record<string, unknown> = {},
): ToolResult {
  batch.tracks = tracks;
  markBatchDirty(batch, label);
  return {
    ok: true,
    summary: label,
    data: { ok: true, ...data },
    mutated: true,
  };
}

function mediaDurationForClip(clip: Clip): number | null {
  if (!clip.mediaId) return null;
  const entry = getEditorStore().project.mediaIndex.find(
    (m) => m.id === clip.mediaId,
  );
  return entry?.durationMs ?? null;
}

export function previewTrimDurationMs(
  tracks: Track[],
  input: Record<string, unknown>,
): { clipId: string; beforeMs: number; afterMs: number } | null {
  const resolved = resolveClipId(input, tracks);
  if ("error" in resolved) return null;
  const found = findClipInTracks(tracks, resolved.clipId);
  if (!found) return null;
  const clip = found.clip;
  const next = resolveTrimTargets(clip, input);
  if (!next) return null;
  return {
    clipId: resolved.clipId,
    beforeMs: clip.durationMs,
    afterMs: next.durationMs,
  };
}

function resolveTrimTargets(
  clip: Clip,
  input: Record<string, unknown>,
): { startMs: number; durationMs: number; inMs: number; outMs: number } | null {
  let startMs = clip.startMs;
  let durationMs = clip.durationMs;
  let inMs = clip.inMs;
  let outMs = clip.outMs;

  const hasStart =
    typeof input.startMs === "number" && Number.isFinite(input.startMs);
  const hasDur =
    typeof input.durationMs === "number" && Number.isFinite(input.durationMs);
  const hasIn = typeof input.inMs === "number" && Number.isFinite(input.inMs);
  const hasOut =
    typeof input.outMs === "number" && Number.isFinite(input.outMs);

  if (!hasStart && !hasDur && !hasIn && !hasOut) return null;

  if (hasStart) startMs = Math.max(0, input.startMs as number);
  if (hasDur) durationMs = Math.max(1, input.durationMs as number);
  if (hasIn) inMs = Math.max(0, input.inMs as number);
  if (hasOut) outMs = Math.max(inMs + 1, input.outMs as number);

  if (isFreelyResizableClip(clip.kind)) {
    if (hasIn || hasOut) {
      durationMs = Math.max(1, outMs - inMs);
    }
    inMs = 0;
    outMs = durationMs;
  } else if (hasIn || hasOut) {
    durationMs = Math.max(1, outMs - inMs);
  } else if (hasDur) {
    outMs = inMs + durationMs;
  }

  return { startMs, durationMs, inMs, outMs };
}

function executeMove(
  input: Record<string, unknown>,
  batch: MutationBatch,
): ToolResult {
  const resolved = resolveClipId(input, batch.tracks);
  if ("error" in resolved) return resolved.error;
  const editable = assertEditable(batch.tracks, resolved.clipId);
  if (isToolResult(editable)) return editable;

  if (typeof input.startMs !== "number" || !Number.isFinite(input.startMs)) {
    return {
      ok: false,
      summary: "startMs is required",
      data: { error: "missing_startMs" },
    };
  }

  const store = getEditorStore();
  const targetTrackId =
    typeof input.trackId === "string" && input.trackId
      ? input.trackId
      : undefined;

  if (targetTrackId) {
    const dest = batch.tracks.find((t) => t.id === targetTrackId);
    if (!dest) {
      return {
        ok: false,
        summary: `Track not found: ${targetTrackId}`,
        data: { error: "track_not_found", trackId: targetTrackId },
      };
    }
    if (dest.locked || dest.hidden) {
      return {
        ok: false,
        summary: `Track is ${dest.locked ? "locked" : "hidden"} (${targetTrackId})`,
        data: {
          error: dest.locked ? "track_locked" : "track_hidden",
          trackId: targetTrackId,
        },
      };
    }
  }

  const result = moveClip({
    tracks: batch.tracks,
    clipId: resolved.clipId,
    startMs: input.startMs,
    playheadMs: store.project.playheadMs,
    magnetEnabled: store.magnetEnabled,
    pxPerSec: store.timelinePxPerSec,
    targetTrackId,
    intentionalLaneMove: Boolean(targetTrackId),
  });

  if (!result) {
    return {
      ok: false,
      summary: `Could not move clip ${resolved.clipId}`,
      data: { error: "move_failed", clipId: resolved.clipId },
    };
  }

  return applyTracks(
    batch,
    result.tracks,
    `Moved ${resolved.clipId} to ${Math.round(input.startMs)}ms`,
    { clipId: resolved.clipId, startMs: input.startMs, trackId: targetTrackId },
  );
}

function executeTrim(
  input: Record<string, unknown>,
  batch: MutationBatch,
): ToolResult {
  const resolved = resolveClipId(input, batch.tracks);
  if ("error" in resolved) return resolved.error;
  const editable = assertEditable(batch.tracks, resolved.clipId);
  if (isToolResult(editable)) return editable;

  const targets = resolveTrimTargets(editable.clip, input);
  if (!targets) {
    return {
      ok: false,
      summary: "Provide inMs, outMs, startMs, and/or durationMs",
      data: { error: "empty_trim" },
    };
  }

  const store = getEditorStore();
  const minDur = frameDurationMs(store.project.fps);
  const clip = editable.clip;
  let tracks = batch.tracks;

  if (isFreelyResizableClip(clip.kind)) {
    const next: Clip = {
      ...clip,
      startMs: targets.startMs,
      durationMs: targets.durationMs,
      inMs: 0,
      outMs: targets.durationMs,
    };
    const replaced = tracks.map((track) => {
      const idx = track.clips.findIndex((c) => c.id === resolved.clipId);
      if (idx < 0) return track;
      const clips = track.clips.slice();
      clips[idx] = next;
      return { ...track, clips };
    });
    return applyTracks(
      batch,
      replaced,
      `Trimmed ${resolved.clipId} to ${Math.round(targets.durationMs)}ms`,
      {
        clipId: resolved.clipId,
        startMs: targets.startMs,
        durationMs: targets.durationMs,
      },
    );
  }

  const mediaDur = mediaDurationForClip(clip);
  const endMs = targets.startMs + targets.durationMs;

  if (targets.startMs !== clip.startMs || targets.inMs !== clip.inMs) {
    const left = trimClipEdge({
      tracks,
      clipId: resolved.clipId,
      edge: "left",
      globalMs: targets.startMs,
      playheadMs: store.project.playheadMs,
      magnetEnabled: false,
      pxPerSec: store.timelinePxPerSec,
      minDurationMs: minDur,
      mediaDurationMs: mediaDur,
    });
    if (!left) {
      return {
        ok: false,
        summary: `Could not trim left edge of ${resolved.clipId}`,
        data: { error: "trim_left_failed", clipId: resolved.clipId },
      };
    }
    tracks = left.tracks;
  }

  const afterLeft = findClipInTracks(tracks, resolved.clipId)?.clip;
  const rightTarget = endMs;

  if (
    !afterLeft ||
    afterLeft.startMs + afterLeft.durationMs !== rightTarget ||
    targets.outMs !== clip.outMs ||
    targets.durationMs !== clip.durationMs
  ) {
    const right = trimClipEdge({
      tracks,
      clipId: resolved.clipId,
      edge: "right",
      globalMs: rightTarget,
      playheadMs: store.project.playheadMs,
      magnetEnabled: false,
      pxPerSec: store.timelinePxPerSec,
      minDurationMs: minDur,
      mediaDurationMs: mediaDur,
    });
    if (!right) {
      return {
        ok: false,
        summary: `Could not trim right edge of ${resolved.clipId}`,
        data: { error: "trim_right_failed", clipId: resolved.clipId },
      };
    }
    tracks = right.tracks;
  }

  const finalClip = findClipInTracks(tracks, resolved.clipId)?.clip;
  return applyTracks(
    batch,
    tracks,
    `Trimmed ${resolved.clipId} to ${Math.round(finalClip?.durationMs ?? targets.durationMs)}ms`,
    {
      clipId: resolved.clipId,
      startMs: finalClip?.startMs ?? targets.startMs,
      durationMs: finalClip?.durationMs ?? targets.durationMs,
    },
  );
}

function executeSplit(
  input: Record<string, unknown>,
  batch: MutationBatch,
): ToolResult {
  const resolved = resolveClipId(input, batch.tracks);
  if ("error" in resolved) return resolved.error;
  const editable = assertEditable(batch.tracks, resolved.clipId);
  if (isToolResult(editable)) return editable;

  const store = getEditorStore();
  const atMs =
    typeof input.atMs === "number" && Number.isFinite(input.atMs)
      ? input.atMs
      : store.project.playheadMs;
  const minDur = frameDurationMs(store.project.fps);

  const result = splitClipAt({
    tracks: batch.tracks,
    clipId: resolved.clipId,
    globalMs: atMs,
    minDurationMs: minDur,
  });

  if (!result) {
    return {
      ok: false,
      summary: `Could not split ${resolved.clipId} at ${Math.round(atMs)}ms`,
      data: { error: "split_failed", clipId: resolved.clipId, atMs },
    };
  }

  return applyTracks(
    batch,
    result.tracks,
    `Split ${resolved.clipId} at ${Math.round(atMs)}ms`,
    {
      clipId: resolved.clipId,
      atMs,
      rightClipId: result.rightClipId,
    },
  );
}

function executeDelete(
  input: Record<string, unknown>,
  batch: MutationBatch,
): ToolResult {
  let clipIds: string[] = [];
  if (Array.isArray(input.clipIds)) {
    clipIds = input.clipIds.filter(
      (id): id is string => typeof id === "string" && !!id,
    );
  } else if (typeof input.clipId === "string" && input.clipId) {
    clipIds = [input.clipId];
  } else {
    const resolved = resolveClipId({}, batch.tracks);
    if ("error" in resolved) return resolved.error;
    clipIds = [resolved.clipId];
  }

  if (clipIds.length === 0) {
    return {
      ok: false,
      summary: "No clipIds provided",
      data: { error: "empty_clipIds" },
    };
  }

  for (const id of clipIds) {
    const editable = assertEditable(batch.tracks, id);
    if (isToolResult(editable)) return editable;
  }

  const next = rippleDeleteMany({
    tracks: batch.tracks,
    clipIds,
    mainTrackMagnetEnabled: getEditorStore().magnetEnabled,
  });

  if (!next) {
    return {
      ok: false,
      summary: `Could not delete ${clipIds.length} clip(s)`,
      data: { error: "delete_failed", clipIds },
    };
  }

  return applyTracks(
    batch,
    next,
    clipIds.length === 1
      ? `Deleted ${clipIds[0]}`
      : `Deleted ${clipIds.length} clips`,
    { clipIds },
  );
}

const INSERT_TEXT_STYLE_KEYS = [
  "content",
  "runs",
  "fontSize",
  "fontFamily",
  "color",
  "fontWeight",
  "align",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "textDecoration",
  "gradient",
  "strokeColor",
  "strokeWidth",
  "shadowColor",
  "shadowBlur",
  "shadowOffsetX",
  "shadowOffsetY",
  "retro3DColor",
] as const;

function parseTextProps(input: Record<string, unknown>): TextProps | ToolResult {
  const preset =
    input.preset === "body" || input.preset === "title"
      ? (input.preset as TextPresetId)
      : "title";
  const base = textPropsForPreset(preset);
  const patch: Record<string, unknown> = {};
  for (const key of INSERT_TEXT_STYLE_KEYS) {
    if (input[key] !== undefined) patch[key] = input[key];
  }

  // Runs alone: seed content from runs before merge so presets don't leave "Text".
  if (patch.runs !== undefined && patch.content === undefined) {
    if (Array.isArray(patch.runs)) {
      const joined = (patch.runs as Array<{ text?: unknown }>)
        .map((r) => (typeof r?.text === "string" ? r.text : ""))
        .join("");
      if (joined) patch.content = joined;
    }
  }

  const merged = mergeText(base, patch);
  if (isToolResult(merged)) return merged;

  if (!merged.content) {
    return {
      ok: false,
      summary: "content or runs required for insertText",
      data: { error: "missing_content" },
    };
  }
  // Prefer explicit runs when provided; otherwise keep uniform base style on new content.
  if (patch.runs === undefined && typeof patch.content === "string") {
    return replaceContentKeepingBaseStyle(merged, merged.content);
  }
  return normalizeTextProps(merged);
}

function executeInsertText(
  input: Record<string, unknown>,
  batch: MutationBatch,
): ToolResult {
  const text = parseTextProps(input);
  if (isToolResult(text)) return text;

  const store = getEditorStore();
  const exactStart =
    typeof input.startMs === "number" && Number.isFinite(input.startMs);

  let transform = defaultAnimatableTransform();
  if (
    input.transform &&
    typeof input.transform === "object" &&
    !Array.isArray(input.transform)
  ) {
    const t = input.transform as Record<string, unknown>;
    transform = defaultAnimatableTransform({
      x: typeof t.x === "number" ? t.x : 0,
      y: typeof t.y === "number" ? t.y : 0,
      scaleX: typeof t.scaleX === "number" ? t.scaleX : 1,
      scaleY: typeof t.scaleY === "number" ? t.scaleY : 1,
      rotation: typeof t.rotation === "number" ? t.rotation : 0,
    });
  }

  const placed = placeTextOnTracks({
    tracks: batch.tracks,
    text,
    transform,
    targetTrackId:
      typeof input.trackId === "string" ? input.trackId : undefined,
    startMs: exactStart ? (input.startMs as number) : undefined,
    durationMs:
      typeof input.durationMs === "number" ? input.durationMs : undefined,
    exactStart,
    playheadMs: store.project.playheadMs,
    magnetEnabled: store.magnetEnabled,
    pxPerSec: store.timelinePxPerSec,
  });

  if (!placed) {
    return {
      ok: false,
      summary: "Could not insert text clip (track locked?)",
      data: { error: "insert_text_failed" },
    };
  }

  return applyTracks(
    batch,
    placed.tracks,
    `Inserted text “${text.content.slice(0, 24)}${text.content.length > 24 ? "…" : ""}”`,
    { clipId: placed.clip.id, trackId: placed.trackId },
  );
}

async function executeInsertSticker(
  input: Record<string, unknown>,
  batch: MutationBatch,
): Promise<ToolResult> {
  const stickerId =
    typeof input.stickerId === "string" ? input.stickerId : "";
  if (!stickerId) {
    return {
      ok: false,
      summary: "stickerId is required",
      data: { error: "missing_stickerId" },
    };
  }

  const manifest = await loadStickerManifest();
  const entry = findSticker(manifest, stickerId);
  if (!entry) {
    return {
      ok: false,
      summary: `Unknown sticker: ${stickerId}`,
      data: { error: "unknown_sticker", stickerId },
    };
  }

  const store = getEditorStore();
  const exactStart =
    typeof input.startMs === "number" && Number.isFinite(input.startMs);

  let transform: Clip["transform"] | undefined;
  if (
    input.transform &&
    typeof input.transform === "object" &&
    !Array.isArray(input.transform)
  ) {
    const t = input.transform as Record<string, unknown>;
    transform = defaultAnimatableTransform({
      x: typeof t.x === "number" ? t.x : 0,
      y: typeof t.y === "number" ? t.y : 0,
      scaleX: typeof t.scaleX === "number" ? t.scaleX : 1,
      scaleY: typeof t.scaleY === "number" ? t.scaleY : 1,
      rotation: typeof t.rotation === "number" ? t.rotation : 0,
    });
  }

  const placed = placeStickerOnTracks({
    tracks: batch.tracks,
    entry,
    targetTrackId:
      typeof input.trackId === "string" ? input.trackId : undefined,
    startMs: exactStart ? (input.startMs as number) : undefined,
    durationMs:
      typeof input.durationMs === "number" ? input.durationMs : undefined,
    exactStart,
    transform,
    playheadMs: store.project.playheadMs,
    magnetEnabled: store.magnetEnabled,
    pxPerSec: store.timelinePxPerSec,
  });

  if (!placed) {
    return {
      ok: false,
      summary: "Could not insert sticker (track locked?)",
      data: { error: "insert_sticker_failed", stickerId },
    };
  }

  return applyTracks(
    batch,
    placed.tracks,
    `Inserted sticker ${entry.name}`,
    { clipId: placed.clip.id, trackId: placed.trackId, stickerId },
  );
}

function executeInsertMedia(
  input: Record<string, unknown>,
  batch: MutationBatch,
): ToolResult {
  const mediaId = typeof input.mediaId === "string" ? input.mediaId : "";
  if (!mediaId) {
    return {
      ok: false,
      summary: "mediaId is required",
      data: { error: "missing_mediaId" },
    };
  }
  const store = getEditorStore();
  const asset = store.project.mediaIndex.find((m) => m.id === mediaId);
  if (!asset) {
    return {
      ok: false,
      summary: `Media not found: ${mediaId}`,
      data: { error: "media_not_found", mediaId },
    };
  }
  if (asset.kind !== "image" && asset.kind !== "video") {
    return {
      ok: false,
      summary: `insertMedia currently supports image/video (got ${asset.kind})`,
      data: { error: "unsupported_media_kind", kind: asset.kind },
    };
  }

  const exactStart =
    typeof input.startMs === "number" && Number.isFinite(input.startMs);
  const placed = placeImageOnTracks({
    tracks: batch.tracks,
    assetId: mediaId,
    targetTrackId:
      typeof input.trackId === "string" ? input.trackId : undefined,
    startMs: exactStart ? (input.startMs as number) : undefined,
    durationMs:
      typeof input.durationMs === "number"
        ? input.durationMs
        : asset.durationMs || undefined,
    exactStart,
    playheadMs: store.project.playheadMs,
    magnetEnabled: store.magnetEnabled,
    pxPerSec: store.timelinePxPerSec,
  });

  if (!placed) {
    return {
      ok: false,
      summary: "Could not place media (track locked?)",
      data: { error: "insert_media_failed", mediaId },
    };
  }

  return applyTracks(
    batch,
    placed.tracks,
    `Placed media ${asset.name}`,
    { clipId: placed.clip.id, trackId: placed.trackId, mediaId },
  );
}

function executeTrackStructure(
  input: Record<string, unknown>,
  batch: MutationBatch,
): ToolResult {
  const action = input.action;
  if (action === "add") {
    const type =
      typeof input.trackType === "string" ? input.trackType : "video";
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `track_${crypto.randomUUID().slice(0, 8)}`
        : `track_${Date.now().toString(36)}`;
    const track: Track = {
      id,
      type: type as Track["type"],
      locked: false,
      hidden: false,
      clips: [],
    };
    const index =
      typeof input.index === "number"
        ? Math.max(0, Math.min(batch.tracks.length, input.index))
        : batch.tracks.length;
    const tracks = batch.tracks.slice();
    tracks.splice(index, 0, track);
    return applyTracks(batch, tracks, `Added ${type} track`, {
      trackId: id,
    });
  }
  if (action === "reorder") {
    const trackId = typeof input.trackId === "string" ? input.trackId : "";
    const index = typeof input.index === "number" ? input.index : -1;
    if (!trackId || index < 0) {
      return {
        ok: false,
        summary: "trackId and index required for reorder",
        data: { error: "invalid_reorder" },
      };
    }
    const from = batch.tracks.findIndex((t) => t.id === trackId);
    if (from < 0) {
      return {
        ok: false,
        summary: `Track not found: ${trackId}`,
        data: { error: "track_not_found", trackId },
      };
    }
    const tracks = batch.tracks.slice();
    const [item] = tracks.splice(from, 1);
    tracks.splice(Math.min(index, tracks.length), 0, item!);
    return applyTracks(batch, tracks, `Reordered track ${trackId}`, {
      trackId,
      index,
    });
  }
  return {
    ok: false,
    summary: `Unknown track structure action: ${String(action)}`,
    data: { error: "unknown_action", action },
  };
}

export async function executeTimelineEdit(
  input: Record<string, unknown>,
  batch: MutationBatch,
): Promise<ToolResult> {
  const action = typeof input.action === "string" ? input.action : "";
  switch (action) {
    case "move":
      return executeMove(input, batch);
    case "trim":
      return executeTrim(input, batch);
    case "split":
      return executeSplit(input, batch);
    case "delete":
      return executeDelete(input, batch);
    case "insertText":
      return executeInsertText(input, batch);
    case "insertSticker":
      return executeInsertSticker(input, batch);
    case "insertMedia":
      return executeInsertMedia(input, batch);
    case "addTrack":
      return executeTrackStructure({ ...input, action: "add" }, batch);
    case "reorderTrack":
      return executeTrackStructure({ ...input, action: "reorder" }, batch);
    default:
      return {
        ok: false,
        summary: `Unknown timeline action: ${action}. Call capability_describe on timeline.*`,
        data: { error: "unknown_action", action, hint: "timeline.move" },
      };
  }
}
