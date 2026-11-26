import {
  defaultAnimatableTransform,
  staticAnimatable,
} from "../../engine/animatable";
import type {
  BlendMode,
  Clip,
  StickerStyleParams,
  TextAnimDirection,
  TextAnimationGranularity,
  TextAnimationParams,
  TextAnimPhase,
  TextProps,
  Track,
} from "../../project/types";
import { findClip, getEditorStore } from "../../store/editorStore";
import { markBatchDirty, type MutationBatch } from "./mutationBatch";
import type { ToolResult } from "./types";

export function resolveClipId(
  input: Record<string, unknown>,
  tracks: Track[],
): { clipId: string } | { error: ToolResult } {
  if (typeof input.clipId === "string" && input.clipId) {
    return { clipId: input.clipId };
  }
  const state = getEditorStore();
  const id = state.selectedClipId || state.selectedClipIds[0] || null;
  if (!id) {
    return {
      error: {
        ok: false,
        summary: "No clip selected and no clipId provided",
        data: { error: "no_selection" },
      },
    };
  }
  void tracks;
  return { clipId: id };
}

export function replaceClip(
  tracks: Track[],
  clipId: string,
  next: Clip,
): Track[] | null {
  let found = false;
  const out = tracks.map((track) => {
    const idx = track.clips.findIndex((c) => c.id === clipId);
    if (idx < 0) return track;
    found = true;
    const clips = track.clips.slice();
    clips[idx] = next;
    return { ...track, clips };
  });
  return found ? out : null;
}

export function assertEditable(
  tracks: Track[],
  clipId: string,
): { track: Track; clip: Clip } | ToolResult {
  const found = findClip(tracks, clipId);
  if (!found) {
    return {
      ok: false,
      summary: `Clip not found: ${clipId}`,
      data: { error: "clip_not_found", clipId },
    };
  }
  if (found.track.locked) {
    return {
      ok: false,
      summary: `Track is locked (${found.track.id})`,
      data: { error: "track_locked", trackId: found.track.id, clipId },
    };
  }
  if (found.track.hidden) {
    return {
      ok: false,
      summary: `Track is hidden (${found.track.id})`,
      data: { error: "track_hidden", trackId: found.track.id, clipId },
    };
  }
  return found;
}

export function isToolResult(v: unknown): v is ToolResult {
  return (
    !!v &&
    typeof v === "object" &&
    "ok" in v &&
    typeof (v as ToolResult).ok === "boolean" &&
    "summary" in v
  );
}

const TEXT_KEYS = new Set([
  "content",
  "fontSize",
  "fontFamily",
  "color",
  "fontWeight",
  "align",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "strokeColor",
  "strokeWidth",
  "shadowColor",
  "shadowBlur",
  "shadowOffsetX",
  "shadowOffsetY",
]);

export function mergeText(
  current: TextProps | undefined,
  patch: Record<string, unknown>,
): TextProps | ToolResult {
  const next: TextProps = {
    content: current?.content ?? "",
    ...(current ?? {}),
  };
  for (const [key, value] of Object.entries(patch)) {
    if (!TEXT_KEYS.has(key)) {
      return {
        ok: false,
        summary: `Unknown text field: ${key}`,
        data: { error: "unknown_text_key", key },
      };
    }
    (next as Record<string, unknown>)[key] = value;
  }
  return next;
}

function parseAnimPhase(
  raw: unknown,
  label: string,
): TextAnimPhase | ToolResult | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      summary: `${label} must be an object`,
      data: { error: "invalid_type", key: label },
    };
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.presetId !== "string" || !obj.presetId) {
    return {
      ok: false,
      summary: `${label}.presetId is required`,
      data: { error: "invalid_type", key: `${label}.presetId` },
    };
  }
  const phase: TextAnimPhase = { presetId: obj.presetId };
  if (obj.durationMs !== undefined) {
    if (typeof obj.durationMs !== "number" || !Number.isFinite(obj.durationMs)) {
      return {
        ok: false,
        summary: `${label}.durationMs must be a number`,
        data: { error: "invalid_type", key: `${label}.durationMs` },
      };
    }
    phase.durationMs = Math.max(0, obj.durationMs);
  }
  if (obj.direction !== undefined) {
    const d = obj.direction;
    if (d !== "left" && d !== "right" && d !== "up" && d !== "down") {
      return {
        ok: false,
        summary: `${label}.direction must be left|right|up|down`,
        data: { error: "invalid_type", key: `${label}.direction` },
      };
    }
    phase.direction = d as TextAnimDirection;
  }
  return phase;
}

export function mergeAnimation(
  current: TextAnimationParams | undefined,
  patch: Record<string, unknown>,
): TextAnimationParams | ToolResult {
  const next: TextAnimationParams = { ...(current ?? {}) };
  if ("in" in patch) {
    const phase = parseAnimPhase(patch.in, "animation.in");
    if (isToolResult(phase)) return phase;
    if (phase === undefined && patch.in === null) delete next.in;
    else if (phase) next.in = phase;
  }
  if ("out" in patch) {
    const phase = parseAnimPhase(patch.out, "animation.out");
    if (isToolResult(phase)) return phase;
    if (phase === undefined && patch.out === null) delete next.out;
    else if (phase) next.out = phase;
  }
  if ("loop" in patch) {
    if (patch.loop === null) {
      delete next.loop;
    } else if (
      patch.loop &&
      typeof patch.loop === "object" &&
      !Array.isArray(patch.loop)
    ) {
      const loop = patch.loop as Record<string, unknown>;
      if (typeof loop.presetId !== "string" || !loop.presetId) {
        return {
          ok: false,
          summary: "animation.loop.presetId is required",
          data: { error: "invalid_type", key: "animation.loop.presetId" },
        };
      }
      next.loop = { presetId: loop.presetId };
    } else {
      return {
        ok: false,
        summary: "animation.loop must be an object or null",
        data: { error: "invalid_type", key: "animation.loop" },
      };
    }
  }
  if ("granularity" in patch) {
    const g = patch.granularity;
    if (g !== "whole" && g !== "line" && g !== "word" && g !== "character") {
      return {
        ok: false,
        summary: "animation.granularity must be whole|line|word|character",
        data: { error: "invalid_type", key: "animation.granularity" },
      };
    }
    next.granularity = g as TextAnimationGranularity;
  }
  return next;
}

export function applyTransformStaticPatch(
  clip: Clip,
  patch: Record<string, unknown>,
): Clip | ToolResult {
  const base = clip.transform ?? defaultAnimatableTransform();
  const next = { ...base };
  for (const key of ["x", "y", "scaleX", "scaleY", "rotation"] as const) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return {
        ok: false,
        summary: `transform.${key} must be a finite number`,
        data: { error: "invalid_type", key },
      };
    }
    next[key] = staticAnimatable(value);
  }
  return { ...clip, transform: next };
}

export function applyToBatch(
  batch: MutationBatch,
  clipId: string,
  nextClip: Clip,
  label: string,
): ToolResult {
  const replaced = replaceClip(batch.tracks, clipId, nextClip);
  if (!replaced) {
    return {
      ok: false,
      summary: `Clip not found: ${clipId}`,
      data: { error: "clip_not_found", clipId },
    };
  }
  batch.tracks = replaced;
  markBatchDirty(batch, label);
  return {
    ok: true,
    summary: label,
    data: { clipId, ok: true },
    mutated: true,
  };
}

export function setBlendMode(
  clip: Clip,
  blendMode: string,
): Clip {
  return { ...clip, blendMode: blendMode as BlendMode };
}

export function mergeStickerStyle(
  clip: Clip,
  style: Record<string, unknown>,
): Clip {
  return {
    ...clip,
    stickerStyle: {
      ...(clip.stickerStyle ?? {}),
      ...(style as StickerStyleParams),
    },
  };
}

export { TEXT_KEYS };
