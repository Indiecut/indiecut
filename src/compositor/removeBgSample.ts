/**
 * Map a layout-space click to source UV for Remove BG eyedropper.
 * Inverts the same fit + transform + crop used by compositor.drawTransformed.
 */

import type { ResolvedTransform } from "../engine/animatable";
import type { CropRect } from "../project/types";
import {
  cropToSourcePixels,
  croppedUvToSourceUv,
  isFullCrop,
} from "./crop";
import { computeFittedRect, resolveTransform } from "./transform";
import type { CompositorFit } from "./types";

export function layoutPointToSourceUV(args: {
  layoutX: number;
  layoutY: number;
  layoutW: number;
  layoutH: number;
  srcW: number;
  srcH: number;
  fit: CompositorFit;
  transform?: ResolvedTransform | null;
  crop?: CropRect | null;
}): { u: number; v: number } | null {
  const {
    layoutX,
    layoutY,
    layoutW,
    layoutH,
    srcW,
    srcH,
    fit,
    transform,
    crop,
  } = args;
  if (layoutW <= 0 || layoutH <= 0 || srcW <= 0 || srcH <= 0) return null;

  const { sw, sh } = cropToSourcePixels(crop, srcW, srcH);
  const fitted = computeFittedRect(sw, sh, layoutW, layoutH, fit);
  if (!fitted || fitted.drawW < 1e-6 || fitted.drawH < 1e-6) return null;

  const t = resolveTransform(transform);
  const scaleX = t.uniformScale !== false ? t.scaleX : t.scaleX;
  const scaleY = t.uniformScale !== false ? t.scaleX : t.scaleY;
  if (Math.abs(scaleX) < 1e-8 || Math.abs(scaleY) < 1e-8) return null;

  const cx = layoutW / 2;
  const cy = layoutH / 2;
  const ox = t.x;
  const oy = t.y;
  const rad = (t.rotation * Math.PI) / 180;

  // Inverse of: T(cx+ox, cy+oy) · R · S · T(-cx, -cy)
  let x = layoutX - (cx + ox);
  let y = layoutY - (cy + oy);
  const c = Math.cos(-rad);
  const s = Math.sin(-rad);
  const rx = x * c - y * s;
  const ry = x * s + y * c;
  x = rx / scaleX + cx;
  y = ry / scaleY + cy;

  const uCrop = (x - fitted.dx) / fitted.drawW;
  const vCrop = (y - fitted.dy) / fitted.drawH;
  if (uCrop < 0 || uCrop > 1 || vCrop < 0 || vCrop > 1) return null;

  const mapped = croppedUvToSourceUv(uCrop, vCrop, crop);
  if (isFullCrop(crop)) return mapped;
  if (mapped.u < 0 || mapped.u > 1 || mapped.v < 0 || mapped.v > 1) return null;
  return mapped;
}
