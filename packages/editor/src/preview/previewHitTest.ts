/**
 * Preview stage hit-testing for click-to-select.
 * Uses the same 2D AABB + rotation model as PreviewSelectionOverlay (ignores 3D).
 */

import {
  activeCaptionCue,
  resolveCaptionCueLayoutX,
  resolveCaptionCueLayoutY,
  resolveCaptionTextAtLocalMs,
} from "../ai/captions/resolveCaptionText";
import { effectiveSourceSize } from "../compositor/crop";
import { measureTextSize } from "../compositor/rasterizeText";
import { resolvePreviewLayers } from "../compositor/resolvePreviewClip";
import { ANIMATED_TEXT_OVERFLOW_PAD } from "../compositor/textUnits";
import { computeFittedRect } from "../compositor/transform";
import {
  evaluateClipTransform,
  type ResolvedTransform,
} from "../engine/animatable";
import { hasActiveTextAnimation } from "../engine/textAnimation";
import { clipLocalMs } from "../engine/time";
import type {
  Clip,
  MediaAssetRef,
  TextAnimationParams,
  TextProps,
  Track,
} from "../project/types";
import { findClip } from "../store/editorStore";
import { getPreviewTextLayout } from "./previewWorkerClient";

const STICKER_NATIVE = 256;

export type StageGeometry = {
  boxW: number;
  boxH: number;
  centerX: number;
  centerY: number;
  rotation: number;
  transform: ResolvedTransform;
};

export type PickResult = {
  clip: Clip;
  trackId: string;
  cueId: string | null;
};

/** True if (px, py) lies inside a box centered at (centerX, centerY), rotated by rotationDeg. */
export function pointInRotatedRect(
  px: number,
  py: number,
  centerX: number,
  centerY: number,
  boxW: number,
  boxH: number,
  rotationDeg: number,
): boolean {
  if (boxW <= 0 || boxH <= 0) return false;
  const dx = px - centerX;
  const dy = py - centerY;
  const rad = (-rotationDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  return Math.abs(lx) <= boxW / 2 && Math.abs(ly) <= boxH / 2;
}

/**
 * Selection bounds for text/captions — matches PreviewSelectionOverlay measure.
 */
export function measureSelectionTextSize(
  props: TextProps,
  animation?: TextAnimationParams | null,
): { width: number; height: number } | null {
  const base = measureTextSize(props);
  if (!base) return null;
  const stroke = Math.max(0, props.strokeWidth ?? 0);
  const safety = Math.max(2, Math.ceil(stroke * 0.75));
  let width = base.width + safety * 2;
  let height = base.height + safety * 2;
  if (hasActiveTextAnimation(animation)) {
    const pad = ANIMATED_TEXT_OVERFLOW_PAD;
    width += pad * 2;
    height += pad * 2;
  }
  return { width, height };
}

export type ContentSizeArgs = {
  clip: Clip;
  playheadMs: number;
  mediaIndex: MediaAssetRef[];
  layoutW: number;
  layoutH: number;
  previewFitMode: "fit" | "full";
};

/** Logical content size in layout pixels (pre-transform), same as selection chrome. */
export function contentSizeForClip(
  args: ContentSizeArgs,
): { width: number; height: number } | null {
  const { clip, playheadMs, mediaIndex, layoutW, layoutH, previewFitMode } =
    args;

  if (clip.kind === "sticker") {
    return { width: STICKER_NATIVE, height: STICKER_NATIVE };
  }

  if (clip.kind === "text") {
    const fromWorker = getPreviewTextLayout(clip.id);
    if (fromWorker) return fromWorker;
    return measureSelectionTextSize(
      clip.text ?? { content: "Text" },
      clip.animation,
    );
  }

  if (clip.kind === "caption") {
    const local = clipLocalMs(playheadMs, clip);
    if (local === null) return { width: 120, height: 36 };
    const text = resolveCaptionTextAtLocalMs(clip, local);
    const cue = clip.caption
      ? activeCaptionCue(clip.caption.cues, local, clip.caption.speed)
      : null;
    const textKey = cue ? `${clip.id}:${cue.id}` : clip.id;
    const fromWorker = getPreviewTextLayout(textKey);
    if (fromWorker) return fromWorker;
    return measureSelectionTextSize(
      text ?? { content: "Captions" },
      cue?.animation,
    );
  }

  if (clip.kind === "video" || clip.kind === "image") {
    const media = mediaIndex.find((m) => m.id === clip.mediaId);
    const rawW = media?.width && media.width > 0 ? media.width : layoutW;
    const rawH = media?.height && media.height > 0 ? media.height : layoutH;
    const eff = effectiveSourceSize(rawW, rawH, clip.crop);
    const fit = previewFitMode === "full" ? "cover" : "contain";
    const fitted = computeFittedRect(
      eff.width,
      eff.height,
      layoutW,
      layoutH,
      fit,
    );
    if (!fitted) return { width: layoutW, height: layoutH };
    return { width: fitted.drawW, height: fitted.drawH };
  }

  return null;
}

export type StageGeometryArgs = {
  clip: Clip;
  contentSize: { width: number; height: number };
  stageW: number;
  stageH: number;
  layoutW: number;
  layoutH: number;
  localMs: number;
};

export function stageGeometryForClip(
  args: StageGeometryArgs,
): StageGeometry | null {
  const {
    clip,
    contentSize,
    stageW,
    stageH,
    layoutW,
    layoutH,
    localMs,
  } = args;
  if (stageW < 2 || stageH < 2) return null;

  const t = evaluateClipTransform(clip, localMs);
  let layoutX = t.x;
  let layoutY = t.y;
  if (clip.kind === "caption" && clip.caption) {
    const cue = activeCaptionCue(
      clip.caption.cues,
      localMs,
      clip.caption.speed,
    );
    layoutX = resolveCaptionCueLayoutX(clip.caption, cue, t.x);
    layoutY = resolveCaptionCueLayoutY(clip.caption, cue, layoutH);
  }
  const resolved = { ...t, x: layoutX, y: layoutY };
  const sx = stageW / Math.max(1, layoutW);
  const sy = stageH / Math.max(1, layoutH);
  const scaleX = t.uniformScale !== false ? t.scaleX : t.scaleX;
  const scaleY = t.uniformScale !== false ? t.scaleX : t.scaleY;
  const boxW = contentSize.width * scaleX * sx;
  const boxH = contentSize.height * scaleY * sy;
  const centerX = stageW / 2 + resolved.x * sx;
  const centerY = stageH / 2 + resolved.y * sy;
  return {
    boxW,
    boxH,
    centerX,
    centerY,
    rotation: resolved.rotation,
    transform: resolved,
  };
}

function isPickableKind(
  kind: string,
): kind is "video" | "image" | "text" | "caption" | "sticker" {
  return (
    kind === "video" ||
    kind === "image" ||
    kind === "text" ||
    kind === "caption" ||
    kind === "sticker"
  );
}

export type PickClipArgs = {
  stageX: number;
  stageY: number;
  stageW: number;
  stageH: number;
  tracks: Track[];
  mediaIndex: MediaAssetRef[];
  playheadMs: number;
  layoutW: number;
  layoutH: number;
  fps: number;
  previewFitMode: "fit" | "full";
  /**
   * When set, if this clip is under the point keep it even when buried under
   * a larger top layer (sticky selection for re-click / drag).
   */
  preferClipId?: string | null;
};

type LayerHitArgs = {
  stageX: number;
  stageY: number;
  stageW: number;
  stageH: number;
  tracks: Track[];
  mediaIndex: MediaAssetRef[];
  playheadMs: number;
  layoutW: number;
  layoutH: number;
  previewFitMode: "fit" | "full";
  clip: Clip;
  localMs: number;
};

function hitTestLayerClip(args: LayerHitArgs): PickResult | null {
  const {
    stageX,
    stageY,
    stageW,
    stageH,
    tracks,
    mediaIndex,
    playheadMs,
    layoutW,
    layoutH,
    previewFitMode,
    clip,
    localMs,
  } = args;

  if (!isPickableKind(clip.kind)) return null;

  const found = findClip(tracks, clip.id);
  if (!found || found.track.locked || found.track.hidden) return null;

  const size = contentSizeForClip({
    clip,
    playheadMs,
    mediaIndex,
    layoutW,
    layoutH,
    previewFitMode,
  });
  if (!size) return null;

  const geo = stageGeometryForClip({
    clip,
    contentSize: size,
    stageW,
    stageH,
    layoutW,
    layoutH,
    localMs,
  });
  if (!geo) return null;

  if (
    !pointInRotatedRect(
      stageX,
      stageY,
      geo.centerX,
      geo.centerY,
      geo.boxW,
      geo.boxH,
      geo.rotation,
    )
  ) {
    return null;
  }

  let cueId: string | null = null;
  if (clip.kind === "caption" && clip.caption) {
    const cue = activeCaptionCue(
      clip.caption.cues,
      localMs,
      clip.caption.speed,
    );
    cueId = cue?.id ?? null;
  }

  return { clip, trackId: found.track.id, cueId };
}

/**
 * Topmost pickable clip under a stage point (layout→stage 2D box + rotation).
 * Prefer an already-selected clip when the click lands inside its bounds.
 */
export function pickClipAtStagePoint(args: PickClipArgs): PickResult | null {
  const {
    stageX,
    stageY,
    stageW,
    stageH,
    tracks,
    mediaIndex,
    playheadMs,
    layoutW,
    layoutH,
    fps,
    previewFitMode,
    preferClipId,
  } = args;

  const layers = resolvePreviewLayers(
    tracks,
    mediaIndex,
    playheadMs,
    fps,
    layoutH,
  );

  const hitArgsBase = {
    stageX,
    stageY,
    stageW,
    stageH,
    tracks,
    mediaIndex,
    playheadMs,
    layoutW,
    layoutH,
    previewFitMode,
  };

  // Sticky selection: re-click inside the selected item keeps it, even if buried.
  if (preferClipId) {
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i]!;
      if (layer.clip.id !== preferClipId) continue;
      const preferred = hitTestLayerClip({
        ...hitArgsBase,
        clip: layer.clip,
        localMs: layer.localMs,
      });
      if (preferred) return preferred;
      break;
    }
  }

  // Layers are bottom → top; walk top → bottom for pick.
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]!;
    const hit = hitTestLayerClip({
      ...hitArgsBase,
      clip: layer.clip,
      localMs: layer.localMs,
    });
    if (hit) return hit;
  }

  return null;
}
