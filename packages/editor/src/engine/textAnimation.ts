/**
 * Pure text In / Out / Loop sampling — preview and export share this path.
 * See documents/PRESETS.md §3. Never reads Date.now() / performance.now().
 */

import type {
  TextAnimDirection,
  TextAnimationGranularity,
  TextAnimationParams,
  TextAnimPhase,
} from "../project/types";

export const DEFAULT_PHASE_MS = 500;
export const MIN_PHASE_MS = 100;
export const MAX_PHASE_MS = 2000;

export type TextPhaseKind = "in" | "hold" | "out" | "outside";

export type TextPhaseAt =
  | { phase: "in"; progress: number; phaseDurMs: number }
  | { phase: "hold"; holdMs: number; holdDurMs: number }
  | { phase: "out"; progress: number; phaseDurMs: number }
  | { phase: "outside" };

export type TextAnimUnitState = {
  opacity: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  blurPx: number;
  /** 0..1 — typewriter partial reveal within the unit (1 = fully visible). */
  visibleFraction: number;
};

export type TextAnimBounds = {
  blockW: number;
  blockH: number;
  stageW: number;
  stageH: number;
};

const IDENTITY: TextAnimUnitState = {
  opacity: 1,
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  blurPx: 0,
  visibleFraction: 1,
};

/** Resolve aliases to canonical preset ids. */
export function canonicalPresetId(presetId: string | undefined | null): string {
  if (!presetId || presetId === "none") return "none";
  if (presetId === "bounce") return "pop_up";
  if (presetId === "shake") return "jiggle";
  return presetId;
}

export function isActivePreset(presetId: string | undefined | null): boolean {
  return canonicalPresetId(presetId) !== "none";
}

export function hasActiveTextAnimation(
  anim?: TextAnimationParams | null,
): boolean {
  if (!anim) return false;
  return (
    isActivePreset(anim.in?.presetId) ||
    isActivePreset(anim.out?.presetId) ||
    isActivePreset(anim.loop?.presetId)
  );
}

export function resolveGranularity(
  anim?: TextAnimationParams | null,
): TextAnimationGranularity {
  const g = anim?.granularity;
  if (g === "line" || g === "word" || g === "character") return g;
  return "whole";
}

export function clampPhaseMs(ms: number | undefined, fallback = DEFAULT_PHASE_MS): number {
  if (ms === undefined || !Number.isFinite(ms)) return fallback;
  return Math.min(MAX_PHASE_MS, Math.max(MIN_PHASE_MS, ms));
}

/** Clamp in+out so they fit inside clip duration (proportional shrink). */
export function resolvePhaseDurations(
  clipDurMs: number,
  anim?: TextAnimationParams | null,
): { inDurMs: number; outDurMs: number } {
  const dur = Math.max(0, clipDurMs);
  let inDur = isActivePreset(anim?.in?.presetId)
    ? clampPhaseMs(anim?.in?.durationMs)
    : 0;
  let outDur = isActivePreset(anim?.out?.presetId)
    ? clampPhaseMs(anim?.out?.durationMs)
    : 0;
  if (inDur + outDur > dur && inDur + outDur > 0) {
    const scale = dur / (inDur + outDur);
    inDur = Math.floor(inDur * scale);
    outDur = Math.max(0, dur - inDur);
  }
  return { inDurMs: inDur, outDurMs: outDur };
}

export function textPhaseAt(
  localMs: number,
  clipDurMs: number,
  anim?: TextAnimationParams | null,
): TextPhaseAt {
  const dur = Math.max(0, clipDurMs);
  if (localMs < 0 || localMs > dur) return { phase: "outside" };
  const { inDurMs, outDurMs } = resolvePhaseDurations(dur, anim);
  const outStart = Math.max(inDurMs, dur - outDurMs);

  if (inDurMs > 0 && localMs < inDurMs) {
    return {
      phase: "in",
      progress: clamp01(localMs / inDurMs),
      phaseDurMs: inDurMs,
    };
  }
  if (outDurMs > 0 && localMs >= outStart) {
    const elapsed = localMs - outStart;
    return {
      phase: "out",
      progress: clamp01(elapsed / outDurMs),
      phaseDurMs: outDurMs,
    };
  }
  const holdStart = inDurMs;
  const holdDur = Math.max(0, outStart - holdStart);
  return {
    phase: "hold",
    holdMs: Math.max(0, localMs - holdStart),
    holdDurMs: holdDur,
  };
}

/** Split content into animation units (no measure — compositor adds layout). */
export function splitTextUnits(
  content: string,
  granularity: TextAnimationGranularity,
): string[] {
  const text = content ?? "";
  if (!text) return [""];
  if (granularity === "whole") return [text];
  if (granularity === "line") {
    const lines = text.split("\n");
    return lines.length > 0 ? lines : [""];
  }
  if (granularity === "word") {
    const units: string[] = [];
    const lines = text.split("\n");
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]!;
      const parts = line.split(/(\s+)/);
      for (const p of parts) {
        if (p.length === 0) continue;
        units.push(p);
      }
      if (li < lines.length - 1) units.push("\n");
    }
    return units.length > 0 ? units : [""];
  }
  // character
  return Array.from(text);
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

function easeInCubic(t: number): number {
  const u = clamp01(t);
  return u * u * u;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Deterministic pseudo-noise in [-1, 1] from integer seeds. */
function hashNoise(a: number, b: number): number {
  let n = (a | 0) * 374761393 + (b | 0) * 668265263;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return ((n & 0xffff) / 0x8000) - 1;
}

function resolveDirection(phase?: TextAnimPhase | null): TextAnimDirection {
  const d = phase?.direction;
  if (d === "left" || d === "right" || d === "up" || d === "down") return d;
  return "up";
}

function slideOffset(
  direction: TextAnimDirection,
  amount: number,
  bounds: TextAnimBounds,
): { x: number; y: number } {
  const dx = Math.max(bounds.blockW, bounds.stageW * 0.35, 80);
  const dy = Math.max(bounds.blockH, bounds.stageH * 0.35, 80);
  switch (direction) {
    case "left":
      return { x: -dx * amount, y: 0 };
    case "right":
      return { x: dx * amount, y: 0 };
    case "down":
      return { x: 0, y: dy * amount };
    case "up":
    default:
      return { x: 0, y: -dy * amount };
  }
}

function mulState(
  a: TextAnimUnitState,
  b: TextAnimUnitState,
): TextAnimUnitState {
  return {
    opacity: a.opacity * b.opacity,
    x: a.x + b.x,
    y: a.y + b.y,
    scaleX: a.scaleX * b.scaleX,
    scaleY: a.scaleY * b.scaleY,
    rotation: a.rotation + b.rotation,
    blurPx: a.blurPx + b.blurPx,
    visibleFraction: a.visibleFraction * b.visibleFraction,
  };
}

function sampleInPreset(
  presetId: string,
  progress: number,
  phase: TextAnimPhase | undefined,
  bounds: TextAnimBounds,
): TextAnimUnitState {
  const id = canonicalPresetId(presetId);
  const p = clamp01(progress);
  const e = easeOutCubic(p);

  switch (id) {
    case "fade_in":
      return { ...IDENTITY, opacity: e };
    case "pop_up": {
      // 0 → 1.2 → 1
      let scale: number;
      if (p < 0.7) {
        scale = lerp(0, 1.2, easeOutCubic(p / 0.7));
      } else {
        scale = lerp(1.2, 1, (p - 0.7) / 0.3);
      }
      return { ...IDENTITY, opacity: e, scaleX: scale, scaleY: scale };
    }
    case "zoom_in": {
      const scale = lerp(2.2, 1, e);
      return {
        ...IDENTITY,
        opacity: e,
        scaleX: scale,
        scaleY: scale,
        blurPx: lerp(8, 0, e),
      };
    }
    case "bounce_in": {
      // Drop from above with squash / stretch.
      let y: number;
      let scaleY: number;
      let scaleX: number;
      if (p < 0.55) {
        const t = easeOutCubic(p / 0.55);
        y = lerp(-90, 0, t);
        scaleY = lerp(1.35, 0.85, t);
        scaleX = lerp(0.85, 1.1, t);
      } else if (p < 0.8) {
        const t = (p - 0.55) / 0.25;
        y = 0;
        scaleY = lerp(0.85, 1.08, t);
        scaleX = lerp(1.1, 0.95, t);
      } else {
        const t = (p - 0.8) / 0.2;
        y = 0;
        scaleY = lerp(1.08, 1, t);
        scaleX = lerp(0.95, 1, t);
      }
      return { ...IDENTITY, opacity: e, x: 0, y, scaleX, scaleY };
    }
    case "blur_left": {
      const dir = resolveDirection(phase);
      // Default mock direction is from the right (blur-left name); honor direction.
      const from =
        phase?.direction != null
          ? slideOffset(dir, 0.55, bounds)
          : { x: 60, y: 0 };
      return {
        ...IDENTITY,
        opacity: e,
        x: lerp(from.x, 0, e),
        y: lerp(from.y, 0, e),
        blurPx: lerp(12, 0, e),
      };
    }
    case "slide": {
      const dir = resolveDirection(phase);
      const from = slideOffset(dir, 1, bounds);
      return {
        ...IDENTITY,
        opacity: e,
        x: lerp(from.x, 0, e),
        y: lerp(from.y, 0, e),
      };
    }
    case "typewriter":
      return {
        ...IDENTITY,
        opacity: p > 0 ? 1 : 0,
        visibleFraction: 1,
      };
    default:
      return { ...IDENTITY };
  }
}

function sampleOutPreset(
  presetId: string,
  progress: number,
  phase: TextAnimPhase | undefined,
  bounds: TextAnimBounds,
): TextAnimUnitState {
  const id = canonicalPresetId(presetId);
  const p = clamp01(progress);
  const e = easeInCubic(p);

  switch (id) {
    case "fade_out":
      return { ...IDENTITY, opacity: 1 - e };
    case "shrink": {
      const scale = lerp(1, 0, e);
      return { ...IDENTITY, opacity: 1 - e * 0.5, scaleX: scale, scaleY: scale };
    }
    case "slide_away": {
      const dir = resolveDirection(phase);
      const to = slideOffset(dir, 1, bounds);
      return {
        ...IDENTITY,
        opacity: 1 - e,
        x: lerp(0, to.x, e),
        y: lerp(0, to.y, e),
      };
    }
    case "blur_out":
      return {
        ...IDENTITY,
        opacity: 1 - e,
        blurPx: lerp(0, 12, e),
      };
    case "drop_out":
      return {
        ...IDENTITY,
        opacity: 1 - e,
        y: lerp(0, 100, e),
        rotation: lerp(0, 12, e),
      };
    case "glitch_out": {
      const frame = Math.floor(p * 12);
      const nx = hashNoise(frame, 11) * lerp(0, 14, e);
      const ny = hashNoise(frame, 23) * lerp(0, 10, e);
      const squash = lerp(1, 0.7 + hashNoise(frame, 31) * 0.15, e);
      return {
        ...IDENTITY,
        opacity: 1 - e,
        x: nx,
        y: ny,
        scaleX: lerp(1, 1.15, e),
        scaleY: squash,
      };
    }
    default:
      return { ...IDENTITY };
  }
}

function sampleLoopPreset(
  presetId: string,
  localMs: number,
  unitIndex: number,
): TextAnimUnitState {
  const id = canonicalPresetId(presetId);
  const t = Math.max(0, localMs) / 1000;

  switch (id) {
    case "wave": {
      const amp = 8;
      const y = Math.sin(t * Math.PI * 2 * 1.2 + unitIndex * 0.45) * amp;
      return { ...IDENTITY, y };
    }
    case "pulse": {
      const s = 1 + Math.sin(t * Math.PI * 2 * 1.5) * 0.06;
      return { ...IDENTITY, scaleX: s, scaleY: s };
    }
    case "jiggle": {
      const frame = Math.floor(localMs / 33);
      const x = hashNoise(frame, unitIndex * 3 + 1) * 3;
      const y = hashNoise(frame, unitIndex * 3 + 2) * 3;
      return { ...IDENTITY, x, y };
    }
    case "flicker": {
      const frame = Math.floor(localMs / 50);
      const n = hashNoise(frame, unitIndex + 7);
      const opacity = 0.55 + (n * 0.5 + 0.5) * 0.45;
      return { ...IDENTITY, opacity };
    }
    case "float": {
      const y = Math.sin(t * Math.PI * 2 * 0.35 + unitIndex * 0.2) * 10;
      return { ...IDENTITY, y };
    }
    case "jello": {
      const phase = t * Math.PI * 2 * 1.4 + unitIndex * 0.15;
      const sx = 1 + Math.sin(phase) * 0.12;
      const sy = 1 + Math.sin(phase + Math.PI) * 0.12;
      return { ...IDENTITY, scaleX: sx, scaleY: sy };
    }
    case "wiggle": {
      const rotation = Math.sin(t * Math.PI * 2 * 2.2 + unitIndex * 0.3) * 3;
      return { ...IDENTITY, rotation };
    }
    default:
      return { ...IDENTITY };
  }
}

/**
 * Staggered unit-local time for IN/OUT phase progress.
 * unitLocal advances after a delay so later units start later.
 */
function staggeredProgress(
  phaseProgress: number,
  phaseDurMs: number,
  unitIndex: number,
  unitCount: number,
): number {
  if (unitCount <= 1 || phaseDurMs <= 0) return phaseProgress;
  const staggerFrac = 0.65;
  const delay = (unitIndex / unitCount) * staggerFrac;
  const span = 1 - staggerFrac + staggerFrac / unitCount;
  return clamp01((phaseProgress - delay) / Math.max(1e-6, span));
}

export function sampleTextUnitMotion(args: {
  localMs: number;
  clipDurMs: number;
  animation?: TextAnimationParams | null;
  unitIndex: number;
  unitCount: number;
  bounds: TextAnimBounds;
}): TextAnimUnitState {
  const { localMs, clipDurMs, animation, unitIndex, unitCount, bounds } = args;
  if (!hasActiveTextAnimation(animation)) return { ...IDENTITY };

  const phaseInfo = textPhaseAt(localMs, clipDurMs, animation);
  if (phaseInfo.phase === "outside") {
    return { ...IDENTITY, opacity: 0, visibleFraction: 0 };
  }

  let phaseState: TextAnimUnitState = { ...IDENTITY };

  if (phaseInfo.phase === "in" && isActivePreset(animation?.in?.presetId)) {
    const sp = staggeredProgress(
      phaseInfo.progress,
      phaseInfo.phaseDurMs,
      unitIndex,
      unitCount,
    );
    phaseState = sampleInPreset(
      animation!.in!.presetId,
      sp,
      animation!.in,
      bounds,
    );
    // Typewriter: hide units that haven't started yet
    if (canonicalPresetId(animation!.in!.presetId) === "typewriter") {
      phaseState = {
        ...phaseState,
        opacity: sp > 0.02 ? 1 : 0,
        visibleFraction: sp > 0.02 ? 1 : 0,
      };
    }
  } else if (
    phaseInfo.phase === "out" &&
    isActivePreset(animation?.out?.presetId)
  ) {
    const sp = staggeredProgress(
      phaseInfo.progress,
      phaseInfo.phaseDurMs,
      unitIndex,
      unitCount,
    );
    phaseState = sampleOutPreset(
      animation!.out!.presetId,
      sp,
      animation!.out,
      bounds,
    );
  }

  let loopState: TextAnimUnitState = { ...IDENTITY };
  if (isActivePreset(animation?.loop?.presetId)) {
    // Loop over full on-screen life (clip-local time)
    loopState = sampleLoopPreset(
      animation!.loop!.presetId,
      localMs,
      unitIndex,
    );
  }

  return mulState(phaseState, loopState);
}

/**
 * Sample In/Out/Loop motion for a single whole layer (stickers, images).
 * Reuses the text preset math with unitCount = 1.
 */
export function sampleWholeLayerMotion(args: {
  localMs: number;
  clipDurMs: number;
  animation?: TextAnimationParams | null;
  contentW: number;
  contentH: number;
  layoutW: number;
  layoutH: number;
}): TextAnimUnitState {
  return sampleTextUnitMotion({
    localMs: args.localMs,
    clipDurMs: args.clipDurMs,
    animation: args.animation
      ? { ...args.animation, granularity: "whole" }
      : null,
    unitIndex: 0,
    unitCount: 1,
    bounds: {
      blockW: Math.max(1, args.contentW),
      blockH: Math.max(1, args.contentH),
      stageW: Math.max(1, args.layoutW),
      stageH: Math.max(1, args.layoutH),
    },
  });
}

/** Fingerprint animation params for preview draw keys. */
export function textAnimationFingerprint(
  anim?: TextAnimationParams | null,
): string {
  if (!anim) return "";
  const g = resolveGranularity(anim);
  const inn = anim.in;
  const out = anim.out;
  const loop = anim.loop;
  return [
    g,
    inn?.presetId ?? "",
    inn?.durationMs ?? "",
    inn?.direction ?? "",
    out?.presetId ?? "",
    out?.durationMs ?? "",
    out?.direction ?? "",
    loop?.presetId ?? "",
  ].join("|");
}
