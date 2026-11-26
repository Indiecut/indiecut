import { buildTimelineSkim } from "../context/assembleContextPack";
import { timelineDurationMs } from "../../engine/time";
import type { Clip } from "../../project/types";
import { findClip, getEditorStore } from "../../store/editorStore";
import { loadStickerManifest } from "../../stickers/manifest";
import type { ToolResult } from "../tools/types";

function keyedLeaves(clip: Clip): string[] {
  const keyed: string[] = [];
  const check = (path: string, prop?: { keyframes?: unknown[] }) => {
    if (prop?.keyframes && prop.keyframes.length > 0) keyed.push(path);
  };
  if (clip.transform) {
    check("transform.x", clip.transform.x);
    check("transform.y", clip.transform.y);
    check("transform.scaleX", clip.transform.scaleX);
    check("transform.scaleY", clip.transform.scaleY);
    check("transform.rotation", clip.transform.rotation);
  }
  check("opacity", clip.opacity);
  check("audio.volumeDb", clip.audio?.volumeDb);
  check("adjust.brightness", clip.adjust?.brightness);
  check("adjust.contrast", clip.adjust?.contrast);
  check("adjust.saturation", clip.adjust?.saturation);
  check("adjust.hue", clip.adjust?.hue);
  return keyed;
}

function sanitizeClip(clip: Clip): Record<string, unknown> {
  return {
    id: clip.id,
    kind: clip.kind,
    startMs: clip.startMs,
    durationMs: clip.durationMs,
    inMs: clip.inMs,
    outMs: clip.outMs,
    mediaId: clip.mediaId,
    stickerId: clip.stickerId,
    stickerStyle: clip.stickerStyle,
    transform: clip.transform
      ? {
          x: clip.transform.x.staticValue,
          y: clip.transform.y.staticValue,
          scaleX: clip.transform.scaleX.staticValue,
          scaleY: clip.transform.scaleY.staticValue,
          rotation: clip.transform.rotation.staticValue,
          uniformScale: clip.transform.uniformScale,
        }
      : undefined,
    opacity: clip.opacity?.staticValue,
    blendMode: clip.blendMode,
    text: clip.text
      ? {
          content: clip.text.content,
          fontSize: clip.text.fontSize,
          fontFamily: clip.text.fontFamily,
          color: clip.text.color,
          align: clip.text.align,
          fontWeight: clip.text.fontWeight,
          fontStyle: clip.text.fontStyle,
          letterSpacing: clip.text.letterSpacing,
          textTransform: clip.text.textTransform,
          strokeColor: clip.text.strokeColor,
          strokeWidth: clip.text.strokeWidth,
          shadowColor: clip.text.shadowColor,
          shadowBlur: clip.text.shadowBlur,
          shadowOffsetX: clip.text.shadowOffsetX,
          shadowOffsetY: clip.text.shadowOffsetY,
        }
      : undefined,
    animation: clip.animation ?? null,
    audio: clip.audio
      ? {
          volumeDb: clip.audio.volumeDb?.staticValue,
          fadeInMs: clip.audio.fadeInMs,
          fadeOutMs: clip.audio.fadeOutMs,
        }
      : undefined,
    adjust: clip.adjust
      ? {
          brightness: clip.adjust.brightness?.staticValue,
          contrast: clip.adjust.contrast?.staticValue,
          saturation: clip.adjust.saturation?.staticValue,
          hue: clip.adjust.hue?.staticValue,
        }
      : undefined,
    removeBg: clip.removeBg
      ? { enabled: clip.removeBg.enabled }
      : undefined,
    masksEnabled: clip.masksEnabled,
    maskCount: clip.masks?.length,
    speed: clip.speed,
    reversed: clip.reversed,
    muteAudio: clip.muteAudio,
    captionCueCount: clip.caption?.cues?.length,
    keyedPaths: keyedLeaves(clip),
  };
}

export async function executeInspect(
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const kind = typeof input.kind === "string" ? input.kind : "selection";
  const state = getEditorStore();
  const project = state.project;

  if (kind === "selection") {
    const ids = state.selectedClipIds.length
      ? state.selectedClipIds
      : state.selectedClipId
        ? [state.selectedClipId]
        : [];
    const clips = ids
      .map((id) => {
        const found = findClip(project.tracks, id);
        if (!found) return null;
        return {
          trackId: found.track.id,
          trackType: found.track.type,
          locked: found.track.locked,
          hidden: found.track.hidden,
          clip: sanitizeClip(found.clip),
        };
      })
      .filter(Boolean);
    return {
      ok: true,
      summary: `Selection: ${ids.length} clip(s)`,
      data: { kind, clipIds: ids, clips },
    };
  }

  if (kind === "clip") {
    const clipId = typeof input.clipId === "string" ? input.clipId : "";
    if (!clipId) {
      return {
        ok: false,
        summary: "Missing clipId",
        data: { error: "missing_clipId" },
      };
    }
    const found = findClip(project.tracks, clipId);
    if (!found) {
      return {
        ok: false,
        summary: `Clip not found: ${clipId}`,
        data: { error: "clip_not_found", clipId },
      };
    }
    return {
      ok: true,
      summary: `Got clip ${clipId}`,
      data: {
        kind,
        trackId: found.track.id,
        trackType: found.track.type,
        locked: found.track.locked,
        hidden: found.track.hidden,
        clip: sanitizeClip(found.clip),
      },
    };
  }

  if (kind === "project") {
    return {
      ok: true,
      summary: "Project spec",
      data: {
        kind,
        id: project.id,
        title: project.title,
        width: project.width,
        height: project.height,
        fps: project.fps,
        aspectRatio: project.aspectRatio,
        resolutionMode: project.resolutionMode,
        colorSpace: project.colorSpace,
        durationMs: timelineDurationMs(project.tracks),
        playheadMs: project.playheadMs,
      },
    };
  }

  if (kind === "playhead") {
    return {
      ok: true,
      summary: `Playhead ${Math.round(project.playheadMs)}ms`,
      data: { kind, playheadMs: project.playheadMs },
    };
  }

  if (kind === "skim") {
    const centerMs =
      typeof input.centerMs === "number" && Number.isFinite(input.centerMs)
        ? input.centerMs
        : project.playheadMs;
    const windowMs =
      typeof input.windowMs === "number" && Number.isFinite(input.windowMs)
        ? Math.max(1000, input.windowMs)
        : undefined;
    const selectedIds = new Set(
      state.selectedClipIds.length
        ? state.selectedClipIds
        : state.selectedClipId
          ? [state.selectedClipId]
          : [],
    );
    const mediaNameById = new Map(
      project.mediaIndex.map((m) => [m.id, m.name] as const),
    );
    const skim = buildTimelineSkim({
      tracks: project.tracks,
      centerMs,
      windowMs,
      selectedIds,
      mediaNameById,
    });
    return {
      ok: true,
      summary: `Skim @ ${Math.round(centerMs)}ms`,
      data: { kind, centerMs, windowMs: windowMs ?? 12_000, tracks: skim },
    };
  }

  if (kind === "track") {
    const trackId = typeof input.trackId === "string" ? input.trackId : "";
    if (!trackId) {
      return {
        ok: false,
        summary: "Missing trackId",
        data: { error: "missing_trackId" },
      };
    }
    const track = project.tracks.find((t) => t.id === trackId);
    if (!track) {
      return {
        ok: false,
        summary: `Track not found: ${trackId}`,
        data: { error: "track_not_found", trackId },
      };
    }
    return {
      ok: true,
      summary: `Track ${trackId}: ${track.clips.length} clip(s)`,
      data: {
        kind,
        id: track.id,
        type: track.type,
        locked: track.locked,
        hidden: track.hidden,
        muted: track.muted,
        solo: track.solo,
        clips: track.clips.map(sanitizeClip),
      },
    };
  }

  if (kind === "stickers") {
    const manifest = await loadStickerManifest();
    const stickers = manifest.stickers.map((s) => ({
      id: s.id,
      name: s.name,
      group: s.group,
    }));
    return {
      ok: true,
      summary: `${stickers.length} stickers`,
      data: { kind, stickers },
    };
  }

  if (kind === "media") {
    const media = project.mediaIndex.map((m) => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      durationMs: m.durationMs,
      favorite: m.favorite,
    }));
    return {
      ok: true,
      summary: `${media.length} media assets`,
      data: { kind, media },
    };
  }

  return {
    ok: false,
    summary: `Unknown inspect kind: ${kind}`,
    data: {
      error: "unknown_kind",
      kind,
      allowed: [
        "selection",
        "clip",
        "project",
        "playhead",
        "skim",
        "track",
        "stickers",
        "media",
      ],
    },
  };
}
