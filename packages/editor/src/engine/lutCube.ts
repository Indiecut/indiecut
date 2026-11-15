/**
 * Parse and apply industry-standard .cube 3D LUTs (trilinear + strength lerp).
 * Pure CPU path shared by preview worker and export.
 */

export type CubeLut = {
  title: string;
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  /** Flat RGB triples, index = ((b * size + g) * size + r) * 3 */
  data: Float32Array;
};

const lutCache = new Map<string, CubeLut>();

export function cacheLut(key: string, lut: CubeLut): void {
  lutCache.set(key, lut);
}

export function getCachedLut(key: string): CubeLut | undefined {
  return lutCache.get(key);
}

export function clearLutCache(): void {
  lutCache.clear();
}

export function parseCubeLut(text: string): CubeLut {
  const lines = text.split(/\r?\n/);
  let title = "";
  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const values: number[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("TITLE")) {
      const m = line.match(/TITLE\s+"?(.*?)"?\s*$/i);
      title = m?.[1] ?? "";
      continue;
    }
    if (line.startsWith("LUT_3D_SIZE")) {
      const parts = line.split(/\s+/);
      size = Number(parts[1]);
      continue;
    }
    if (line.startsWith("DOMAIN_MIN")) {
      const parts = line.split(/\s+/).slice(1).map(Number);
      domainMin = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
      continue;
    }
    if (line.startsWith("DOMAIN_MAX")) {
      const parts = line.split(/\s+/).slice(1).map(Number);
      domainMax = [parts[0] ?? 1, parts[1] ?? 1, parts[2] ?? 1];
      continue;
    }
    if (line.startsWith("LUT_1D_SIZE") || line.startsWith("LUT_3D_INPUT_RANGE")) {
      continue;
    }
    const nums = line.split(/\s+/).map(Number);
    if (nums.length >= 3 && nums.every((n) => Number.isFinite(n))) {
      values.push(nums[0]!, nums[1]!, nums[2]!);
    }
  }

  if (!Number.isFinite(size) || size < 2) {
    throw new Error("Invalid .cube: missing LUT_3D_SIZE");
  }
  const expected = size * size * size * 3;
  if (values.length < expected) {
    throw new Error(
      `Invalid .cube: expected ${expected} floats, got ${values.length}`,
    );
  }

  return {
    title,
    size,
    domainMin,
    domainMax,
    data: new Float32Array(values.slice(0, expected)),
  };
}

function sampleLattice(
  lut: CubeLut,
  ri: number,
  gi: number,
  bi: number,
): [number, number, number] {
  const s = lut.size;
  const r = Math.min(s - 1, Math.max(0, ri));
  const g = Math.min(s - 1, Math.max(0, gi));
  const b = Math.min(s - 1, Math.max(0, bi));
  const idx = ((b * s + g) * s + r) * 3;
  return [lut.data[idx]!, lut.data[idx + 1]!, lut.data[idx + 2]!];
}

/** Trilinear lookup in 0–1 RGB space. */
export function lookupLut(
  lut: CubeLut,
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const s = lut.size - 1;
  const [dMinR, dMinG, dMinB] = lut.domainMin;
  const [dMaxR, dMaxG, dMaxB] = lut.domainMax;
  const nr = ((r - dMinR) / (dMaxR - dMinR || 1)) * s;
  const ng = ((g - dMinG) / (dMaxG - dMinG || 1)) * s;
  const nb = ((b - dMinB) / (dMaxB - dMinB || 1)) * s;

  const r0 = Math.floor(nr);
  const g0 = Math.floor(ng);
  const b0 = Math.floor(nb);
  const r1 = Math.min(s, r0 + 1);
  const g1 = Math.min(s, g0 + 1);
  const b1 = Math.min(s, b0 + 1);
  const fr = nr - r0;
  const fg = ng - g0;
  const fb = nb - b0;

  const c000 = sampleLattice(lut, r0, g0, b0);
  const c100 = sampleLattice(lut, r1, g0, b0);
  const c010 = sampleLattice(lut, r0, g1, b0);
  const c110 = sampleLattice(lut, r1, g1, b0);
  const c001 = sampleLattice(lut, r0, g0, b1);
  const c101 = sampleLattice(lut, r1, g0, b1);
  const c011 = sampleLattice(lut, r0, g1, b1);
  const c111 = sampleLattice(lut, r1, g1, b1);

  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const c00 = c000[i]! * (1 - fr) + c100[i]! * fr;
    const c10 = c010[i]! * (1 - fr) + c110[i]! * fr;
    const c01 = c001[i]! * (1 - fr) + c101[i]! * fr;
    const c11 = c011[i]! * (1 - fr) + c111[i]! * fr;
    const c0 = c00 * (1 - fg) + c10 * fg;
    const c1 = c01 * (1 - fg) + c11 * fg;
    out[i] = c0 * (1 - fb) + c1 * fb;
  }
  return out;
}

export type LutApplyResult = {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  width: number;
  height: number;
};

function createWorkCanvas(
  width: number,
  height: number,
): {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
} {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("OffscreenCanvas 2d unavailable");
    return { canvas, ctx };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d unavailable");
  return { canvas, ctx };
}

/**
 * Apply LUT to a source image with strength 0–1 (lerp original → LUT).
 * Returns a new canvas; strength ≤ 0 returns a copy of the source.
 */
export function applyLut(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  lut: CubeLut,
  strength = 1,
): LutApplyResult {
  const { canvas, ctx } = createWorkCanvas(srcW, srcH);
  ctx.drawImage(source, 0, 0, srcW, srcH);
  const s = Math.min(1, Math.max(0, strength));
  if (s <= 1e-4) {
    return { canvas, width: srcW, height: srcH };
  }

  const image = ctx.getImageData(0, 0, srcW, srcH);
  const d = image.data;
  const inv = 1 - s;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]! / 255;
    const g = d[i + 1]! / 255;
    const b = d[i + 2]! / 255;
    const [lr, lg, lb] = lookupLut(lut, r, g, b);
    d[i] = Math.round((r * inv + lr * s) * 255);
    d[i + 1] = Math.round((g * inv + lg * s) * 255);
    d[i + 2] = Math.round((b * inv + lb * s) * 255);
  }
  ctx.putImageData(image, 0, 0);
  return { canvas, width: srcW, height: srcH };
}

export function needsLut(
  filter?: { lutId?: string; strength?: number } | null,
): boolean {
  if (!filter?.lutId) return false;
  return (filter.strength ?? 1) > 1e-4;
}
