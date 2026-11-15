/**
 * Live color-key Remove BG — ClearCut-style Smart Key (weighted RGB + choke + spill).
 * Canvas2D ImageData path shared by preview + export.
 * Apply in source space after Adjust/LUT, before Transform/Mask/Blend.
 */

import type { RemoveBgColorParams, RemoveBgParams } from "../project/types";
import { DEFAULT_REMOVE_BG_COLOR } from "../project/removeBgDefaults";

/** sqrt(255^2 * 3) — max Euclidean RGB distance. */
export const MAX_RGB_DISTANCE = Math.sqrt(3 * 255 * 255);

export function resolveRemoveBgColor(
  color?: RemoveBgColorParams | null,
): RemoveBgColorParams {
  if (!color) {
    return {
      keyColor: [...DEFAULT_REMOVE_BG_COLOR.keyColor],
      tolerance: DEFAULT_REMOVE_BG_COLOR.tolerance,
      softness: DEFAULT_REMOVE_BG_COLOR.softness,
      spill: DEFAULT_REMOVE_BG_COLOR.spill,
      choke: DEFAULT_REMOVE_BG_COLOR.choke,
    };
  }
  return {
    keyColor: [
      color.keyColor?.[0] ?? 0,
      color.keyColor?.[1] ?? 255,
      color.keyColor?.[2] ?? 0,
    ],
    tolerance: color.tolerance ?? DEFAULT_REMOVE_BG_COLOR.tolerance,
    softness: color.softness ?? DEFAULT_REMOVE_BG_COLOR.softness,
    spill: color.spill ?? DEFAULT_REMOVE_BG_COLOR.spill,
    choke: color.choke ?? DEFAULT_REMOVE_BG_COLOR.choke,
  };
}

export function needsRemoveBgColor(
  params?: RemoveBgParams | null,
): params is RemoveBgParams {
  return Boolean(params?.enabled);
}

export function removeBgFingerprint(params?: RemoveBgParams | null): string {
  if (!params?.enabled) return "";
  const c = resolveRemoveBgColor(params.color);
  const [r, g, b] = c.keyColor;
  return `c:${r},${g},${b}|t${c.tolerance.toFixed(3)}|s${c.softness.toFixed(3)}|p${c.spill.toFixed(3)}|k${c.choke.toFixed(3)}`;
}

/**
 * Weighted perceptual RGB distance (ClearCut Smart Key).
 * Green weighted slightly higher — typical chroma screens.
 */
export function colorKeyDistance(
  r: number,
  g: number,
  b: number,
  keyR: number,
  keyG: number,
  keyB: number,
): number {
  const dr = r - keyR;
  const dg = g - keyG;
  const db = b - keyB;
  return Math.sqrt(dr * dr * 0.85 + dg * dg * 1.15 + db * db * 0.9);
}

/** RGB → YCbCr (BT.601) chroma channels only. */
export function rgbToCbCr(
  r: number,
  g: number,
  b: number,
): { cb: number; cr: number } {
  const cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 0.5 * r - 0.418688 * g - 0.081312 * b;
  return { cb, cr };
}

/**
 * Key alpha from absolute RGB distance: 0 = fully keyed, 1 = keep.
 * tolerance/softness are 0..1 and map to ClearCut similarity/smoothness.
 */
export function keyAlphaFromDistance(
  distance: number,
  tolerance: number,
  softness: number,
): number {
  const baseThreshold = Math.max(0, tolerance) * MAX_RGB_DISTANCE * 0.65;
  const ramp = Math.max(4, Math.max(0, softness) * MAX_RGB_DISTANCE * 0.45);
  const a = (distance - baseThreshold) / ramp;
  return Math.min(1, Math.max(0, a));
}

/** Hard edge shrink after keying (ClearCut choke). */
export function applyChoke(alpha: number, choke: number): number {
  const c = Math.min(1, Math.max(0, choke));
  if (c <= 1e-6) return alpha;
  if (alpha < c) return 0;
  return (alpha - c) / (1 - c);
}

/**
 * Green/blue-aware spill suppression on semi-transparent edges.
 * Mutates rgb in place; returns nothing.
 */
export function applyKeyedSpill(
  rgb: { r: number; g: number; b: number },
  alpha: number,
  keyR: number,
  keyG: number,
  keyB: number,
  spill: number,
): void {
  const spillFactor = Math.min(1, Math.max(0, spill));
  if (spillFactor <= 1e-4 || alpha <= 0 || alpha >= 0.98) return;

  let { r, g, b } = rgb;
  if (keyG > keyR && keyG > keyB && g > (r + b) * 0.5) {
    const avgRB = (r + b) * 0.5;
    g = g - (g - avgRB) * spillFactor;
  } else if (keyB > keyR && keyB > keyG && b > (r + g) * 0.5) {
    const avgRG = (r + g) * 0.5;
    b = b - (b - avgRG) * spillFactor;
  }
  rgb.r = r;
  rgb.g = g;
  rgb.b = b;
}

/**
 * Sample studio backdrop color from corner / side points (ClearCut Auto-Sample).
 * Expects RGBA ImageData buffer.
 */
export function autoSampleKeyColor(
  data: ArrayLike<number>,
  width: number,
  height: number,
): [number, number, number] {
  return estimateSmartKeyFromImageData(data, width, height).keyColor;
}

/**
 * ClearCut-style Smart Key auto detect from RGB samples.
 * - keyColor = mean of backdrop (corner/side) samples
 * - tolerance / softness scale from backdrop uniformity + separation vs subject samples
 */
export function estimateSmartKeyParams(args: {
  backdropSamples: Array<[number, number, number]>;
  /** Optional interior samples (subject / mid-frame) to keep tolerance below. */
  subjectSamples?: Array<[number, number, number]>;
}): RemoveBgColorParams {
  const backdrop = args.backdropSamples.filter(
    (c) =>
      Number.isFinite(c[0]) && Number.isFinite(c[1]) && Number.isFinite(c[2]),
  );
  const fallback = resolveRemoveBgColor(null);
  if (backdrop.length === 0) return fallback;

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  for (const [r, g, b] of backdrop) {
    rSum += r;
    gSum += g;
    bSum += b;
  }
  const n = backdrop.length;
  const keyColor: [number, number, number] = [
    Math.round(rSum / n),
    Math.round(gSum / n),
    Math.round(bSum / n),
  ];
  const [kr, kg, kb] = keyColor;

  let spreadSum = 0;
  let spreadMax = 0;
  for (const [r, g, b] of backdrop) {
    const d = colorKeyDistance(r, g, b, kr, kg, kb) / MAX_RGB_DISTANCE;
    spreadSum += d;
    if (d > spreadMax) spreadMax = d;
  }
  const backdropSpread = Math.max(spreadMax, spreadSum / n);

  let subjectFloor = 0.55;
  const subjects = (args.subjectSamples ?? []).filter(
    (c) =>
      Number.isFinite(c[0]) && Number.isFinite(c[1]) && Number.isFinite(c[2]),
  );
  if (subjects.length > 0) {
    let minD = Number.POSITIVE_INFINITY;
    for (const [r, g, b] of subjects) {
      const d = colorKeyDistance(r, g, b, kr, kg, kb) / MAX_RGB_DISTANCE;
      if (d < minD) minD = d;
    }
    if (Number.isFinite(minD)) subjectFloor = minD;
  }

  // Keep threshold under subject separation; widen when backdrop is noisy.
  const targetTol = Math.max(
    0.18,
    Math.min(0.58, backdropSpread * 1.85 + 0.22),
  );
  const tolerance = Math.min(
    targetTol,
    Math.max(0.16, subjectFloor * 0.72),
  );
  const softness = Math.min(
    0.42,
    Math.max(0.1, 0.12 + backdropSpread * 0.9 + tolerance * 0.15),
  );

  return {
    keyColor,
    tolerance,
    softness,
    spill: fallback.spill,
    choke: fallback.choke,
  };
}

/** UV points ClearCut uses for studio backdrop sampling (normalized). */
export function smartKeyBackdropSampleUVs(
  width: number,
  height: number,
): Array<[number, number]> {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const insetU = Math.min(0.04, 25 / w);
  const insetV = Math.min(0.04, 25 / h);
  return [
    [insetU, insetV],
    [1 - insetU, insetV],
    [insetU, 0.45],
    [1 - insetU, 0.45],
    [0.5, insetV],
    [insetU, 0.72],
    [1 - insetU, 0.72],
  ];
}

/** Interior UVs used to keep Smart Key from eating the subject. */
export function smartKeySubjectSampleUVs(): Array<[number, number]> {
  return [
    [0.5, 0.5],
    [0.42, 0.38],
    [0.58, 0.38],
    [0.5, 0.62],
  ];
}

/**
 * Full-frame Smart Key estimate (ImageData path — tests / offline).
 */
export function estimateSmartKeyFromImageData(
  data: ArrayLike<number>,
  width: number,
  height: number,
): RemoveBgColorParams {
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const sampleAt = (u: number, v: number): [number, number, number] => {
    const x = Math.min(w - 1, Math.max(0, Math.round(u * (w - 1))));
    const y = Math.min(h - 1, Math.max(0, Math.round(v * (h - 1))));
    const idx = (y * w + x) * 4;
    return [data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0];
  };
  return estimateSmartKeyParams({
    backdropSamples: smartKeyBackdropSampleUVs(w, h).map(([u, v]) =>
      sampleAt(u, v),
    ),
    subjectSamples: smartKeySubjectSampleUVs().map(([u, v]) => sampleAt(u, v)),
  });
}

/**
 * Apply color key onto an OffscreenCanvas (premultiplied-friendly straight alpha).
 */
export function applyRemoveBgColor(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  color?: RemoveBgColorParams | null,
): { canvas: OffscreenCanvas; width: number; height: number } {
  const c = resolveRemoveBgColor(color);
  const out = new OffscreenCanvas(srcW, srcH);
  const ctx = out.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { canvas: out, width: srcW, height: srcH };

  ctx.drawImage(source, 0, 0, srcW, srcH);
  const imageData = ctx.getImageData(0, 0, srcW, srcH);
  const data = imageData.data;
  const [kr, kg, kb] = c.keyColor;
  const spill = Math.min(1, Math.max(0, c.spill));
  const choke = Math.min(1, Math.max(0, c.choke));

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]!;
    let g = data[i + 1]!;
    let b = data[i + 2]!;
    const a = data[i + 3]!;
    if (a < 1) continue;

    const dist = colorKeyDistance(r, g, b, kr, kg, kb);
    let keyA = keyAlphaFromDistance(dist, c.tolerance, c.softness);
    keyA = applyChoke(keyA, choke);

    if (spill > 1e-4 && keyA > 0 && keyA < 0.98) {
      const rgb = { r, g, b };
      applyKeyedSpill(rgb, keyA, kr, kg, kb, spill);
      r = rgb.r;
      g = rgb.g;
      b = rgb.b;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }

    data[i + 3] = Math.round(a * keyA);
  }

  ctx.putImageData(imageData, 0, 0);
  return { canvas: out, width: srcW, height: srcH };
}
