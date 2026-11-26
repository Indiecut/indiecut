/**
 * Property keyframe engine — AnimatableProperty evaluate + edit.
 * Speed curves stay in speedRemap.ts (normalized t, parametric Bézier).
 */

import type {
  AnimatableProperty,
  Clip,
  ClipMask,
  ColorAdjust,
  EasingPresetId,
  KeyframeHandle,
  PropertyKeyframe,
  ResolvedClipMask,
  ResolvedColorAdjust,
  TangentMode,
  Transform,
  Transform3D,
} from "../project/types";
import { DEFAULT_TRANSFORM3D_PERSPECTIVE } from "../project/types";

export type MaskAnimatableLeaf =
  | "feather"
  | "expand"
  | "position.x"
  | "position.y"
  | "rotationDeg"
  | "size.w"
  | "size.h"
  | "cornerRadius"
  | "stripGap";

export type AnimatablePath =
  | "transform.x"
  | "transform.y"
  | "transform.scaleX"
  | "transform.scaleY"
  | "transform.rotation"
  | "transform3d.rotateX"
  | "transform3d.rotateY"
  | "transform3d.rotateZ"
  | "transform3d.z"
  | "transform3d.perspective"
  | "opacity"
  | "adjust.brightness"
  | "adjust.contrast"
  | "adjust.saturation"
  | "adjust.hue"
  | "audio.volumeDb"
  | "filter.strength"
  | "effect.intensity"
  | `masks.${string}.${MaskAnimatableLeaf}`;

const MASK_LEAVES = new Set<MaskAnimatableLeaf>([
  "feather",
  "expand",
  "position.x",
  "position.y",
  "rotationDeg",
  "size.w",
  "size.h",
  "cornerRadius",
  "stripGap",
]);

export type ParsedAnimatablePath =
  | { kind: "simple"; path: Exclude<AnimatablePath, `masks.${string}.${MaskAnimatableLeaf}`> }
  | { kind: "mask"; maskId: string; leaf: MaskAnimatableLeaf };

export function parseAnimatablePath(path: AnimatablePath): ParsedAnimatablePath {
  if (path.startsWith("masks.")) {
    const rest = path.slice("masks.".length);
    const dot = rest.indexOf(".");
    if (dot <= 0) {
      return { kind: "simple", path: "opacity" };
    }
    const maskId = rest.slice(0, dot);
    const leaf = rest.slice(dot + 1) as MaskAnimatableLeaf;
    if (MASK_LEAVES.has(leaf)) {
      return { kind: "mask", maskId, leaf };
    }
  }
  return {
    kind: "simple",
    path: path as Exclude<AnimatablePath, `masks.${string}.${MaskAnimatableLeaf}`>,
  };
}

export function maskAnimatablePath(
  maskId: string,
  leaf: MaskAnimatableLeaf,
): AnimatablePath {
  return `masks.${maskId}.${leaf}`;
}

const MASK_LEAF_LABELS: Record<MaskAnimatableLeaf, string> = {
  feather: "Feather",
  expand: "Expand",
  "position.x": "Position X",
  "position.y": "Position Y",
  rotationDeg: "Rotation",
  "size.w": "Width",
  "size.h": "Height",
  cornerRadius: "Corner Radius",
  stripGap: "Strip Gap",
};

const SIMPLE_PATH_LABELS: Record<string, string> = {
  "transform.x": "Position X",
  "transform.y": "Position Y",
  "transform.scaleX": "Scale X",
  "transform.scaleY": "Scale Y",
  "transform.rotation": "Rotation",
  "transform3d.rotateX": "Rotate X",
  "transform3d.rotateY": "Rotate Y",
  "transform3d.rotateZ": "Rotate Z",
  "transform3d.z": "Depth Z",
  "transform3d.perspective": "Perspective",
  opacity: "Opacity",
  "adjust.brightness": "Brightness",
  "adjust.contrast": "Contrast",
  "adjust.saturation": "Saturation",
  "adjust.hue": "Hue",
  "audio.volumeDb": "Volume",
  "filter.strength": "Filter Strength",
  "effect.intensity": "Effect Intensity",
};

export function humanizeAnimatablePath(path: AnimatablePath): string {
  const parsed = parseAnimatablePath(path);
  if (parsed.kind === "mask") {
    return `Mask ${MASK_LEAF_LABELS[parsed.leaf]}`;
  }
  return SIMPLE_PATH_LABELS[parsed.path] ?? parsed.path;
}

/** Lane labels with Mask N: Leaf when clip is known. */
export function humanizeAnimatablePathForClip(
  clip: Clip,
  path: AnimatablePath,
): string {
  const parsed = parseAnimatablePath(path);
  if (parsed.kind === "mask") {
    const masks = clip.masks ?? [];
    const idx = masks.findIndex((m) => m.id === parsed.maskId);
    const n = idx >= 0 ? idx + 1 : 1;
    return `Mask ${n}: ${MASK_LEAF_LABELS[parsed.leaf]}`;
  }
  const groupPrefix: Record<string, string> = {
    "transform.x": "Transform: ",
    "transform.y": "Transform: ",
    "transform.scaleX": "Transform: ",
    "transform.scaleY": "Transform: ",
    "transform.rotation": "Transform: ",
    "transform3d.rotateX": "3D: ",
    "transform3d.rotateY": "3D: ",
    "transform3d.rotateZ": "3D: ",
    "transform3d.z": "3D: ",
    "transform3d.perspective": "3D: ",
    opacity: "",
    "adjust.brightness": "Color: ",
    "adjust.contrast": "Color: ",
    "adjust.saturation": "Color: ",
    "adjust.hue": "Color: ",
    "audio.volumeDb": "Audio: ",
    "filter.strength": "Filter: ",
    "effect.intensity": "Effect: ",
  };
  const leaf = SIMPLE_PATH_LABELS[parsed.path] ?? parsed.path;
  return `${groupPrefix[parsed.path] ?? ""}${leaf}`;
}

export type ResolvedTransform = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  uniformScale?: boolean;
};

export type ResolvedTransform3D = {
  enabled: boolean;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  z: number;
  perspective: number;
};

export const LINEAR_OUT: KeyframeHandle = { dx: 0, dy: 0 };
export const LINEAR_IN: KeyframeHandle = { dx: 1, dy: 1 };

/** Preset → CSS cubic [x1,y1,x2,y2] */
export const EASING_PRESET_CUBICS: Record<
  Exclude<EasingPresetId, "custom">,
  [number, number, number, number]
> = {
  none: [0, 0, 1, 1],
  ease_in: [0.42, 0, 1, 1],
  quad_in: [0.55, 0.085, 0.68, 0.53],
  cubic_in: [0.55, 0.055, 0.675, 0.19],
  ease_out: [0, 0, 0.58, 1],
  quad_out: [0.25, 0.46, 0.45, 0.94],
  cubic_out: [0.215, 0.61, 0.355, 1],
  ease: [0.25, 0.1, 0.25, 1],
  quad_ease: [0.455, 0.03, 0.515, 0.955],
};

export function staticAnimatable<T>(value: T): AnimatableProperty<T> {
  return { staticValue: value, keyframes: [] };
}

export function defaultAnimatableTransform(
  partial?: Partial<{
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    uniformScale: boolean;
  }>,
): Transform {
  return {
    x: staticAnimatable(partial?.x ?? 0),
    y: staticAnimatable(partial?.y ?? 0),
    scaleX: staticAnimatable(partial?.scaleX ?? 1),
    scaleY: staticAnimatable(partial?.scaleY ?? 1),
    rotation: staticAnimatable(partial?.rotation ?? 0),
    uniformScale: partial?.uniformScale ?? true,
  };
}

export function newKeyframeId(): string {
  return `kf_${Math.random().toString(36).slice(2, 10)}`;
}

export function frameEpsilonMs(fps: number): number {
  const f = Number.isFinite(fps) && fps > 0 ? fps : 30;
  return 1000 / f;
}

export function handlesToCubic(
  outHandle: KeyframeHandle,
  inHandle: KeyframeHandle,
): [number, number, number, number] {
  return [outHandle.dx, outHandle.dy, inHandle.dx, inHandle.dy];
}

export function cubicToHandles(
  cubic: [number, number, number, number],
): { outHandle: KeyframeHandle; inHandle: KeyframeHandle } {
  return {
    outHandle: { dx: cubic[0], dy: cubic[1] },
    inHandle: { dx: cubic[2], dy: cubic[3] },
  };
}

export function handlesForPreset(preset: EasingPresetId): {
  outHandle: KeyframeHandle;
  inHandle: KeyframeHandle;
  easingPresetId: EasingPresetId;
} {
  if (preset === "custom") {
    return {
      outHandle: { ...LINEAR_OUT },
      inHandle: { ...LINEAR_IN },
      easingPresetId: "custom",
    };
  }
  const cubic = EASING_PRESET_CUBICS[preset];
  const { outHandle, inHandle } = cubicToHandles(cubic);
  return { outHandle, inHandle, easingPresetId: preset };
}

export function makeKeyframe<T>(
  timeOffsetMs: number,
  value: T,
  opts?: {
    easingPresetId?: EasingPresetId;
    tangentMode?: TangentMode;
    outHandle?: KeyframeHandle;
    inHandle?: KeyframeHandle;
    id?: string;
  },
): PropertyKeyframe<T> {
  const preset = opts?.easingPresetId ?? "none";
  const fromPreset = handlesForPreset(preset === "custom" ? "none" : preset);
  return {
    id: opts?.id ?? newKeyframeId(),
    timeOffsetMs,
    value,
    easingPresetId: preset,
    tangentMode: opts?.tangentMode ?? "linear",
    outHandle: opts?.outHandle ?? fromPreset.outHandle,
    inHandle: opts?.inHandle ?? fromPreset.inHandle,
  };
}

/**
 * Invert X(s)=u for unit-square cubic Bézier, then evaluate Y(s).
 * Fast-path when linear (x1===y1 && x2===y2).
 */
export function solveCubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  u: number,
): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (x1 === y1 && x2 === y2) return u;

  const cx = 3.0 * x1;
  const bx = 3.0 * (x2 - x1) - cx;
  const ax = 1.0 - cx - bx;

  const sampleCurveX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleCurveDerivativeX = (s: number) =>
    (3.0 * ax * s + 2.0 * bx) * s + cx;

  let s = u;
  for (let i = 0; i < 6; i++) {
    const currentX = sampleCurveX(s) - u;
    if (Math.abs(currentX) < 1e-6) break;
    const derivative = sampleCurveDerivativeX(s);
    if (Math.abs(derivative) < 1e-6) break;
    s -= currentX / derivative;
  }

  if (s < 0 || s > 1) {
    let low = 0;
    let high = 1;
    s = u;
    for (let i = 0; i < 10; i++) {
      const currentX = sampleCurveX(s);
      if (Math.abs(currentX - u) < 1e-6) break;
      if (u > currentX) low = s;
      else high = s;
      s = (high + low) * 0.5;
    }
  }

  const cy = 3.0 * y1;
  const by = 3.0 * (y2 - y1) - cy;
  const ay = 1.0 - cy - by;
  return ((ay * s + by) * s + cy) * s;
}

export function lerpNumber(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function sortedKeyframes<T>(
  keyframes: PropertyKeyframe<T>[],
): PropertyKeyframe<T>[] {
  return [...keyframes].sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);
}

export function evaluateProperty(
  prop: AnimatableProperty<number> | number | undefined | null,
  localMs: number,
  fallback = 0,
): number {
  if (prop == null) return fallback;
  // Bare numbers (e.g. AI mask patches) — treat as static.
  if (typeof prop === "number") {
    return Number.isFinite(prop) ? prop : fallback;
  }
  if (typeof prop !== "object") return fallback;
  const kfs = Array.isArray(prop.keyframes)
    ? sortedKeyframes(prop.keyframes)
    : [];
  if (kfs.length === 0) {
    return typeof prop.staticValue === "number" &&
      Number.isFinite(prop.staticValue)
      ? prop.staticValue
      : fallback;
  }

  if (localMs <= kfs[0]!.timeOffsetMs) return kfs[0]!.value;
  const last = kfs[kfs.length - 1]!;
  if (localMs >= last.timeOffsetMs) return last.value;

  let low = 0;
  let high = kfs.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (kfs[mid]!.timeOffsetMs <= localMs) low = mid + 1;
    else high = mid - 1;
  }

  const k0 = kfs[high]!;
  const k1 = kfs[low]!;
  if (k0.tangentMode === "hold") return k0.value;

  const span = k1.timeOffsetMs - k0.timeOffsetMs;
  if (span <= 0) return k1.value;
  const rawProgress = (localMs - k0.timeOffsetMs) / span;
  const [x1, y1, x2, y2] = handlesToCubic(k0.outHandle, k1.inHandle);
  const eased = solveCubicBezier(x1, y1, x2, y2, rawProgress);
  return lerpNumber(k0.value, k1.value, eased);
}

export function evaluateClipTransform(
  clip: Clip,
  localMs: number,
): ResolvedTransform {
  const t = clip.transform;
  return {
    x: evaluateProperty(t?.x, localMs, 0),
    y: evaluateProperty(t?.y, localMs, 0),
    scaleX: evaluateProperty(t?.scaleX, localMs, 1),
    scaleY: evaluateProperty(t?.scaleY, localMs, 1),
    rotation: evaluateProperty(t?.rotation, localMs, 0),
    uniformScale: t?.uniformScale ?? true,
  };
}

export function evaluateClipTransform3D(
  clip: Clip,
  localMs: number,
): ResolvedTransform3D | null {
  const t = clip.transform3d;
  if (!t?.enabled) return null;
  return {
    enabled: true,
    rotateX: evaluateProperty(t.rotateX, localMs, 0),
    rotateY: evaluateProperty(t.rotateY, localMs, 0),
    rotateZ: evaluateProperty(t.rotateZ, localMs, 0),
    z: evaluateProperty(t.z, localMs, 0),
    perspective: evaluateProperty(
      t.perspective,
      localMs,
      DEFAULT_TRANSFORM3D_PERSPECTIVE,
    ),
  };
}

/** Default 3D params (enabled). Used when the user turns 3D on. */
export function defaultTransform3D(enabled = true): Transform3D {
  return {
    enabled,
    rotateX: staticAnimatable(0),
    rotateY: staticAnimatable(0),
    rotateZ: staticAnimatable(0),
    z: staticAnimatable(0),
    perspective: staticAnimatable(DEFAULT_TRANSFORM3D_PERSPECTIVE),
  };
}

export function ensureTransform3D(clip: Clip, enabled = true): Transform3D {
  if (clip.transform3d) {
    return { ...clip.transform3d, enabled };
  }
  return defaultTransform3D(enabled);
}

export function evaluateClipOpacity(clip: Clip, localMs: number): number {
  return evaluateProperty(clip.opacity, localMs, 1);
}

export function evaluateClipAdjust(
  clip: Clip,
  localMs: number,
): ResolvedColorAdjust | undefined {
  const a = clip.adjust;
  if (!a) return undefined;
  const out: ResolvedColorAdjust = {};
  if (a.brightness) out.brightness = evaluateProperty(a.brightness, localMs, 0);
  if (a.contrast) out.contrast = evaluateProperty(a.contrast, localMs, 0);
  if (a.saturation) out.saturation = evaluateProperty(a.saturation, localMs, 0);
  if (a.hue) out.hue = evaluateProperty(a.hue, localMs, 0);
  if (a.lumaCurve) out.lumaCurve = a.lumaCurve;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function evaluateClipVolumeDb(clip: Clip, localMs: number): number {
  return evaluateProperty(clip.audio?.volumeDb, localMs, 0);
}

export function evaluateFilterStrength(clip: Clip, localMs: number): number {
  return evaluateProperty(clip.filter?.strength, localMs, 1);
}

export function evaluateEffectIntensity(clip: Clip, localMs: number): number {
  return evaluateProperty(clip.effect?.intensity, localMs, 1);
}

function evaluateMaskLeaf(
  prop: AnimatableProperty<number> | undefined,
  localMs: number,
  fallback: number,
): number {
  return evaluateProperty(prop, localMs, fallback);
}

export function evaluateClipMask(
  mask: ClipMask,
  localMs: number,
): ResolvedClipMask {
  const resolved: ResolvedClipMask = {
    id: mask.id,
    name: mask.name,
    type: mask.type,
    invert: Boolean(mask.invert),
    feather: evaluateMaskLeaf(mask.feather, localMs, 0),
    position: {
      x: evaluateMaskLeaf(mask.position?.x, localMs, 0),
      y: evaluateMaskLeaf(mask.position?.y, localMs, 0),
    },
    rotationDeg: evaluateMaskLeaf(mask.rotationDeg, localMs, 0),
    booleanBlend: mask.booleanBlend,
    text: mask.text,
  };
  if (mask.expand) {
    resolved.expand = evaluateMaskLeaf(mask.expand, localMs, 0);
  }
  if (mask.size) {
    resolved.size = {
      w: evaluateMaskLeaf(mask.size.w, localMs, 400),
      h: evaluateMaskLeaf(mask.size.h, localMs, 400),
    };
  }
  if (mask.cornerRadius) {
    resolved.cornerRadius = evaluateMaskLeaf(mask.cornerRadius, localMs, 0);
  }
  if (mask.stripGap) {
    resolved.stripGap = evaluateMaskLeaf(mask.stripGap, localMs, 0);
  }
  return resolved;
}

export function evaluateClipMasks(
  clip: Clip,
  localMs: number,
): ResolvedClipMask[] | undefined {
  if (!clip.masks?.length) return undefined;
  return clip.masks.map((m) => evaluateClipMask(m, localMs));
}

function getMaskLeaf(
  mask: ClipMask,
  leaf: MaskAnimatableLeaf,
): AnimatableProperty<number> | undefined {
  switch (leaf) {
    case "feather":
      return mask.feather;
    case "expand":
      return mask.expand;
    case "position.x":
      return mask.position.x;
    case "position.y":
      return mask.position.y;
    case "rotationDeg":
      return mask.rotationDeg;
    case "size.w":
      return mask.size?.w;
    case "size.h":
      return mask.size?.h;
    case "cornerRadius":
      return mask.cornerRadius;
    case "stripGap":
      return mask.stripGap;
  }
}

function setMaskLeaf(
  mask: ClipMask,
  leaf: MaskAnimatableLeaf,
  prop: AnimatableProperty<number>,
): ClipMask {
  switch (leaf) {
    case "feather":
      return { ...mask, feather: prop };
    case "expand":
      return { ...mask, expand: prop };
    case "position.x":
      return { ...mask, position: { ...mask.position, x: prop } };
    case "position.y":
      return { ...mask, position: { ...mask.position, y: prop } };
    case "rotationDeg":
      return { ...mask, rotationDeg: prop };
    case "size.w":
      return {
        ...mask,
        size: {
          w: prop,
          h: mask.size?.h ?? staticAnimatable(400),
        },
      };
    case "size.h":
      return {
        ...mask,
        size: {
          w: mask.size?.w ?? staticAnimatable(400),
          h: prop,
        },
      };
    case "cornerRadius":
      return { ...mask, cornerRadius: prop };
    case "stripGap":
      return { ...mask, stripGap: prop };
  }
}

export function getAnimatable(
  clip: Clip,
  path: AnimatablePath,
): AnimatableProperty<number> | undefined {
  const parsed = parseAnimatablePath(path);
  if (parsed.kind === "mask") {
    const mask = clip.masks?.find((m) => m.id === parsed.maskId);
    return mask ? getMaskLeaf(mask, parsed.leaf) : undefined;
  }
  switch (parsed.path) {
    case "transform.x":
      return clip.transform?.x;
    case "transform.y":
      return clip.transform?.y;
    case "transform.scaleX":
      return clip.transform?.scaleX;
    case "transform.scaleY":
      return clip.transform?.scaleY;
    case "transform.rotation":
      return clip.transform?.rotation;
    case "transform3d.rotateX":
      return clip.transform3d?.rotateX;
    case "transform3d.rotateY":
      return clip.transform3d?.rotateY;
    case "transform3d.rotateZ":
      return clip.transform3d?.rotateZ;
    case "transform3d.z":
      return clip.transform3d?.z;
    case "transform3d.perspective":
      return clip.transform3d?.perspective;
    case "opacity":
      return clip.opacity;
    case "adjust.brightness":
      return clip.adjust?.brightness;
    case "adjust.contrast":
      return clip.adjust?.contrast;
    case "adjust.saturation":
      return clip.adjust?.saturation;
    case "adjust.hue":
      return clip.adjust?.hue;
    case "audio.volumeDb":
      return clip.audio?.volumeDb;
    case "filter.strength":
      return clip.filter?.strength;
    case "effect.intensity":
      return clip.effect?.intensity;
  }
}

function ensureTransform(clip: Clip): Transform {
  return clip.transform
    ? { ...clip.transform }
    : defaultAnimatableTransform();
}

function ensureAdjust(clip: Clip): ColorAdjust {
  return clip.adjust ? { ...clip.adjust } : {};
}

export function setAnimatableOnClip(
  clip: Clip,
  path: AnimatablePath,
  prop: AnimatableProperty<number>,
): Partial<Clip> {
  const parsed = parseAnimatablePath(path);
  if (parsed.kind === "mask") {
    const masks = (clip.masks ?? []).map((m) =>
      m.id === parsed.maskId ? setMaskLeaf(m, parsed.leaf, prop) : m,
    );
    return { masks };
  }
  switch (parsed.path) {
    case "opacity":
      return { opacity: prop };
    case "transform.x": {
      const transform = ensureTransform(clip);
      transform.x = prop;
      return { transform };
    }
    case "transform.y": {
      const transform = ensureTransform(clip);
      transform.y = prop;
      return { transform };
    }
    case "transform.scaleX": {
      const transform = ensureTransform(clip);
      transform.scaleX = prop;
      return { transform };
    }
    case "transform.scaleY": {
      const transform = ensureTransform(clip);
      transform.scaleY = prop;
      return { transform };
    }
    case "transform.rotation": {
      const transform = ensureTransform(clip);
      transform.rotation = prop;
      return { transform };
    }
    case "transform3d.rotateX": {
      const transform3d = ensureTransform3D(clip, clip.transform3d?.enabled ?? true);
      transform3d.rotateX = prop;
      return { transform3d };
    }
    case "transform3d.rotateY": {
      const transform3d = ensureTransform3D(clip, clip.transform3d?.enabled ?? true);
      transform3d.rotateY = prop;
      return { transform3d };
    }
    case "transform3d.rotateZ": {
      const transform3d = ensureTransform3D(clip, clip.transform3d?.enabled ?? true);
      transform3d.rotateZ = prop;
      return { transform3d };
    }
    case "transform3d.z": {
      const transform3d = ensureTransform3D(clip, clip.transform3d?.enabled ?? true);
      transform3d.z = prop;
      return { transform3d };
    }
    case "transform3d.perspective": {
      const transform3d = ensureTransform3D(clip, clip.transform3d?.enabled ?? true);
      transform3d.perspective = prop;
      return { transform3d };
    }
    case "adjust.brightness": {
      const adjust = ensureAdjust(clip);
      adjust.brightness = prop;
      return { adjust };
    }
    case "adjust.contrast": {
      const adjust = ensureAdjust(clip);
      adjust.contrast = prop;
      return { adjust };
    }
    case "adjust.saturation": {
      const adjust = ensureAdjust(clip);
      adjust.saturation = prop;
      return { adjust };
    }
    case "adjust.hue": {
      const adjust = ensureAdjust(clip);
      adjust.hue = prop;
      return { adjust };
    }
    case "audio.volumeDb":
      return {
        audio: {
          ...(clip.audio ?? {}),
          volumeDb: prop,
        },
      };
    case "filter.strength":
      if (!clip.filter) return {};
      return {
        filter: {
          ...clip.filter,
          strength: prop,
        },
      };
    case "effect.intensity":
      if (!clip.effect) return {};
      return {
        effect: {
          ...clip.effect,
          intensity: prop,
        },
      };
  }
}

function findKeyNear(
  prop: AnimatableProperty<number>,
  localMs: number,
  eps: number,
): PropertyKeyframe<number> | undefined {
  return prop.keyframes.find((k) => Math.abs(k.timeOffsetMs - localMs) <= eps);
}

function upsertKey(
  prop: AnimatableProperty<number>,
  localMs: number,
  value: number,
  eps: number,
): AnimatableProperty<number> {
  const existing = findKeyNear(prop, localMs, eps);
  if (existing) {
    return {
      staticValue: prop.staticValue,
      keyframes: sortedKeyframes(
        prop.keyframes.map((k) =>
          k.id === existing.id ? { ...k, value, timeOffsetMs: localMs } : k,
        ),
      ),
    };
  }
  return {
    staticValue: prop.staticValue,
    keyframes: sortedKeyframes([
      ...prop.keyframes,
      makeKeyframe(localMs, value),
    ]),
  };
}

function defaultPropForPath(
  clip: Clip,
  path: AnimatablePath,
): AnimatableProperty<number> {
  const existing = getAnimatable(clip, path);
  if (existing) return existing;
  const parsed = parseAnimatablePath(path);
  if (parsed.kind === "mask") {
    if (parsed.leaf === "size.w" || parsed.leaf === "size.h") {
      return staticAnimatable(400);
    }
    return staticAnimatable(0);
  }
  switch (parsed.path) {
    case "opacity":
    case "transform.scaleX":
    case "transform.scaleY":
    case "filter.strength":
    case "effect.intensity":
      return staticAnimatable(1);
    case "transform3d.perspective":
      return staticAnimatable(DEFAULT_TRANSFORM3D_PERSPECTIVE);
    default:
      return staticAnimatable(0);
  }
}

/**
 * Write multiple resolved transform numbers through auto-key paths.
 * Prefer this for canvas gestures that update several leaves at once.
 */
export function patchClipTransformValues(
  clip: Clip,
  values: Partial<ResolvedTransform>,
  localMs: number,
  fps: number,
): Partial<Clip> {
  let next: Clip = { ...clip };
  let patch: Partial<Clip> = {};

  const applyPath = (path: AnimatablePath, value: number) => {
    const p = setAnimatableValue(next, path, value, localMs, fps);
    next = { ...next, ...p };
    if (p.transform) {
      patch = {
        ...patch,
        transform: { ...(patch.transform ?? next.transform!), ...p.transform },
      };
    }
  };

  if (values.x !== undefined) applyPath("transform.x", values.x);
  if (values.y !== undefined) applyPath("transform.y", values.y);
  if (values.rotation !== undefined) {
    applyPath("transform.rotation", values.rotation);
  }
  if (values.scaleX !== undefined) applyPath("transform.scaleX", values.scaleX);
  // scaleY only when non-uniform (scaleX path mirrors Y when uniform)
  if (
    values.scaleY !== undefined &&
    (next.transform?.uniformScale ?? true) === false
  ) {
    applyPath("transform.scaleY", values.scaleY);
  }

  if (values.uniformScale !== undefined) {
    const transform = ensureTransform(next);
    transform.uniformScale = values.uniformScale;
    if (values.uniformScale && values.scaleX === undefined) {
      // keep current evaluated scaleX onto scaleY static/keys via scaleX write
    }
    patch = { ...patch, transform };
    next = { ...next, transform };
  }

  return patch;
}

/**
 * Static mode: update staticValue.
 * Keyframed: insert or update key within ±1 frame.
 * Uniform scale: writing scaleX mirrors scaleY.
 */
export function setAnimatableValue(
  clip: Clip,
  path: AnimatablePath,
  value: number,
  localMs: number,
  fps: number,
): Partial<Clip> {
  const eps = frameEpsilonMs(fps);
  const prop = defaultPropForPath(clip, path);
  const nextProp =
    prop.keyframes.length === 0
      ? { staticValue: value, keyframes: [] as PropertyKeyframe<number>[] }
      : upsertKey(prop, localMs, value, eps);

  let patch = setAnimatableOnClip(clip, path, nextProp);

  const uniform =
    (patch.transform ?? clip.transform)?.uniformScale !== false;
  if (path === "transform.scaleX" && uniform) {
    const merged: Clip = { ...clip, ...patch };
    const yProp = defaultPropForPath(merged, "transform.scaleY");
    const nextY =
      yProp.keyframes.length === 0
        ? { staticValue: value, keyframes: [] as PropertyKeyframe<number>[] }
        : upsertKey(yProp, localMs, value, eps);
    patch = {
      ...patch,
      ...setAnimatableOnClip(merged, "transform.scaleY", nextY),
    };
  }

  return patch;
}

/**
 * Remove a key; if it was the last key, bake evaluated value into staticValue.
 */
function removeKeyAtPlayhead(
  prop: AnimatableProperty<number>,
  localMs: number,
  nearId: string,
): AnimatableProperty<number> {
  const remaining = prop.keyframes.filter((k) => k.id !== nearId);
  if (remaining.length === 0) {
    const baked = evaluateProperty(prop, localMs, prop.staticValue);
    return { staticValue: baked, keyframes: [] };
  }
  return { staticValue: prop.staticValue, keyframes: remaining };
}

/**
 * No keys → insert first at playhead with current evaluated/static value.
 * On a key → delete it (if last key, bake evaluated value into staticValue).
 * Keys elsewhere → add at playhead with evaluated value.
 */
export function toggleKeyframe(
  clip: Clip,
  path: AnimatablePath,
  localMs: number,
  fps: number,
): Partial<Clip> {
  const eps = frameEpsilonMs(fps);
  const prop = defaultPropForPath(clip, path);
  const near = findKeyNear(prop, localMs, eps);

  let nextProp: AnimatableProperty<number>;
  if (near) {
    nextProp = removeKeyAtPlayhead(prop, localMs, near.id);
  } else {
    const value = evaluateProperty(prop, localMs, prop.staticValue);
    nextProp = {
      staticValue: prop.staticValue,
      keyframes: sortedKeyframes([
        ...prop.keyframes,
        makeKeyframe(localMs, value),
      ]),
    };
  }

  let patch = setAnimatableOnClip(clip, path, nextProp);
  const uniform =
    (patch.transform ?? clip.transform)?.uniformScale !== false;
  if (path === "transform.scaleX" && uniform) {
    const merged: Clip = { ...clip, ...patch };
    const yProp = defaultPropForPath(merged, "transform.scaleY");
    let nextY: AnimatableProperty<number>;
    if (near) {
      const yNear = findKeyNear(yProp, localMs, eps);
      nextY = yNear
        ? removeKeyAtPlayhead(yProp, localMs, yNear.id)
        : yProp;
    } else {
      const value = evaluateProperty(yProp, localMs, yProp.staticValue);
      const xVal = evaluateProperty(nextProp, localMs, nextProp.staticValue);
      nextY = {
        staticValue: yProp.staticValue,
        keyframes: sortedKeyframes([
          ...yProp.keyframes.filter(
            (k) => Math.abs(k.timeOffsetMs - localMs) > eps,
          ),
          makeKeyframe(localMs, xVal ?? value),
        ]),
      };
    }
    patch = {
      ...patch,
      ...setAnimatableOnClip(merged, "transform.scaleY", nextY),
    };
  }
  return patch;
}

/**
 * Group diamond: if all paths have a key at playhead, delete those keys;
 * otherwise insert/update each path at playhead with evaluated value.
 */
export function toggleKeyframeGroup(
  clip: Clip,
  paths: AnimatablePath[],
  localMs: number,
  fps: number,
): Partial<Clip> {
  const eps = frameEpsilonMs(fps);
  const allSolid =
    paths.length > 0 &&
    paths.every((path) => {
      const prop = getAnimatable(clip, path);
      return prop ? Boolean(findKeyNear(prop, localMs, eps)) : false;
    });

  let next: Clip = { ...clip };
  let patch: Partial<Clip> = {};
  for (const path of paths) {
    if (allSolid) {
      const prop = getAnimatable(next, path);
      if (!prop) continue;
      const near = findKeyNear(prop, localMs, eps);
      if (!near) continue;
      const nextProp = removeKeyAtPlayhead(prop, localMs, near.id);
      const p = setAnimatableOnClip(next, path, nextProp);
      next = { ...next, ...p };
      patch = { ...patch, ...p };
    } else {
      const prop = defaultPropForPath(next, path);
      const value = evaluateProperty(prop, localMs, prop.staticValue);
      // Group insert always creates keys (even from static mode).
      const nextProp =
        prop.keyframes.length === 0
          ? {
              staticValue: prop.staticValue,
              keyframes: [makeKeyframe(localMs, value)],
            }
          : upsertKey(prop, localMs, value, eps);
      const p = setAnimatableOnClip(next, path, nextProp);
      next = { ...next, ...p };
      patch = { ...patch, ...p };
    }
  }
  return patch;
}

export type KeyframeCluster = {
  localMs: number;
  paths: AnimatablePath[];
  labels: string[];
};

/** Enumerate every animatable path that currently exists on the clip. */
export function listClipAnimatablePaths(clip: Clip): AnimatablePath[] {
  const paths: AnimatablePath[] = [
    "transform.x",
    "transform.y",
    "transform.scaleX",
    "transform.scaleY",
    "transform.rotation",
    "transform3d.rotateX",
    "transform3d.rotateY",
    "transform3d.rotateZ",
    "transform3d.z",
    "transform3d.perspective",
    "opacity",
    "adjust.brightness",
    "adjust.contrast",
    "adjust.saturation",
    "adjust.hue",
    "audio.volumeDb",
    "filter.strength",
    "effect.intensity",
  ];
  for (const mask of clip.masks ?? []) {
    for (const leaf of MASK_LEAVES) {
      paths.push(maskAnimatablePath(mask.id, leaf));
    }
  }
  return paths.filter((path) => {
    const prop = getAnimatable(clip, path);
    return Boolean(prop);
  });
}

/** Paths that have ≥1 keyframe. */
export function listKeyedAnimatablePaths(clip: Clip): AnimatablePath[] {
  return listClipAnimatablePaths(clip).filter((path) => {
    const prop = getAnimatable(clip, path);
    return (prop?.keyframes.length ?? 0) > 0;
  });
}

export function collectKeyframeClusters(
  clip: Clip,
  fps: number,
): KeyframeCluster[] {
  const eps = frameEpsilonMs(fps);
  const times: { t: number; path: AnimatablePath }[] = [];
  for (const path of listKeyedAnimatablePaths(clip)) {
    const prop = getAnimatable(clip, path);
    if (!prop) continue;
    for (const k of prop.keyframes) {
      times.push({ t: k.timeOffsetMs, path });
    }
  }
  times.sort((a, b) => a.t - b.t);
  const clusters: KeyframeCluster[] = [];
  for (const item of times) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(last.localMs - item.t) <= eps) {
      if (!last.paths.includes(item.path)) {
        last.paths.push(item.path);
        last.labels.push(humanizeAnimatablePath(item.path));
      }
    } else {
      clusters.push({
        localMs: item.t,
        paths: [item.path],
        labels: [humanizeAnimatablePath(item.path)],
      });
    }
  }
  return clusters;
}

export function moveKeyframeCluster(
  clip: Clip,
  fromLocalMs: number,
  toLocalMs: number,
  fps: number,
): Partial<Clip> {
  const eps = frameEpsilonMs(fps);
  const clampedTo = Math.min(
    Math.max(0, toLocalMs),
    Math.max(0, clip.durationMs),
  );
  if (Math.abs(clampedTo - fromLocalMs) <= 1e-6) return {};

  let next: Clip = { ...clip };
  let patch: Partial<Clip> = {};

  for (const path of listKeyedAnimatablePaths(clip)) {
    const prop = getAnimatable(next, path);
    if (!prop) continue;
    const moving = prop.keyframes.filter(
      (k) => Math.abs(k.timeOffsetMs - fromLocalMs) <= eps,
    );
    if (moving.length === 0) continue;

    const movingIds = new Set(moving.map((k) => k.id));
    const kept = prop.keyframes.filter((k) => !movingIds.has(k.id));
    // Drop any keys already at destination for this path (overwrite)
    const withoutDest = kept.filter(
      (k) => Math.abs(k.timeOffsetMs - clampedTo) > eps,
    );
    const relocated = moving.map((k) => ({
      ...k,
      timeOffsetMs: clampedTo,
    }));
    const nextProp: AnimatableProperty<number> = {
      staticValue: prop.staticValue,
      keyframes: sortedKeyframes([...withoutDest, ...relocated]),
    };
    const p = setAnimatableOnClip(next, path, nextProp);
    next = { ...next, ...p };
    patch = { ...patch, ...p };
  }
  return patch;
}

export function deleteKeyframeCluster(
  clip: Clip,
  localMs: number,
  fps: number,
): Partial<Clip> {
  const eps = frameEpsilonMs(fps);
  let next: Clip = { ...clip };
  let patch: Partial<Clip> = {};

  for (const path of listKeyedAnimatablePaths(clip)) {
    const prop = getAnimatable(next, path);
    if (!prop) continue;
    const near = findKeyNear(prop, localMs, eps);
    if (!near) continue;
    const nextProp = removeKeyAtPlayhead(prop, localMs, near.id);
    const p = setAnimatableOnClip(next, path, nextProp);
    next = { ...next, ...p };
    patch = { ...patch, ...p };
  }
  return patch;
}

/**
 * Move a single keyframe on one path. Clamps to [0, durationMs].
 * Overwrites any same-path key within ±1 frame of the destination.
 */
export function moveKeyframe(
  clip: Clip,
  path: AnimatablePath,
  keyId: string,
  toLocalMs: number,
  fps: number,
): Partial<Clip> {
  const prop = getAnimatable(clip, path);
  if (!prop) return {};
  const key = prop.keyframes.find((k) => k.id === keyId);
  if (!key) return {};

  const eps = frameEpsilonMs(fps);
  const clampedTo = Math.min(
    Math.max(0, toLocalMs),
    Math.max(0, clip.durationMs),
  );
  if (Math.abs(clampedTo - key.timeOffsetMs) <= 1e-6) return {};

  const others = prop.keyframes.filter(
    (k) =>
      k.id !== keyId && Math.abs(k.timeOffsetMs - clampedTo) > eps,
  );
  const nextProp: AnimatableProperty<number> = {
    staticValue: prop.staticValue,
    keyframes: sortedKeyframes([
      ...others,
      { ...key, timeOffsetMs: clampedTo },
    ]),
  };
  return setAnimatableOnClip(clip, path, nextProp);
}

/** Delete one key by id; last key freezes evaluated value into staticValue. */
export function deleteKeyframeById(
  clip: Clip,
  path: AnimatablePath,
  keyId: string,
): Partial<Clip> {
  const prop = getAnimatable(clip, path);
  if (!prop) return {};
  const key = prop.keyframes.find((k) => k.id === keyId);
  if (!key) return {};
  const nextProp = removeKeyAtPlayhead(prop, key.timeOffsetMs, keyId);
  return setAnimatableOnClip(clip, path, nextProp);
}

/**
 * Write Graphs preset onto a segment: left key outHandle + easingPresetId,
 * and the next key's inHandle (evaluate uses k0.out + k1.in).
 * Preset `"none"` = linear. Does not change key values or times.
 */
export function applyEasingPreset(
  clip: Clip,
  path: AnimatablePath,
  leftKeyId: string,
  preset: Exclude<EasingPresetId, "custom"> | "custom",
): Partial<Clip> {
  const prop = getAnimatable(clip, path);
  if (!prop) return {};
  const sorted = sortedKeyframes(prop.keyframes);
  const leftIdx = sorted.findIndex((k) => k.id === leftKeyId);
  if (leftIdx < 0) return {};
  const left = sorted[leftIdx]!;
  const right = sorted[leftIdx + 1];

  const resolved: EasingPresetId = preset === "custom" ? "none" : preset;
  const handles = handlesForPreset(resolved);
  const nextKeys = sorted.map((k) => {
    if (k.id === left.id) {
      return {
        ...k,
        easingPresetId: handles.easingPresetId,
        outHandle: handles.outHandle,
        // Keep left.inHandle for the previous segment; only out drives this one.
      };
    }
    if (right && k.id === right.id) {
      return {
        ...k,
        inHandle: handles.inHandle,
      };
    }
    return k;
  });
  const nextProp: AnimatableProperty<number> = {
    staticValue: prop.staticValue,
    keyframes: nextKeys,
  };
  return setAnimatableOnClip(clip, path, nextProp);
}

/** Clamp unit-square handle X so time stays monotonic; Y unconstrained. */
export function clampKeyframeHandle(h: KeyframeHandle): KeyframeHandle {
  return {
    dx: Math.min(1, Math.max(0, h.dx)),
    dy: Number.isFinite(h.dy) ? h.dy : 0,
  };
}

/** Patch a keyframe's value only (graph Y-drag). */
export function setKeyframeValueById(
  clip: Clip,
  path: AnimatablePath,
  keyId: string,
  value: number,
): Partial<Clip> {
  const prop = getAnimatable(clip, path);
  if (!prop) return {};
  const key = prop.keyframes.find((k) => k.id === keyId);
  if (!key) return {};
  if (key.value === value) return {};
  const nextProp: AnimatableProperty<number> = {
    staticValue: prop.staticValue,
    keyframes: sortedKeyframes(
      prop.keyframes.map((k) => (k.id === keyId ? { ...k, value } : k)),
    ),
  };
  return setAnimatableOnClip(clip, path, nextProp);
}

/**
 * Move a keyframe in time and value (graph diamond drag).
 * Same time collision rules as `moveKeyframe`.
 */
export function moveKeyframeXY(
  clip: Clip,
  path: AnimatablePath,
  keyId: string,
  toLocalMs: number,
  value: number,
  fps: number,
): Partial<Clip> {
  const prop = getAnimatable(clip, path);
  if (!prop) return {};
  const key = prop.keyframes.find((k) => k.id === keyId);
  if (!key) return {};

  const eps = frameEpsilonMs(fps);
  const clampedTo = Math.min(
    Math.max(0, toLocalMs),
    Math.max(0, clip.durationMs),
  );
  const timeUnchanged = Math.abs(clampedTo - key.timeOffsetMs) <= 1e-6;
  const valueUnchanged = key.value === value;
  if (timeUnchanged && valueUnchanged) return {};

  const others = prop.keyframes.filter(
    (k) =>
      k.id !== keyId && Math.abs(k.timeOffsetMs - clampedTo) > eps,
  );
  const nextProp: AnimatableProperty<number> = {
    staticValue: prop.staticValue,
    keyframes: sortedKeyframes([
      ...others,
      { ...key, timeOffsetMs: clampedTo, value },
    ]),
  };
  return setAnimatableOnClip(clip, path, nextProp);
}

export type KeyframeHandlePatch = {
  /** Outgoing handle on the left (anchor) key of a segment. */
  outHandle?: KeyframeHandle;
  /**
   * Incoming handle on the *next* key (right of segment).
   * When patching a lone key's own inHandle (previous segment), set
   * `inHandleOnSelf` instead.
   */
  inHandle?: KeyframeHandle;
  /** Write inHandle onto the same key as `keyId` (previous-segment incoming). */
  inHandleOnSelf?: KeyframeHandle;
  /**
   * Write outHandle onto the *next* key (aligned mirror when dragging
   * that key's incoming handle).
   */
  outHandleOnRight?: KeyframeHandle;
  tangentMode?: TangentMode;
};

/**
 * Custom graph handle edit on the segment starting at `keyId` (left key).
 * Forces `easingPresetId: "custom"` on keys whose handles change.
 * Clamps handle dx to [0, 1].
 */
export function updateKeyframeHandles(
  clip: Clip,
  path: AnimatablePath,
  keyId: string,
  patch: KeyframeHandlePatch,
): Partial<Clip> {
  const prop = getAnimatable(clip, path);
  if (!prop) return {};
  const sorted = sortedKeyframes(prop.keyframes);
  const leftIdx = sorted.findIndex((k) => k.id === keyId);
  if (leftIdx < 0) return {};
  const left = sorted[leftIdx]!;
  const right = sorted[leftIdx + 1];

  const nextKeys = sorted.map((k) => {
    if (k.id === left.id) {
      const touched =
        patch.outHandle != null || patch.inHandleOnSelf != null;
      return {
        ...k,
        easingPresetId: touched
          ? ("custom" as const)
          : k.easingPresetId,
        tangentMode: patch.tangentMode ?? k.tangentMode,
        outHandle: patch.outHandle
          ? clampKeyframeHandle(patch.outHandle)
          : k.outHandle,
        inHandle: patch.inHandleOnSelf
          ? clampKeyframeHandle(patch.inHandleOnSelf)
          : k.inHandle,
      };
    }
    if (right && k.id === right.id) {
      const touched =
        patch.inHandle != null || patch.outHandleOnRight != null;
      return {
        ...k,
        easingPresetId: touched
          ? ("custom" as const)
          : k.easingPresetId,
        ...(patch.tangentMode ? { tangentMode: patch.tangentMode } : {}),
        inHandle: patch.inHandle
          ? clampKeyframeHandle(patch.inHandle)
          : k.inHandle,
        outHandle: patch.outHandleOnRight
          ? clampKeyframeHandle(patch.outHandleOnRight)
          : k.outHandle,
      };
    }
    return k;
  });
  const nextProp: AnimatableProperty<number> = {
    staticValue: prop.staticValue,
    keyframes: nextKeys,
  };
  return setAnimatableOnClip(clip, path, nextProp);
}

/** Wipe all keys on a path; freeze evaluated value at localMs into staticValue. */
export function clearAnimatableKeyframes(
  clip: Clip,
  path: AnimatablePath,
  localMs: number,
): Partial<Clip> {
  const prop = getAnimatable(clip, path);
  if (!prop || prop.keyframes.length === 0) return {};
  const baked = evaluateProperty(prop, localMs, prop.staticValue);
  return setAnimatableOnClip(clip, path, {
    staticValue: baked,
    keyframes: [],
  });
}

/** Dope-sheet row height (px) when a keyframe drawer lane is open. */
export const KEYFRAME_DRAWER_ROW_PX = 22;

/** Fixed height (px) for timeline value graph drawer. */
export const KEYFRAME_GRAPH_HEIGHT_PX = 180;

/** Left property-tab rail width inside the value graph. */
export const KEYFRAME_GRAPH_TAB_RAIL_PX = 120;

export function groupDiamondState(
  clip: Clip,
  paths: AnimatablePath[],
  localMs: number,
  fps: number,
): "dim" | "hollow" | "solid" {
  if (paths.length === 0) return "dim";
  const eps = frameEpsilonMs(fps);
  let anyKeys = false;
  let allSolid = true;
  for (const path of paths) {
    const prop = getAnimatable(clip, path);
    if (!prop || prop.keyframes.length === 0) {
      allSolid = false;
      continue;
    }
    anyKeys = true;
    if (!findKeyNear(prop, localMs, eps)) allSolid = false;
  }
  if (!anyKeys) return "dim";
  if (allSolid) return "solid";
  return "hollow";
}

export function jumpToPrevKeyframe(
  prop: AnimatableProperty<number> | undefined,
  localMs: number,
  eps: number,
): number | null {
  if (!prop || prop.keyframes.length === 0) return null;
  const sorted = sortedKeyframes(prop.keyframes);
  let best: number | null = null;
  for (const k of sorted) {
    if (k.timeOffsetMs < localMs - eps) best = k.timeOffsetMs;
  }
  return best;
}

export function jumpToNextKeyframe(
  prop: AnimatableProperty<number> | undefined,
  localMs: number,
  eps: number,
): number | null {
  if (!prop || prop.keyframes.length === 0) return null;
  const sorted = sortedKeyframes(prop.keyframes);
  for (const k of sorted) {
    if (k.timeOffsetMs > localMs + eps) return k.timeOffsetMs;
  }
  return null;
}

export function clampAnimatableToDuration(
  prop: AnimatableProperty<number>,
  durationMs: number,
): AnimatableProperty<number> {
  const max = Math.max(0, durationMs);
  return {
    staticValue: prop.staticValue,
    keyframes: sortedKeyframes(
      prop.keyframes.filter(
        (k) => k.timeOffsetMs >= 0 && k.timeOffsetMs <= max,
      ),
    ),
  };
}

export function shiftAnimatable(
  prop: AnimatableProperty<number>,
  deltaMs: number,
): AnimatableProperty<number> {
  if (deltaMs === 0) return prop;
  return {
    staticValue: prop.staticValue,
    keyframes: sortedKeyframes(
      prop.keyframes.map((k) => ({
        ...k,
        timeOffsetMs: k.timeOffsetMs + deltaMs,
      })),
    ),
  };
}

export function remapKeyframesIds(
  prop: AnimatableProperty<number>,
): AnimatableProperty<number> {
  return {
    staticValue: prop.staticValue,
    keyframes: prop.keyframes.map((k) => ({ ...k, id: newKeyframeId() })),
  };
}

export const TRANSFORM_ANIMATABLE_PATHS: AnimatablePath[] = [
  "transform.x",
  "transform.y",
  "transform.scaleX",
  "transform.scaleY",
  "transform.rotation",
];

export const TRANSFORM3D_ANIMATABLE_PATHS: AnimatablePath[] = [
  "transform3d.rotateX",
  "transform3d.rotateY",
  "transform3d.rotateZ",
  "transform3d.z",
  "transform3d.perspective",
];

export const ADJUST_ANIMATABLE_PATHS: AnimatablePath[] = [
  "adjust.brightness",
  "adjust.contrast",
  "adjust.saturation",
  "adjust.hue",
];

/** Apply clamp across all animatable leaves on a clip. */
export function clampClipAnimatables(
  clip: Clip,
  durationMs: number,
): Clip {
  let next = clip;
  for (const path of listClipAnimatablePaths(clip)) {
    const prop = getAnimatable(next, path);
    if (!prop) continue;
    next = {
      ...next,
      ...setAnimatableOnClip(
        next,
        path,
        clampAnimatableToDuration(prop, durationMs),
      ),
    };
  }
  return next;
}

export function shiftClampClipAnimatables(
  clip: Clip,
  deltaMs: number,
  durationMs: number,
): Clip {
  let next = clip;
  for (const path of listClipAnimatablePaths(clip)) {
    const prop = getAnimatable(next, path);
    if (!prop) continue;
    const shifted = shiftAnimatable(prop, deltaMs);
    next = {
      ...next,
      ...setAnimatableOnClip(
        next,
        path,
        clampAnimatableToDuration(shifted, durationMs),
      ),
    };
  }
  return next;
}

/** Right half of a split: shift keys left by splitLocal, clamp, new ids. */
export function splitRightClipAnimatables(
  clip: Clip,
  splitLocalMs: number,
  durationMs: number,
): Clip {
  let next = clip;
  for (const path of listClipAnimatablePaths(clip)) {
    const prop = getAnimatable(next, path);
    if (!prop) continue;
    const remapped = remapKeyframesIds(
      clampAnimatableToDuration(
        shiftAnimatable(prop, -splitLocalMs),
        durationMs,
      ),
    );
    next = { ...next, ...setAnimatableOnClip(next, path, remapped) };
  }
  return next;
}

export function diamondState(
  prop: AnimatableProperty<number> | undefined,
  localMs: number,
  fps: number,
): "dim" | "hollow" | "solid" {
  if (!prop || prop.keyframes.length === 0) return "dim";
  const eps = frameEpsilonMs(fps);
  if (findKeyNear(prop, localMs, eps)) return "solid";
  return "hollow";
}

/** Wrap a bare number or already-wrapped animatable from disk. */
export function coerceAnimatableNumber(
  raw: unknown,
  fallback: number,
): AnimatableProperty<number> {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return staticAnimatable(raw);
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const staticValue =
      typeof obj.staticValue === "number" && Number.isFinite(obj.staticValue)
        ? obj.staticValue
        : fallback;
    const keyframesRaw = Array.isArray(obj.keyframes) ? obj.keyframes : [];
    const keyframes: PropertyKeyframe<number>[] = [];
    for (const item of keyframesRaw) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const k = item as Record<string, unknown>;
      if (typeof k.timeOffsetMs !== "number" || !Number.isFinite(k.timeOffsetMs))
        continue;
      if (typeof k.value !== "number" || !Number.isFinite(k.value)) continue;
      const id =
        typeof k.id === "string" && k.id ? k.id : newKeyframeId();
      const easingPresetId =
        typeof k.easingPresetId === "string"
          ? (k.easingPresetId as EasingPresetId)
          : "none";
      const tangentMode =
        typeof k.tangentMode === "string"
          ? (k.tangentMode as TangentMode)
          : "linear";
      const outHandle = parseHandle(k.outHandle) ?? { ...LINEAR_OUT };
      const inHandle = parseHandle(k.inHandle) ?? { ...LINEAR_IN };
      keyframes.push({
        id,
        timeOffsetMs: k.timeOffsetMs,
        value: k.value,
        easingPresetId,
        tangentMode,
        outHandle,
        inHandle,
      });
    }
    return {
      staticValue,
      keyframes: sortedKeyframes(keyframes),
    };
  }
  return staticAnimatable(fallback);
}

function parseHandle(raw: unknown): KeyframeHandle | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.dx !== "number" || typeof o.dy !== "number") return null;
  if (!Number.isFinite(o.dx) || !Number.isFinite(o.dy)) return null;
  return { dx: o.dx, dy: o.dy };
}

export function coerceTransform(raw: unknown): Transform | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const hasFields =
    o.x !== undefined ||
    o.y !== undefined ||
    o.scaleX !== undefined ||
    o.scaleY !== undefined ||
    o.rotation !== undefined;
  if (!hasFields) {
    if (typeof o.uniformScale === "boolean") {
      return defaultAnimatableTransform({ uniformScale: o.uniformScale });
    }
    return undefined;
  }
  return {
    x: coerceAnimatableNumber(o.x, 0),
    y: coerceAnimatableNumber(o.y, 0),
    scaleX: coerceAnimatableNumber(o.scaleX, 1),
    scaleY: coerceAnimatableNumber(o.scaleY, 1),
    rotation: coerceAnimatableNumber(o.rotation, 0),
    uniformScale:
      typeof o.uniformScale === "boolean" ? o.uniformScale : true,
  };
}

export function coerceTransform3D(raw: unknown): Transform3D | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    rotateX: coerceAnimatableNumber(o.rotateX, 0),
    rotateY: coerceAnimatableNumber(o.rotateY, 0),
    rotateZ: coerceAnimatableNumber(o.rotateZ, 0),
    z: coerceAnimatableNumber(o.z, 0),
    perspective: coerceAnimatableNumber(
      o.perspective,
      DEFAULT_TRANSFORM3D_PERSPECTIVE,
    ),
  };
}
