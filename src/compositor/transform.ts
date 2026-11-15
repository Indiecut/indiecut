import type { ResolvedTransform } from "../engine/animatable";
import type { CompositorFit } from "./types";

export type { ResolvedTransform };

export const DEFAULT_TRANSFORM: ResolvedTransform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  uniformScale: true,
};

export function resolveTransform(
  t?: ResolvedTransform | null,
): ResolvedTransform {
  if (!t) return { ...DEFAULT_TRANSFORM };
  return {
    x: t.x ?? 0,
    y: t.y ?? 0,
    scaleX: t.scaleX ?? 1,
    scaleY: t.scaleY ?? 1,
    rotation: t.rotation ?? 0,
    uniformScale: t.uniformScale ?? true,
  };
}

export type FittedRect = {
  /** Untransformed draw size after contain/cover. */
  drawW: number;
  drawH: number;
  /** Top-left before transform (centered in frame). */
  dx: number;
  dy: number;
};

/** Base contain/cover rect for source → composition frame (no clip transform). */
export function computeFittedRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  fit: CompositorFit,
): FittedRect | null {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) return null;

  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;

  let drawW: number;
  let drawH: number;

  if (fit === "cover") {
    if (srcAspect > dstAspect) {
      drawH = dstH;
      drawW = dstH * srcAspect;
    } else {
      drawW = dstW;
      drawH = dstW / srcAspect;
    }
  } else {
    if (srcAspect > dstAspect) {
      drawW = dstW;
      drawH = dstW / srcAspect;
    } else {
      drawH = dstH;
      drawW = dstH * srcAspect;
    }
  }

  return {
    drawW,
    drawH,
    dx: (dstW - drawW) / 2,
    dy: (dstH - drawH) / 2,
  };
}

export type AlignH = "left" | "center" | "right";
export type AlignV = "top" | "middle" | "bottom";

/**
 * Project-composition pixel offsets from frame center so the scaled fitted
 * rect’s edge/center snaps to the frame. Rotation is ignored (AABB = axis box).
 *
 * With scale about the frame center, content left edge is at:
 *   frameW/2 - (drawW*scaleX)/2 + x
 * Left-align ⇒ that equals 0 ⇒ x = (drawW*scaleX)/2 - frameW/2
 *
 * After snapping, offsets are clamped so the scaled AABB keeps at least
 * `minOverlapPx` overlap with the frame (avoids “disappearing” on extreme
 * scale / pillarbox). Rotation is still ignored at align time.
 */
export function alignmentOffsets(
  fitted: FittedRect,
  transform: ResolvedTransform,
  frameW: number,
  frameH: number,
  alignH?: AlignH,
  alignV?: AlignV,
  minOverlapPx = 1,
): { x: number; y: number } {
  const scaleX = transform.scaleX;
  const scaleY =
    transform.uniformScale !== false ? transform.scaleX : transform.scaleY;
  const scaledW = fitted.drawW * scaleX;
  const scaledH = fitted.drawH * scaleY;
  const halfScaledW = scaledW / 2;
  const halfScaledH = scaledH / 2;
  const halfFrameW = frameW / 2;
  const halfFrameH = frameH / 2;

  let x = transform.x;
  let y = transform.y;

  if (alignH === "left") {
    x = halfScaledW - halfFrameW;
  } else if (alignH === "center") {
    x = 0;
  } else if (alignH === "right") {
    x = halfFrameW - halfScaledW;
  }

  if (alignV === "top") {
    y = halfScaledH - halfFrameH;
  } else if (alignV === "middle") {
    y = 0;
  } else if (alignV === "bottom") {
    y = halfFrameH - halfScaledH;
  }

  return clampAlignmentOffsets(
    x,
    y,
    scaledW,
    scaledH,
    frameW,
    frameH,
    minOverlapPx,
  );
}

/** Keep scaled AABB overlapping the frame by at least minOverlapPx. */
export function clampAlignmentOffsets(
  x: number,
  y: number,
  scaledW: number,
  scaledH: number,
  frameW: number,
  frameH: number,
  minOverlapPx = 1,
): { x: number; y: number } {
  const overlap = Math.max(0, minOverlapPx);
  const halfScaledW = scaledW / 2;
  const halfScaledH = scaledH / 2;
  const halfFrameW = frameW / 2;
  const halfFrameH = frameH / 2;

  const maxX = halfFrameW + halfScaledW - overlap;
  const minX = -halfFrameW - halfScaledW + overlap;
  const maxY = halfFrameH + halfScaledH - overlap;
  const minY = -halfFrameH - halfScaledH + overlap;

  let outX = x;
  let outY = y;
  if (minX > maxX) {
    outX = 0;
  } else {
    outX = Math.min(maxX, Math.max(minX, x));
  }
  if (minY > maxY) {
    outY = 0;
  } else {
    outY = Math.min(maxY, Math.max(minY, y));
  }

  return { x: outX, y: outY };
}

/** Compact fingerprint for preview drawKey invalidation. */
export function transformFingerprint(t?: ResolvedTransform | null): string {
  const r = resolveTransform(t);
  return `${r.x},${r.y},${r.scaleX},${r.scaleY},${r.rotation},${r.uniformScale ? 1 : 0}`;
}
