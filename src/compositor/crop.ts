/** Normalized source-space crop (0–1). Missing / full-frame means no crop. */

import type { CropRect } from "../project/types";

export type { CropRect };

export const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };

const MIN_NORM = 1e-4;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** True when crop covers (essentially) the full source. */
export function isFullCrop(crop: CropRect | null | undefined): boolean {
  if (!crop) return true;
  return (
    crop.x <= MIN_NORM &&
    crop.y <= MIN_NORM &&
    crop.width >= 1 - MIN_NORM &&
    crop.height >= 1 - MIN_NORM
  );
}

/**
 * Clamp + normalize a crop rect. Returns undefined for full-frame / invalid
 * so callers can omit the field from persistence.
 */
export function normalizeCrop(raw: unknown): CropRect | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const x = typeof o.x === "number" && Number.isFinite(o.x) ? o.x : NaN;
  const y = typeof o.y === "number" && Number.isFinite(o.y) ? o.y : NaN;
  const width =
    typeof o.width === "number" && Number.isFinite(o.width) ? o.width : NaN;
  const height =
    typeof o.height === "number" && Number.isFinite(o.height) ? o.height : NaN;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return undefined;
  }

  let nx = clamp01(x);
  let ny = clamp01(y);
  let nw = clamp01(width);
  let nh = clamp01(height);

  // Ensure the rect stays inside the unit square.
  if (nx + nw > 1) nw = 1 - nx;
  if (ny + nh > 1) nh = 1 - ny;

  if (nw < MIN_NORM || nh < MIN_NORM) return undefined;

  const crop: CropRect = { x: nx, y: ny, width: nw, height: nh };
  if (isFullCrop(crop)) return undefined;
  return crop;
}

/** Resolve crop to pixel source rect (inclusive of clamp). */
export function cropToSourcePixels(
  crop: CropRect | null | undefined,
  srcW: number,
  srcH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const w = Math.max(1, srcW);
  const h = Math.max(1, srcH);
  if (isFullCrop(crop) || !crop) {
    return { sx: 0, sy: 0, sw: w, sh: h };
  }
  let sx = Math.round(crop.x * w);
  let sy = Math.round(crop.y * h);
  let sw = Math.round(crop.width * w);
  let sh = Math.round(crop.height * h);
  sx = Math.min(Math.max(0, sx), w - 1);
  sy = Math.min(Math.max(0, sy), h - 1);
  sw = Math.min(Math.max(1, sw), w - sx);
  sh = Math.min(Math.max(1, sh), h - sy);
  return { sx, sy, sw, sh };
}

/** Effective source size after crop (for fit / selection geometry). */
export function effectiveSourceSize(
  srcW: number,
  srcH: number,
  crop: CropRect | null | undefined,
): { width: number; height: number } {
  const { sw, sh } = cropToSourcePixels(crop, srcW, srcH);
  return { width: sw, height: sh };
}

/** Map UV in cropped space → UV in full source space. */
export function croppedUvToSourceUv(
  u: number,
  v: number,
  crop: CropRect | null | undefined,
): { u: number; v: number } {
  if (isFullCrop(crop) || !crop) return { u, v };
  return {
    u: crop.x + u * crop.width,
    v: crop.y + v * crop.height,
  };
}

export function cropFingerprint(crop: CropRect | null | undefined): string {
  if (isFullCrop(crop) || !crop) return "";
  return `${crop.x.toFixed(4)},${crop.y.toFixed(4)},${crop.width.toFixed(4)},${crop.height.toFixed(4)}`;
}

let cropScratch: {
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
} | null = null;

/**
 * Crop `source` into a scratch canvas. Returns original source when crop is
 * full-frame. Caller must treat returned canvas as transient (reused).
 */
export function applyCropToCanvas(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  crop: CropRect | null | undefined,
): { canvas: CanvasImageSource; width: number; height: number } {
  if (isFullCrop(crop) || !crop) {
    return { canvas: source, width: srcW, height: srcH };
  }
  const { sx, sy, sw, sh } = cropToSourcePixels(crop, srcW, srcH);
  if (
    !cropScratch ||
    cropScratch.canvas.width !== sw ||
    cropScratch.canvas.height !== sh
  ) {
    const canvas = new OffscreenCanvas(sw, sh);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Crop scratch 2D unavailable");
    cropScratch = { canvas, ctx };
  }
  const { canvas, ctx } = cropScratch;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, sw, sh);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return { canvas, width: sw, height: sh };
}
