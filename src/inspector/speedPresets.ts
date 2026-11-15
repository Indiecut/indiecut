/**
 * Speed curve presets — see desktop_version/speed_curve_design.png
 */

import type { SpeedCurvePresetId, SpeedKeyframe } from "../project/types";

export type SpeedPresetDef = {
  id: SpeedCurvePresetId;
  label: string;
  /** Mini icon path in 40×28 viewBox (yellow stroke). */
  iconPath: string;
  keyframes: SpeedKeyframe[];
};

function k(
  t: number,
  v: number,
  outDt = 0.08,
  outDv = 0,
  inDt = -0.08,
  inDv = 0,
): SpeedKeyframe {
  return {
    t,
    v,
    outHandle: { dt: outDt, dv: outDv },
    inHandle: { dt: inDt, dv: inDv },
  };
}

/** Flat 1× — "None" */
const NONE_KEYS: SpeedKeyframe[] = [
  k(0, 1, 0.2, 0, -0.2, 0),
  k(1, 1, 0.2, 0, -0.2, 0),
];

/** Montage: rise → dip below 1× → settle */
const MONTAGE_KEYS: SpeedKeyframe[] = [
  k(0, 1, 0.1, 0.4),
  k(0.22, 3.2, 0.08, 0, -0.06, 0.2),
  k(0.42, 0.25, 0.1, 0, -0.08, -0.3),
  k(0.62, 1, 0.15, 0, -0.08, 0.15),
  k(1, 1, 0.1, 0, -0.2, 0),
];

/** Hero time: two peaks with a deep valley (M) */
const HERO_KEYS: SpeedKeyframe[] = [
  k(0, 1, 0.08, 0.5),
  k(0.2, 3.5, 0.06, 0, -0.05, 0.2),
  k(0.5, 0.2, 0.06, 0, -0.06, -0.4),
  k(0.8, 3.5, 0.08, 0, -0.05, 0.2),
  k(1, 1, 0.05, 0, -0.08, -0.4),
];

/** Bullet: deep U slow-mo in the middle */
const BULLET_KEYS: SpeedKeyframe[] = [
  k(0, 1, 0.12, 0),
  k(0.28, 1, 0.06, -0.5),
  k(0.5, 0.15, 0.08, 0, -0.08, 0),
  k(0.72, 1, 0.12, 0, -0.06, 0.5),
  k(1, 1, 0.1, 0, -0.12, 0),
];

/** Jump cut: sharp speed peak */
const JUMP_KEYS: SpeedKeyframe[] = [
  k(0, 1, 0.15, 0),
  k(0.38, 1, 0.04, 0.8),
  k(0.5, 6, 0.04, 0, -0.04, 0),
  k(0.62, 1, 0.15, 0, -0.04, -0.8),
  k(1, 1, 0.1, 0, -0.15, 0),
];

/** Flash in: start fast, settle to 1× */
const FLASH_IN_KEYS: SpeedKeyframe[] = [
  k(0, 5.5, 0.12, -1.2),
  k(0.35, 1.2, 0.12, 0, -0.1, -0.4),
  k(1, 1, 0.1, 0, -0.2, 0),
];

/** Flash out: start 1×, ramp up */
const FLASH_OUT_KEYS: SpeedKeyframe[] = [
  k(0, 1, 0.2, 0),
  k(0.55, 1.2, 0.1, 0.5, -0.1, 0),
  k(1, 5.5, 0.08, 0, -0.12, 1.2),
];

export const SPEED_CURVE_PRESETS: SpeedPresetDef[] = [
  {
    id: "none",
    label: "None",
    iconPath: "", // rendered as slash circle
    keyframes: NONE_KEYS,
  },
  {
    id: "customized",
    label: "Customized",
    iconPath: "", // rendered as sliders
    keyframes: NONE_KEYS,
  },
  {
    id: "montage",
    label: "Montage",
    iconPath: "M4 16 C10 16 12 6 18 6 C24 6 26 22 32 22 C36 22 38 16 40 16",
    keyframes: MONTAGE_KEYS,
  },
  {
    id: "hero_time",
    label: "Hero time",
    iconPath: "M2 18 L10 6 L20 22 L30 6 L38 18",
    keyframes: HERO_KEYS,
  },
  {
    id: "bullet",
    label: "Bullet",
    iconPath: "M2 10 C12 10 14 24 22 24 C30 24 32 10 42 10",
    keyframes: BULLET_KEYS,
  },
  {
    id: "jump_cut",
    label: "Jump Cut",
    iconPath: "M2 18 L16 18 L20 4 L24 18 L42 18",
    keyframes: JUMP_KEYS,
  },
  {
    id: "flash_in",
    label: "Flash in",
    iconPath: "M4 4 C14 4 18 18 42 18",
    keyframes: FLASH_IN_KEYS,
  },
  {
    id: "flash_out",
    label: "Flash out",
    iconPath: "M2 18 C22 18 28 4 42 4",
    keyframes: FLASH_OUT_KEYS,
  },
];

export function getSpeedPreset(
  id: SpeedCurvePresetId,
): SpeedPresetDef | undefined {
  return SPEED_CURVE_PRESETS.find((p) => p.id === id);
}

export function resolvePresetId(
  presetId: SpeedCurvePresetId | undefined,
  mode: "constant" | "curve",
): SpeedCurvePresetId {
  if (mode !== "curve") return "none";
  return presetId ?? "customized";
}
