/**
 * Color adjust helpers — brightness / contrast / saturation / hue + luma curve.
 * Shared by preview and export via compositor draw.
 */

import type { LumaCurvePoint, ResolvedColorAdjust } from "../project/types";

export const DEFAULT_COLOR_ADJUST: ResolvedColorAdjust = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
};

export function resolveColorAdjust(
  a?: ResolvedColorAdjust | null,
): ResolvedColorAdjust {
  if (!a) return { ...DEFAULT_COLOR_ADJUST };
  return {
    brightness: a.brightness ?? 0,
    contrast: a.contrast ?? 0,
    saturation: a.saturation ?? 0,
    hue: a.hue ?? 0,
    lumaCurve: a.lumaCurve,
  };
}

export function isIdentityAdjust(a?: ResolvedColorAdjust | null): boolean {
  if (!a) return true;
  const b = a.brightness ?? 0;
  const c = a.contrast ?? 0;
  const s = a.saturation ?? 0;
  const h = a.hue ?? 0;
  if (Math.abs(b) > 1e-4 || Math.abs(c) > 1e-4 || Math.abs(s) > 1e-4) {
    return false;
  }
  if (Math.abs(h % 360) > 1e-3) return false;
  if (a.lumaCurve && a.lumaCurve.length >= 2 && !isIdentityLumaCurve(a.lumaCurve)) {
    return false;
  }
  return true;
}

function isIdentityLumaCurve(pts: LumaCurvePoint[]): boolean {
  if (pts.length < 2) return true;
  for (const p of pts) {
    if (Math.abs(p.y - p.t) > 1e-3) return false;
  }
  return true;
}

export function adjustFingerprint(a?: ResolvedColorAdjust | null): string {
  if (isIdentityAdjust(a)) return "id";
  const r = resolveColorAdjust(a);
  const curve =
    r.lumaCurve
      ?.map((p) => `${p.t.toFixed(3)}:${p.y.toFixed(3)}`)
      .join(",") ?? "";
  return `${(r.brightness ?? 0).toFixed(3)}|${(r.contrast ?? 0).toFixed(3)}|${(r.saturation ?? 0).toFixed(3)}|${(r.hue ?? 0).toFixed(2)}|${curve}`;
}

function sampleLumaCurve(x: number, pts?: LumaCurvePoint[]): number {
  if (!pts || pts.length < 2) return x;
  const sorted = [...pts].sort((a, b) => a.t - b.t);
  const t = Math.min(1, Math.max(0, x));
  if (t <= sorted[0]!.t) return sorted[0]!.y;
  if (t >= sorted[sorted.length - 1]!.t) return sorted[sorted.length - 1]!.y;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (t < a.t || t > b.t) continue;
    const span = b.t - a.t;
    if (span < 1e-9) return a.y;
    const u = (t - a.t) / span;
    return a.y + u * (b.y - a.y);
  }
  return x;
}

function hueRotate(r: number, g: number, b: number, degrees: number): [number, number, number] {
  const rad = ((degrees % 360) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Approximate CSS hue-rotate matrix
  const nr =
    (0.213 + cos * 0.787 - sin * 0.213) * r +
    (0.715 - cos * 0.715 - sin * 0.715) * g +
    (0.072 - cos * 0.072 + sin * 0.928) * b;
  const ng =
    (0.213 - cos * 0.213 + sin * 0.143) * r +
    (0.715 + cos * 0.285 + sin * 0.14) * g +
    (0.072 - cos * 0.072 - sin * 0.283) * b;
  const nb =
    (0.213 - cos * 0.213 - sin * 0.787) * r +
    (0.715 - cos * 0.715 + sin * 0.715) * g +
    (0.072 + cos * 0.928 + sin * 0.072) * b;
  return [nr, ng, nb];
}

/**
 * Apply color adjust onto an OffscreenCanvas.
 * Callers should skip via needsColorAdjust for identity.
 */
export function applyColorAdjust(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  adjust?: ResolvedColorAdjust | null,
): { canvas: OffscreenCanvas; width: number; height: number } {
  const r = resolveColorAdjust(adjust);
  const out = new OffscreenCanvas(srcW, srcH);
  const ctx = out.getContext("2d");
  if (!ctx) return { canvas: out, width: srcW, height: srcH };

  ctx.drawImage(source, 0, 0, srcW, srcH);
  const imageData = ctx.getImageData(0, 0, srcW, srcH);
  const data = imageData.data;

  const brightness = r.brightness ?? 0; // -1..1 → add to channel
  const contrast = r.contrast ?? 0; // -1..1 → scale around 0.5
  const saturation = r.saturation ?? 0; // -1..1
  const hue = r.hue ?? 0;
  const contrastFactor = Math.tan(((contrast + 1) * Math.PI) / 4);
  const satFactor = saturation + 1;

  for (let i = 0; i < data.length; i += 4) {
    let rr = data[i]! / 255;
    let gg = data[i + 1]! / 255;
    let bb = data[i + 2]! / 255;

    // Brightness
    rr += brightness;
    gg += brightness;
    bb += brightness;

    // Contrast around mid-gray
    rr = (rr - 0.5) * contrastFactor + 0.5;
    gg = (gg - 0.5) * contrastFactor + 0.5;
    bb = (bb - 0.5) * contrastFactor + 0.5;

    // Saturation
    const luma = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
    rr = luma + (rr - luma) * satFactor;
    gg = luma + (gg - luma) * satFactor;
    bb = luma + (bb - luma) * satFactor;

    // Hue
    if (Math.abs(hue) > 1e-3) {
      [rr, gg, bb] = hueRotate(rr, gg, bb, hue);
    }

    // Luma curve — remap luminance, preserve chroma ratios lightly
    if (r.lumaCurve && r.lumaCurve.length >= 2) {
      const y = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
      const y2 = sampleLumaCurve(Math.min(1, Math.max(0, y)), r.lumaCurve);
      if (y > 1e-6) {
        const scale = y2 / y;
        rr *= scale;
        gg *= scale;
        bb *= scale;
      } else {
        rr = gg = bb = y2;
      }
    }

    data[i] = Math.min(255, Math.max(0, Math.round(rr * 255)));
    data[i + 1] = Math.min(255, Math.max(0, Math.round(gg * 255)));
    data[i + 2] = Math.min(255, Math.max(0, Math.round(bb * 255)));
  }

  ctx.putImageData(imageData, 0, 0);
  return { canvas: out, width: srcW, height: srcH };
}

/** Optimize: skip pixel pass when identity — blit uses source directly. */
export function needsColorAdjust(a?: ResolvedColorAdjust | null): boolean {
  return !isIdentityAdjust(a);
}
