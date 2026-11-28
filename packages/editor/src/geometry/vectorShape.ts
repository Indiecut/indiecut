/**
 * Shared closed-polygon vector shapes for custom masks, text bubbles, and shape stickers.
 * Local space: center-origin, roughly ±0.5 extents.
 */

export type VectorShapePoint = { x: number; y: number };

export type VectorShapeStyle = {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity?: number;
};

export type VectorShapePreset =
  | "circle"
  | "rectangle"
  | "roundedRect"
  | "triangle"
  | "diamond"
  | "hexagon"
  | "star"
  | "heart"
  | "arrow"
  | "custom";

export const VECTOR_SHAPE_PRESETS: readonly VectorShapePreset[] = [
  "circle",
  "rectangle",
  "roundedRect",
  "triangle",
  "diamond",
  "hexagon",
  "star",
  "heart",
  "arrow",
  "custom",
] as const;

export const MIN_SHAPE_POINTS = 3;
export const DEFAULT_CIRCLE_SEGMENTS = 32;

/** Regular N-gon in center-origin ±0.5 box (approx). */
export function regularPolygon(
  sides: number,
  radius = 0.5,
  startAngle = -Math.PI / 2,
): VectorShapePoint[] {
  const n = Math.max(3, Math.floor(sides));
  const pts: VectorShapePoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = startAngle + (i / n) * Math.PI * 2;
    pts.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius });
  }
  return pts;
}

function roundedRectPolygon(
  w = 1,
  h = 1,
  r = 0.18,
  segmentsPerCorner = 4,
): VectorShapePoint[] {
  const hw = w / 2;
  const hh = h / 2;
  const cr = Math.min(r, hw, hh);
  const pts: VectorShapePoint[] = [];
  const corners: Array<{ cx: number; cy: number; a0: number }> = [
    { cx: hw - cr, cy: -hh + cr, a0: -Math.PI / 2 },
    { cx: hw - cr, cy: hh - cr, a0: 0 },
    { cx: -hw + cr, cy: hh - cr, a0: Math.PI / 2 },
    { cx: -hw + cr, cy: -hh + cr, a0: Math.PI },
  ];
  for (const c of corners) {
    for (let i = 0; i <= segmentsPerCorner; i++) {
      const t = i / segmentsPerCorner;
      const a = c.a0 + t * (Math.PI / 2);
      pts.push({ x: c.cx + Math.cos(a) * cr, y: c.cy + Math.sin(a) * cr });
    }
  }
  return pts;
}

function starPolygon(
  points = 5,
  outer = 0.5,
  inner = 0.22,
): VectorShapePoint[] {
  const pts: VectorShapePoint[] = [];
  const n = Math.max(3, points);
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? outer : inner;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}

/** Sampled heart path in ±0.5 box. */
function heartPolygon(samples = 36): VectorShapePoint[] {
  const raw: VectorShapePoint[] = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    // Classic parametric heart (unscaled)
    const x = 16 * Math.sin(t) ** 3;
    const y =
      -(
        13 * Math.cos(t) -
        5 * Math.cos(2 * t) -
        2 * Math.cos(3 * t) -
        Math.cos(4 * t)
      );
    raw.push({ x, y });
  }
  return normalizeToUnitBox(raw);
}

function arrowPolygon(): VectorShapePoint[] {
  return [
    { x: -0.5, y: -0.18 },
    { x: 0.05, y: -0.18 },
    { x: 0.05, y: -0.42 },
    { x: 0.5, y: 0 },
    { x: 0.05, y: 0.42 },
    { x: 0.05, y: 0.18 },
    { x: -0.5, y: 0.18 },
  ];
}

/** Fit points into roughly ±0.5 extents, preserving aspect. */
export function normalizeToUnitBox(
  points: VectorShapePoint[],
): VectorShapePoint[] {
  if (points.length === 0) return points;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const w = Math.max(1e-6, maxX - minX);
  const h = Math.max(1e-6, maxY - minY);
  const scale = 1 / Math.max(w, h);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return points.map((p) => ({
    x: (p.x - cx) * scale,
    y: (p.y - cy) * scale,
  }));
}

export function presetPoints(
  kind: Exclude<VectorShapePreset, "custom">,
  opts?: { circleSegments?: number },
): VectorShapePoint[] {
  switch (kind) {
    case "circle":
      return regularPolygon(
        opts?.circleSegments ?? DEFAULT_CIRCLE_SEGMENTS,
        0.5,
      );
    case "rectangle":
      return [
        { x: -0.5, y: -0.5 },
        { x: 0.5, y: -0.5 },
        { x: 0.5, y: 0.5 },
        { x: -0.5, y: 0.5 },
      ];
    case "roundedRect":
      return roundedRectPolygon(1, 1, 0.18, 4);
    case "triangle":
      return regularPolygon(3, 0.5);
    case "diamond":
      return [
        { x: 0, y: -0.5 },
        { x: 0.5, y: 0 },
        { x: 0, y: 0.5 },
        { x: -0.5, y: 0 },
      ];
    case "hexagon":
      return regularPolygon(6, 0.5);
    case "star":
      return starPolygon(5, 0.5, 0.22);
    case "heart":
      return heartPolygon(36);
    case "arrow":
      return arrowPolygon();
    default:
      return regularPolygon(DEFAULT_CIRCLE_SEGMENTS, 0.5);
  }
}

/** Ensure at least MIN_SHAPE_POINTS; pad by repeating last if needed. */
export function ensureMinPoints(
  points: VectorShapePoint[],
): VectorShapePoint[] {
  if (points.length >= MIN_SHAPE_POINTS) return points.map((p) => ({ ...p }));
  const out = points.map((p) => ({ ...p }));
  const last = out[out.length - 1] ?? { x: 0, y: 0 };
  while (out.length < MIN_SHAPE_POINTS) {
    out.push({ ...last });
  }
  return out;
}

/**
 * Resample to exactly `count` vertices by linear interpolation along the
 * closed perimeter. Used when changing topology (clears keyframes upstream).
 */
export function normalizePointCount(
  points: VectorShapePoint[],
  count: number,
): VectorShapePoint[] {
  const n = Math.max(MIN_SHAPE_POINTS, Math.floor(count));
  const src = ensureMinPoints(points);
  if (src.length === n) return src.map((p) => ({ ...p }));

  // Build closed perimeter lengths
  const closed = [...src, src[0]!];
  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < closed.length - 1; i++) {
    const a = closed[i]!;
    const b = closed[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segLens.push(len);
    total += len;
  }
  if (total < 1e-9) {
    return Array.from({ length: n }, () => ({ ...src[0]! }));
  }

  const out: VectorShapePoint[] = [];
  for (let i = 0; i < n; i++) {
    const target = (i / n) * total;
    let acc = 0;
    let chosen = false;
    for (let s = 0; s < segLens.length; s++) {
      const len = segLens[s]!;
      if (acc + len >= target || s === segLens.length - 1) {
        const t = len < 1e-9 ? 0 : (target - acc) / len;
        const a = closed[s]!;
        const b = closed[s + 1]!;
        out.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
        });
        chosen = true;
        break;
      }
      acc += len;
    }
    if (!chosen) out.push({ ...src[0]! });
  }
  return out;
}

export type CanvasPathLike = {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
};

/**
 * Build a closed path. Points are in local ±0.5 space; multiply by scaleX/Y
 * (typically half-width / half-height of the destination box).
 */
export function buildClosedPath(
  ctx: CanvasPathLike,
  points: VectorShapePoint[],
  scaleX: number,
  scaleY: number = scaleX,
): void {
  const pts = ensureMinPoints(points);
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x * scaleX, pts[0]!.y * scaleY);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i]!.x * scaleX, pts[i]!.y * scaleY);
  }
  ctx.closePath();
}

/** Map normalized ±0.5 points into an axis-aligned rect (top-left origin). */
export function pointsInRect(
  points: VectorShapePoint[],
  rect: { x: number; y: number; w: number; h: number },
): VectorShapePoint[] {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return ensureMinPoints(points).map((p) => ({
    x: cx + p.x * rect.w,
    y: cy + p.y * rect.h,
  }));
}

export function defaultShapeStyle(): VectorShapeStyle {
  return {
    fill: "#ff5a5f",
    stroke: "#ffffff",
    strokeWidth: 4,
    opacity: 1,
  };
}

/** Stable fingerprint fragment for caches. */
export function pointsFingerprint(points: VectorShapePoint[] | undefined): string {
  if (!points?.length) return "";
  return points
    .map((p) => `${Number(p.x).toFixed(4)},${Number(p.y).toFixed(4)}`)
    .join(";");
}

/**
 * Emit an SVG path `d` from ±0.5 polygon points (closed with Z).
 * Used for custom text bubbles / seeding when AI pathD is absent.
 */
export function pointsToPathD(points: VectorShapePoint[]): string {
  const pts = ensureMinPoints(points);
  const body = pts
    .map((p, i) => {
      const x = Number(p.x.toFixed(4));
      const y = Number(p.y.toFixed(4));
      return `${i === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
  return `${body} Z`;
}
