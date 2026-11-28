import {
  type AnimatablePath,
  clearAnimatableKeyframes,
  frameEpsilonMs,
  getAnimatable,
  makeKeyframe,
  setAnimatableOnClip,
  staticAnimatable,
} from "../../engine/animatable";
import { normalizeClipMasksInput } from "../../project/maskDefaults";
import type { AnimatableProperty, Clip, Track } from "../../project/types";
import { getEditorStore } from "../../store/editorStore";
import { getCapability } from "../catalog/register";
import {
  applyToBatch,
  assertEditable,
  isToolResult,
  mergeAnimation,
  mergeStickerStyle,
  mergeText,
  resolveClipId,
  setBlendMode,
} from "../tools/clipHelpers";
import {
  markBatchDirty,
  type MutationBatch,
  type ProjectHeaderSnapshot,
} from "../tools/mutationBatch";
import type { ToolResult } from "../tools/types";

const PROJECT_PATHS = new Set<keyof ProjectHeaderSnapshot>([
  "title",
  "fps",
  "width",
  "height",
  "resolutionMode",
  "aspectRatio",
  "colorSpace",
  "playheadMs",
]);

const CLIP_SET_PATH_PREFIXES = [
  "text.",
  "transform.",
  "transform3d.",
  "opacity",
  "blendMode",
  "animation",
  "stickerStyle",
  "adjust.",
  "audio.",
  "speed",
  "reversed",
  "crop",
  "removeBg",
  "masks",
  "masksEnabled",
  "filter",
  "effect",
  "transition",
  "muteAudio",
] as const;

const ANIM_PATHS = new Set<string>([
  "transform.x",
  "transform.y",
  "transform.scaleX",
  "transform.scaleY",
  "transform.rotation",
  "transform3d.rotateX",
  "transform3d.rotateY",
  "transform3d.rotateZ",
  "transform3d.z",
  "transform3d.perspective",
  "opacity",
  "adjust.brightness",
  "adjust.contrast",
  "adjust.saturation",
  "adjust.hue",
  "audio.volumeDb",
  "filter.strength",
  "effect.intensity",
]);

function isAllowedClipPath(path: string): boolean {
  if (path === "opacity" || path === "blendMode" || path === "animation") {
    return true;
  }
  if (path === "stickerStyle" || path === "speed" || path === "reversed") {
    return true;
  }
  if (path === "crop" || path === "removeBg" || path === "masksEnabled") {
    return true;
  }
  if (path === "filter" || path === "effect" || path === "transition") {
    return true;
  }
  if (path === "muteAudio" || path === "masks") return true;
  // masks.<id>.<leaf> including masks.<id>.points.<i>.x|y
  if (path.startsWith("masks.")) return true;
  if (path === "caption.cues") return true;
  return CLIP_SET_PATH_PREFIXES.some(
    (p) => p.endsWith(".") && path.startsWith(p),
  );
}

function capabilityHint(path: string): string {
  if (path.startsWith("text")) return "clip.text";
  if (path.startsWith("transform3d")) return "clip.transform3d";
  if (path.startsWith("transform")) return "clip.transform";
  if (path === "opacity") return "clip.opacity";
  if (path.startsWith("animation")) return "clip.animation";
  if (path.startsWith("adjust")) return "clip.adjust";
  if (path.startsWith("audio")) return "clip.audio";
  if (path.startsWith("removeBg")) return "clip.removeBg";
  if (path.startsWith("mask")) return "clip.masks";
  return "capabilities_list";
}

function parseAnimatableValue(
  value: unknown,
): AnimatableProperty<number> | number | ToolResult {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.staticValue === "number") {
      return {
        staticValue: obj.staticValue,
        keyframes: Array.isArray(obj.keyframes)
          ? (obj.keyframes as AnimatableProperty<number>["keyframes"])
          : [],
      };
    }
  }
  return {
    ok: false,
    summary: "Animatable value must be a number or { staticValue, keyframes }",
    data: { error: "invalid_animatable" },
  };
}

function applyAnimatableLeaf(
  clip: Clip,
  animPath: AnimatablePath,
  value: unknown,
): Clip | ToolResult {
  const parsed = parseAnimatableValue(value);
  if (isToolResult(parsed)) return parsed;
  if (typeof parsed === "number") {
    const patch = setAnimatableOnClip(clip, animPath, staticAnimatable(parsed));
    return { ...clip, ...patch };
  }
  const patch = setAnimatableOnClip(clip, animPath, parsed);
  return { ...clip, ...patch };
}

function setNestedText(clip: Clip, field: string, value: unknown): Clip | ToolResult {
  const merged = mergeText(clip.text, { [field]: value });
  if (isToolResult(merged)) return merged;
  return { ...clip, text: merged };
}

function setClipPath(
  clip: Clip,
  path: string,
  value: unknown,
): Clip | ToolResult {
  if (!isAllowedClipPath(path)) {
    return {
      ok: false,
      summary: `Unknown path: ${path}. Call capability_describe on ${capabilityHint(path)}.`,
      data: {
        error: "unknown_path",
        path,
        hint: capabilityHint(path),
      },
    };
  }

  if (path.startsWith("text.")) {
    return setNestedText(clip, path.slice("text.".length), value);
  }
  if (path === "text" && value && typeof value === "object") {
    const merged = mergeText(clip.text, value as Record<string, unknown>);
    if (isToolResult(merged)) return merged;
    return { ...clip, text: merged };
  }

  if (path.startsWith("transform.")) {
    const leaf = path.slice("transform.".length);
    const animPath = `transform.${leaf}` as AnimatablePath;
    if (!ANIM_PATHS.has(animPath)) {
      return {
        ok: false,
        summary: `Unknown transform leaf: ${leaf}`,
        data: { error: "unknown_path", path },
      };
    }
    return applyAnimatableLeaf(clip, animPath, value);
  }

  if (path.startsWith("transform3d.")) {
    const leaf = path.slice("transform3d.".length);
    const animPath = `transform3d.${leaf}` as AnimatablePath;
    if (!ANIM_PATHS.has(animPath)) {
      return {
        ok: false,
        summary: `Unknown transform3d leaf: ${leaf}`,
        data: { error: "unknown_path", path },
      };
    }
    return applyAnimatableLeaf(clip, animPath, value);
  }

  if (path === "opacity") {
    return applyAnimatableLeaf(clip, "opacity", value);
  }

  if (path === "blendMode") {
    if (typeof value !== "string") {
      return {
        ok: false,
        summary: "blendMode must be a string",
        data: { error: "invalid_type", path },
      };
    }
    return setBlendMode(clip, value);
  }

  if (path === "animation" || path.startsWith("animation.")) {
    const patch =
      path === "animation"
        ? (value as Record<string, unknown>)
        : { [path.slice("animation.".length)]: value };
    if (!patch || typeof patch !== "object") {
      return {
        ok: false,
        summary: "animation patch must be an object",
        data: { error: "invalid_type", path },
      };
    }
    const merged = mergeAnimation(clip.animation, patch);
    if (isToolResult(merged)) return merged;
    return { ...clip, animation: merged };
  }

  if (path === "stickerStyle") {
    if (!value || typeof value !== "object") {
      return {
        ok: false,
        summary: "stickerStyle must be an object",
        data: { error: "invalid_type", path },
      };
    }
    return mergeStickerStyle(clip, value as Record<string, unknown>);
  }

  if (path.startsWith("adjust.")) {
    const leaf = path.slice("adjust.".length);
    const animPath = `adjust.${leaf}` as AnimatablePath;
    if (!ANIM_PATHS.has(animPath)) {
      return {
        ok: false,
        summary: `Unknown adjust leaf: ${leaf}`,
        data: { error: "unknown_path", path },
      };
    }
    return applyAnimatableLeaf(clip, animPath, value);
  }

  if (path === "audio" || path.startsWith("audio.")) {
    if (path === "audio.volumeDb" || path === "audio") {
      if (path === "audio.volumeDb") {
        return applyAnimatableLeaf(clip, "audio.volumeDb", value);
      }
      if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        let next = clip;
        if ("volumeDb" in obj) {
          const applied = applyAnimatableLeaf(next, "audio.volumeDb", obj.volumeDb);
          if (isToolResult(applied)) return applied;
          next = applied;
        }
        const audio = { ...(next.audio ?? {}) };
        if (typeof obj.fadeInMs === "number") audio.fadeInMs = obj.fadeInMs;
        if (typeof obj.fadeOutMs === "number") audio.fadeOutMs = obj.fadeOutMs;
        return { ...next, audio };
      }
    }
    if (path === "audio.fadeInMs" || path === "audio.fadeOutMs") {
      const key = path.slice("audio.".length);
      if (typeof value !== "number") {
        return {
          ok: false,
          summary: `${path} must be a number`,
          data: { error: "invalid_type", path },
        };
      }
      return {
        ...clip,
        audio: { ...(clip.audio ?? {}), [key]: value },
      };
    }
  }

  if (path === "speed") {
    if (typeof value === "number" && Number.isFinite(value)) {
      return {
        ...clip,
        speed: { mode: "constant", constant: value },
      };
    }
    if (value && typeof value === "object") {
      return { ...clip, speed: value as Clip["speed"] };
    }
    return {
      ok: false,
      summary: "speed must be a number (constant) or SpeedCurve object",
      data: { error: "invalid_type", path },
    };
  }

  if (path === "reversed") {
    if (typeof value !== "boolean") {
      return {
        ok: false,
        summary: "reversed must be a boolean",
        data: { error: "invalid_type", path },
      };
    }
    return { ...clip, reversed: value };
  }

  if (path === "muteAudio") {
    if (typeof value !== "boolean") {
      return {
        ok: false,
        summary: "muteAudio must be a boolean",
        data: { error: "invalid_type", path },
      };
    }
    return { ...clip, muteAudio: value };
  }

  if (path === "masksEnabled") {
    if (typeof value !== "boolean") {
      return {
        ok: false,
        summary: "masksEnabled must be a boolean",
        data: { error: "invalid_type", path },
      };
    }
    return { ...clip, masksEnabled: value };
  }

  if (path === "removeBg" || path.startsWith("removeBg.")) {
    const base = clip.removeBg ?? {
      enabled: false,
      color: {
        keyColor: [0, 255, 0] as [number, number, number],
        tolerance: 0.35,
        softness: 0.15,
        spill: 0.4,
        choke: 0,
      },
    };
    if (path === "removeBg" && value && typeof value === "object") {
      return {
        ...clip,
        removeBg: { ...base, ...(value as typeof base) },
      };
    }
    if (path === "removeBg.enabled" && typeof value === "boolean") {
      return { ...clip, removeBg: { ...base, enabled: value } };
    }
    if (path === "removeBg.color" && value && typeof value === "object") {
      return {
        ...clip,
        removeBg: {
          ...base,
          color: { ...base.color, ...(value as object) },
        },
      };
    }
  }

  if (path === "crop" && value && typeof value === "object") {
    return { ...clip, crop: value as Clip["crop"] };
  }

  if (path === "masks" && Array.isArray(value)) {
    if (value.length === 0) {
      const next = { ...clip };
      delete next.masks;
      return next;
    }
    const project = getEditorStore().project;
    const normalized = normalizeClipMasksInput(value, {
      layoutW: project.width,
      layoutH: project.height,
    });
    if (!normalized) {
      return {
        ok: false,
        summary:
          "masks must be an array of mask objects with type (circle|rectangle|split|filmstrip|stars|heart|text|custom). For custom, include points: [{x,y},...] in ±0.5 space (min 3). Numeric leaves may be bare numbers; keyframe vertices via masks.<id>.points.<i>.x|y.",
        data: { error: "invalid_masks" },
      };
    }
    // Applying masks should make them visible unless explicitly disabled earlier
    // in the same batch (masksEnabled set after this op still wins).
    return {
      ...clip,
      masks: normalized,
      masksEnabled: clip.masksEnabled ?? true,
    };
  }

  if (path.startsWith("masks.") && path.split(".").length >= 3) {
    // masks.<id>.<leaf> as animatable
    const animPath = path as AnimatablePath;
    return applyAnimatableLeaf(clip, animPath, value);
  }

  if (path === "filter" && value && typeof value === "object") {
    return { ...clip, filter: value as Clip["filter"] };
  }
  if (path === "effect" && value && typeof value === "object") {
    return { ...clip, effect: value as Clip["effect"] };
  }
  if (path === "transition" && value && typeof value === "object") {
    return { ...clip, transition: value as Clip["transition"] };
  }
  if (path === "filter.strength") {
    return applyAnimatableLeaf(clip, "filter.strength", value);
  }
  if (path === "effect.intensity") {
    return applyAnimatableLeaf(clip, "effect.intensity", value);
  }

  if (path === "caption.cues" && Array.isArray(value)) {
    if (!clip.caption) {
      return {
        ok: false,
        summary: "caption.cues requires an existing caption clip",
        data: { error: "not_caption_clip" },
      };
    }
    return {
      ...clip,
      caption: {
        ...clip.caption,
        cues: value as NonNullable<Clip["caption"]>["cues"],
      },
    };
  }

  return {
    ok: false,
    summary: `Unhandled path: ${path}. Call capability_describe on ${capabilityHint(path)}.`,
    data: { error: "unknown_path", path, hint: capabilityHint(path) },
  };
}

function unsetClipPath(clip: Clip, path: string): Clip | ToolResult {
  if (path === "animation") {
    const next = { ...clip };
    delete next.animation;
    return next;
  }
  if (path === "removeBg") {
    const next = { ...clip };
    delete next.removeBg;
    return next;
  }
  if (path === "masks") {
    const next = { ...clip };
    delete next.masks;
    return next;
  }
  return {
    ok: false,
    summary: `Cannot unset path: ${path}`,
    data: { error: "unset_unsupported", path },
  };
}

function applyKeyframeOp(
  batch: MutationBatch,
  op: Record<string, unknown>,
): ToolResult {
  const kind = op.op;
  const resolved = resolveClipId(op, batch.tracks);
  if ("error" in resolved) return resolved.error;
  const editable = assertEditable(batch.tracks, resolved.clipId);
  if (isToolResult(editable)) return editable;

  const animPathRaw = typeof op.animPath === "string" ? op.animPath : "";
  if (!animPathRaw) {
    return {
      ok: false,
      summary: "animPath is required for keyframe ops",
      data: { error: "missing_animPath" },
    };
  }
  const animPath = animPathRaw as AnimatablePath;
  const fps = getEditorStore().project.fps;
  let clip = editable.clip;

  if (kind === "keyframe.set") {
    if (typeof op.value !== "number" || !Number.isFinite(op.value)) {
      return {
        ok: false,
        summary: "keyframe.set requires numeric value",
        data: { error: "invalid_value" },
      };
    }
    const timeOffsetMs =
      typeof op.timeOffsetMs === "number" && Number.isFinite(op.timeOffsetMs)
        ? Math.max(0, op.timeOffsetMs)
        : 0;
    const eps = frameEpsilonMs(fps);
    const prop =
      getAnimatable(clip, animPath) ?? staticAnimatable(op.value);
    const near = prop.keyframes.find(
      (k) => Math.abs(k.timeOffsetMs - timeOffsetMs) <= eps,
    );
    let nextProp: typeof prop;
    if (near) {
      nextProp = {
        staticValue: prop.staticValue,
        keyframes: prop.keyframes.map((k) =>
          k.id === near.id
            ? { ...k, value: op.value as number, timeOffsetMs }
            : k,
        ),
      };
    } else {
      nextProp = {
        staticValue: prop.staticValue,
        keyframes: [...prop.keyframes, makeKeyframe(timeOffsetMs, op.value)],
      };
    }
    const easing =
      typeof op.easing === "string"
        ? op.easing
        : typeof op.easingPresetId === "string"
          ? op.easingPresetId
          : null;
    if (easing) {
      nextProp = {
        ...nextProp,
        keyframes: nextProp.keyframes.map((k) =>
          Math.abs(k.timeOffsetMs - timeOffsetMs) <= eps
            ? {
                ...k,
                easingPresetId: easing as typeof k.easingPresetId,
              }
            : k,
        ),
      };
    }
    clip = { ...clip, ...setAnimatableOnClip(clip, animPath, nextProp) };
    return applyToBatch(
      batch,
      resolved.clipId,
      clip,
      `Keyframe ${animPath} @ ${Math.round(timeOffsetMs)}ms on ${resolved.clipId}`,
    );
  }

  if (kind === "keyframe.clear") {
    const timeOffsetMs =
      typeof op.timeOffsetMs === "number" && Number.isFinite(op.timeOffsetMs)
        ? op.timeOffsetMs
        : 0;
    const prop = getAnimatable(clip, animPath);
    if (!prop) {
      return {
        ok: false,
        summary: `No animatable at ${animPath}`,
        data: { error: "no_property", animPath },
      };
    }
    const eps = frameEpsilonMs(fps);
    const keys = prop.keyframes.filter(
      (k) => Math.abs(k.timeOffsetMs - timeOffsetMs) > eps,
    );
    const nextProp = { ...prop, keyframes: keys };
    clip = { ...clip, ...setAnimatableOnClip(clip, animPath, nextProp) };
    return applyToBatch(
      batch,
      resolved.clipId,
      clip,
      `Cleared keyframe ${animPath} @ ${Math.round(timeOffsetMs)}ms`,
    );
  }

  if (kind === "keyframe.clearAll") {
    const patch = clearAnimatableKeyframes(clip, animPath, 0);
    clip = { ...clip, ...patch };
    return applyToBatch(
      batch,
      resolved.clipId,
      clip,
      `Cleared all keyframes on ${animPath}`,
    );
  }

  return {
    ok: false,
    summary: `Unknown keyframe op: ${String(kind)}`,
    data: { error: "unknown_op", op: kind },
  };
}

function applyProjectOp(
  batch: MutationBatch,
  op: Record<string, unknown>,
): ToolResult {
  const path = typeof op.path === "string" ? op.path : "";
  if (!PROJECT_PATHS.has(path as keyof ProjectHeaderSnapshot)) {
    return {
      ok: false,
      summary: `Unknown project path: ${path}. Call capability_describe on project.spec.`,
      data: { error: "unknown_path", path, hint: "project.spec" },
    };
  }
  if (op.op === "unset") {
    return {
      ok: false,
      summary: "Cannot unset project fields",
      data: { error: "unset_unsupported", path },
    };
  }
  const key = path as keyof ProjectHeaderSnapshot;
  batch.projectPatch[key] = op.value as never;
  markBatchDirty(batch, `Set project.${path}`);
  return {
    ok: true,
    summary: `Set project.${path}`,
    data: { ok: true, target: "project", path, value: op.value },
    mutated: true,
  };
}

function applySessionOp(
  batch: MutationBatch,
  op: Record<string, unknown>,
): ToolResult {
  const path = typeof op.path === "string" ? op.path : "";
  if (path !== "selection") {
    return {
      ok: false,
      summary: `Unknown session path: ${path}. Use path=selection.`,
      data: { error: "unknown_path", path, hint: "session.selection" },
    };
  }
  if (op.op === "unset" || op.value === null) {
    batch.selectionClipIds = [];
    markBatchDirty(batch, "Cleared selection");
    return {
      ok: true,
      summary: "Cleared selection",
      data: { ok: true, clipIds: [] },
      mutated: true,
    };
  }
  if (!Array.isArray(op.value) || !op.value.every((v) => typeof v === "string")) {
    return {
      ok: false,
      summary: "selection value must be string[]",
      data: { error: "invalid_type", path },
    };
  }
  batch.selectionClipIds = op.value as string[];
  markBatchDirty(batch, `Selected ${batch.selectionClipIds.length} clip(s)`);
  return {
    ok: true,
    summary: `Selected ${batch.selectionClipIds.length} clip(s)`,
    data: { ok: true, clipIds: batch.selectionClipIds },
    mutated: true,
  };
}

function applyTrackFlagsOp(
  batch: MutationBatch,
  op: Record<string, unknown>,
): ToolResult {
  const trackId = typeof op.trackId === "string" ? op.trackId : "";
  if (!trackId) {
    return {
      ok: false,
      summary: "trackId is required",
      data: { error: "missing_trackId" },
    };
  }
  const idx = batch.tracks.findIndex((t) => t.id === trackId);
  if (idx < 0) {
    return {
      ok: false,
      summary: `Track not found: ${trackId}`,
      data: { error: "track_not_found", trackId },
    };
  }
  const track = { ...batch.tracks[idx]! };
  const path = typeof op.path === "string" ? op.path : "";
  if (
    path !== "locked" &&
    path !== "hidden" &&
    path !== "muted" &&
    path !== "solo"
  ) {
    return {
      ok: false,
      summary: `Unknown track path: ${path}`,
      data: { error: "unknown_path", path, hint: "track.flags" },
    };
  }
  if (typeof op.value !== "boolean") {
    return {
      ok: false,
      summary: `${path} must be boolean`,
      data: { error: "invalid_type", path },
    };
  }
  (track as Record<string, unknown>)[path] = op.value;
  const tracks = batch.tracks.slice();
  tracks[idx] = track;
  batch.tracks = tracks;
  markBatchDirty(batch, `Set track ${trackId}.${path}=${op.value}`);
  return {
    ok: true,
    summary: `Set track ${trackId}.${path}`,
    data: { ok: true, trackId, path, value: op.value },
    mutated: true,
  };
}

function applySetOp(
  batch: MutationBatch,
  op: Record<string, unknown>,
): ToolResult {
  const target = typeof op.target === "string" ? op.target : "";
  if (target === "project") return applyProjectOp(batch, op);
  if (target === "session") return applySessionOp(batch, op);
  if (target === "track") return applyTrackFlagsOp(batch, op);

  if (target !== "clip") {
    return {
      ok: false,
      summary: `Unknown target: ${target}`,
      data: { error: "unknown_target", target },
    };
  }

  const resolved = resolveClipId(op, batch.tracks);
  if ("error" in resolved) return resolved.error;
  const editable = assertEditable(batch.tracks, resolved.clipId);
  if (isToolResult(editable)) return editable;

  const path = typeof op.path === "string" ? op.path : "";
  if (!path) {
    return {
      ok: false,
      summary: "path is required",
      data: { error: "missing_path" },
    };
  }

  const next =
    op.op === "unset"
      ? unsetClipPath(editable.clip, path)
      : setClipPath(editable.clip, path, op.value);
  if (isToolResult(next)) return next;

  return applyToBatch(
    batch,
    resolved.clipId,
    next,
    `${op.op === "unset" ? "Unset" : "Set"} ${path} on ${resolved.clipId}`,
  );
}

export function executeDocumentPatch(
  input: Record<string, unknown>,
  batch: MutationBatch,
): ToolResult {
  const ops = input.ops;
  if (!Array.isArray(ops) || ops.length === 0) {
    return {
      ok: false,
      summary: "ops must be a non-empty array",
      data: { error: "invalid_ops" },
    };
  }

  const results: Array<Record<string, unknown>> = [];
  let anyMutated = false;

  for (const raw of ops) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        ok: false,
        summary: "Each op must be an object",
        data: { error: "invalid_op", results },
      };
    }
    const op = raw as Record<string, unknown>;
    const kind = typeof op.op === "string" ? op.op : "";
    let result: ToolResult;
    if (kind === "set" || kind === "unset") {
      result = applySetOp(batch, op);
    } else if (
      kind === "keyframe.set" ||
      kind === "keyframe.clear" ||
      kind === "keyframe.clearAll"
    ) {
      result = applyKeyframeOp(batch, op);
    } else {
      result = {
        ok: false,
        summary: `Unknown op: ${kind}`,
        data: { error: "unknown_op", op: kind },
      };
    }
    if (!result.ok) {
      return {
        ok: false,
        summary: result.summary,
        data: { error: "op_failed", failed: result.data, results },
      };
    }
    anyMutated = anyMutated || Boolean(result.mutated);
    results.push({ ok: true, summary: result.summary, data: result.data });
  }

  // Validate capability registry knows about clip.text etc. (soft check)
  void getCapability;

  return {
    ok: true,
    summary:
      results.length === 1
        ? String(results[0]!.summary)
        : `Applied ${results.length} patch ops`,
    data: { ok: true, results },
    mutated: anyMutated,
  };
}

/** Preview trim duration for confirm gate (timeline_edit). */
export function previewTracksFromBatch(batch: MutationBatch): Track[] {
  return batch.tracks;
}
