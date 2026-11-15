/**
 * Speed remapping — timeline local T → source local s(T) = ∫ v(t) dt.
 * See documents/EDITOR_MATH.md §1.
 */

import type { SpeedCurve, SpeedFrameMode, SpeedKeyframe } from "../project/types";

export const SPEED_MIN = 0.1;
/** Graph top — see speed_curve_design.png */
export const SPEED_MAX = 10;

const DEFAULT_CONSTANT = 1;

export function resolveSpeedCurve(curve?: SpeedCurve | null): SpeedCurve {
  if (!curve) {
    return { mode: "constant", constant: DEFAULT_CONSTANT, frameMode: "nearest" };
  }
  return {
    mode: curve.mode === "curve" ? "curve" : "constant",
    constant: clampSpeed(curve.constant ?? DEFAULT_CONSTANT),
    keyframes: curve.keyframes,
    frameMode: curve.frameMode === "blend" ? "blend" : "nearest",
    presetId: curve.presetId,
  };
}

export function clampSpeed(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_CONSTANT;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, v));
}

export function resolveFrameMode(curve?: SpeedCurve | null): SpeedFrameMode {
  return curve?.frameMode === "blend" ? "blend" : "nearest";
}

/** Default two-point curve at 1×. */
export function defaultSpeedKeyframes(): SpeedKeyframe[] {
  return [
    { t: 0, v: 1, outHandle: { dt: 0.15, dv: 0 } },
    { t: 1, v: 1, inHandle: { dt: -0.15, dv: 0 } },
  ];
}

function sortedKeys(curve: SpeedCurve): SpeedKeyframe[] {
  const raw =
    curve.keyframes && curve.keyframes.length >= 2
      ? curve.keyframes
      : defaultSpeedKeyframes();
  return [...raw]
    .map((k) => ({
      ...k,
      t: Math.min(1, Math.max(0, k.t)),
      v: clampSpeed(k.v),
    }))
    .sort((a, b) => a.t - b.t);
}

/**
 * Evaluate cubic Bézier y for parameter u in [0,1] given endpoints and handles.
 * Uses De Casteljau on (t,v) — samples by solving for u where Bezier.t ≈ tNorm.
 */
function bezierPoint(
  p0: { t: number; v: number },
  p1: { t: number; v: number },
  p2: { t: number; v: number },
  p3: { t: number; v: number },
  u: number,
): { t: number; v: number } {
  const mt = 1 - u;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const u2 = u * u;
  const u3 = u2 * u;
  return {
    t:
      mt3 * p0.t +
      3 * mt2 * u * p1.t +
      3 * mt * u2 * p2.t +
      u3 * p3.t,
    v:
      mt3 * p0.v +
      3 * mt2 * u * p1.v +
      3 * mt * u2 * p2.v +
      u3 * p3.v,
  };
}

function segmentControls(a: SpeedKeyframe, b: SpeedKeyframe) {
  const out = a.outHandle ?? { dt: (b.t - a.t) / 3, dv: 0 };
  const inn = b.inHandle ?? { dt: (a.t - b.t) / 3, dv: 0 };
  const p0 = { t: a.t, v: a.v };
  const p1 = {
    t: Math.min(1, Math.max(0, a.t + out.dt)),
    v: clampSpeed(a.v + out.dv),
  };
  const p2 = {
    t: Math.min(1, Math.max(0, b.t + inn.dt)),
    v: clampSpeed(b.v + inn.dv),
  };
  const p3 = { t: b.t, v: b.v };
  return { p0, p1, p2, p3 };
}

/** Instantaneous speed multiplier at normalized timeline position. */
export function sampleSpeed(tNorm: number, curve?: SpeedCurve | null): number {
  const c = resolveSpeedCurve(curve);
  if (c.mode === "constant") {
    return clampSpeed(c.constant ?? DEFAULT_CONSTANT);
  }
  const t = Math.min(1, Math.max(0, tNorm));
  const keys = sortedKeys(c);
  if (t <= keys[0]!.t) return keys[0]!.v;
  if (t >= keys[keys.length - 1]!.t) return keys[keys.length - 1]!.v;

  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (t < a.t || t > b.t) continue;
    if (Math.abs(b.t - a.t) < 1e-9) return a.v;

    const { p0, p1, p2, p3 } = segmentControls(a, b);
    // Binary search u so bezier.t ≈ t
    let lo = 0;
    let hi = 1;
    let best = a.v;
    for (let iter = 0; iter < 24; iter++) {
      const mid = (lo + hi) / 2;
      const pt = bezierPoint(p0, p1, p2, p3, mid);
      best = pt.v;
      if (pt.t < t) lo = mid;
      else hi = mid;
    }
    return clampSpeed(best);
  }
  return DEFAULT_CONSTANT;
}

export type RemapLut = {
  /** Timeline local ms samples */
  timelineMs: Float64Array;
  /** Corresponding source-local ms (from clip in-point) */
  sourceMs: Float64Array;
};

/**
 * Build timeline→source LUT by integrating v over [0, durationMs].
 * Sample step defaults to ~1 frame or 1ms, whichever is coarser-safe.
 */
export function buildRemapLut(
  curve: SpeedCurve | null | undefined,
  durationMs: number,
  fps = 30,
): RemapLut {
  const dur = Math.max(0, durationMs);
  const stepMs = Math.max(1, 1000 / Math.max(1, fps));
  const count = Math.max(2, Math.ceil(dur / stepMs) + 1);
  const timelineMs = new Float64Array(count);
  const sourceMs = new Float64Array(count);

  let s = 0;
  for (let i = 0; i < count; i++) {
    const T = Math.min(dur, i * stepMs);
    timelineMs[i] = T;
    sourceMs[i] = s;
    if (i < count - 1) {
      const tNorm = dur > 0 ? T / dur : 0;
      const v = sampleSpeed(tNorm, curve);
      const nextT = Math.min(dur, (i + 1) * stepMs);
      s += v * (nextT - T);
    }
  }
  // Ensure last sample lands at exact duration
  timelineMs[count - 1] = dur;
  return { timelineMs, sourceMs };
}

function lerpLut(lut: RemapLut, localMs: number): number {
  const { timelineMs, sourceMs } = lut;
  const n = timelineMs.length;
  if (n === 0) return 0;
  if (localMs <= timelineMs[0]!) return sourceMs[0]!;
  if (localMs >= timelineMs[n - 1]!) return sourceMs[n - 1]!;

  // Binary search
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (timelineMs[mid]! <= localMs) lo = mid;
    else hi = mid;
  }
  const t0 = timelineMs[lo]!;
  const t1 = timelineMs[hi]!;
  const s0 = sourceMs[lo]!;
  const s1 = sourceMs[hi]!;
  if (t1 <= t0) return s0;
  const u = (localMs - t0) / (t1 - t0);
  return s0 + u * (s1 - s0);
}

const lutCache = new WeakMap<object, { key: string; lut: RemapLut }>();

function lutCacheKey(
  curve: SpeedCurve,
  durationMs: number,
  fps: number,
): string {
  const keys =
    curve.mode === "curve" && curve.keyframes
      ? curve.keyframes
          .map(
            (k) =>
              `${k.t.toFixed(4)}:${k.v.toFixed(3)}:${k.outHandle?.dt ?? 0}:${k.outHandle?.dv ?? 0}:${k.inHandle?.dt ?? 0}:${k.inHandle?.dv ?? 0}`,
          )
          .join("|")
      : "";
  return `${curve.mode}:${curve.constant ?? 1}:${durationMs}:${fps}:${keys}`;
}

function getLut(
  curve: SpeedCurve | null | undefined,
  durationMs: number,
  fps: number,
): RemapLut {
  const resolved = resolveSpeedCurve(curve);
  if (resolved.mode === "constant") {
    // Fast path — no need to cache
    const v = clampSpeed(resolved.constant ?? DEFAULT_CONSTANT);
    const timelineMs = new Float64Array([0, Math.max(0, durationMs)]);
    const sourceMs = new Float64Array([0, v * Math.max(0, durationMs)]);
    return { timelineMs, sourceMs };
  }
  const key = lutCacheKey(resolved, durationMs, fps);
  const cacheObj = curve ?? resolved;
  const cached = lutCache.get(cacheObj);
  if (cached && cached.key === key) return cached.lut;
  const lut = buildRemapLut(resolved, durationMs, fps);
  lutCache.set(cacheObj, { key, lut });
  return lut;
}

/**
 * Map clip-local timeline ms → source-local ms (add clip.inMs for file time).
 */
export function remapLocalMs(
  localMs: number,
  curve: SpeedCurve | null | undefined,
  durationMs: number,
  fps = 30,
): number {
  const dur = Math.max(0, durationMs);
  const local = Math.min(dur, Math.max(0, localMs));
  const c = resolveSpeedCurve(curve);
  if (c.mode === "constant") {
    return clampSpeed(c.constant ?? DEFAULT_CONSTANT) * local;
  }
  return lerpLut(getLut(c, dur, fps), local);
}

/**
 * Absolute media source time for a clip-local timeline position.
 * Applies speed remap, then flips within [inMs, outMs] when reversed.
 */
export function sourceMsAtLocal(
  clip: {
    inMs: number;
    outMs: number;
    durationMs: number;
    speed?: SpeedCurve | null;
    reversed?: boolean;
  },
  localMs: number,
  fps = 30,
): number {
  const span = Math.max(0, clip.outMs - clip.inMs);
  let sourceLocal = remapLocalMs(localMs, clip.speed, clip.durationMs, fps);
  if (clip.reversed) {
    sourceLocal = span - sourceLocal;
  }
  return clip.inMs + sourceLocal;
}

/**
 * Timeline duration that consumes exactly `sourceSpanMs` of source
 * (preserves in/out; changing speed changes duration).
 */
export function timelineDurationForSpeed(
  sourceSpanMs: number,
  curve?: SpeedCurve | null,
): number {
  const span = Math.max(0, sourceSpanMs);
  const c = resolveSpeedCurve(curve);
  if (c.mode === "constant") {
    const v = clampSpeed(c.constant ?? DEFAULT_CONSTANT);
    return Math.max(1, Math.round(span / v));
  }

  // Average speed over normalized curve: integrate v(t) dt over [0,1], then
  // durationMs = span / avgSpeed where avgSpeed = ∫_0^1 v(u) du.
  const steps = 256;
  let integral = 0;
  for (let i = 0; i < steps; i++) {
    const u0 = i / steps;
    const u1 = (i + 1) / steps;
    const v0 = sampleSpeed(u0, c);
    const v1 = sampleSpeed(u1, c);
    integral += 0.5 * (v0 + v1) * (u1 - u0);
  }
  const avg = Math.max(SPEED_MIN, integral);
  return Math.max(1, Math.round(span / avg));
}

/** Nearest source ms for fractional frame synthesis. */
export function nearestSourceMs(sourceMs: number, fps: number): number {
  const frame = Math.round((sourceMs / 1000) * fps);
  return (frame / fps) * 1000;
}

/** Floor/ceil source times + blend factor for frame blending. */
export function blendSourcePair(
  sourceMs: number,
  fps: number,
): { aMs: number; bMs: number; alpha: number } {
  const frameF = (sourceMs / 1000) * fps;
  const floor = Math.floor(frameF);
  const ceil = Math.ceil(frameF);
  const alpha = frameF - floor;
  return {
    aMs: (floor / fps) * 1000,
    bMs: (ceil / fps) * 1000,
    alpha: Math.min(1, Math.max(0, alpha)),
  };
}
