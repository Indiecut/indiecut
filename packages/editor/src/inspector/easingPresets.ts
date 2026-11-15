/**
 * Graphs easing preset cards — see documents/keyframes/keyframe_presets.md
 */

import { EASING_PRESET_CUBICS } from "../engine/animatable";
import type { EasingPresetId } from "../project/types";

export type EasingPresetDef = {
  id: Exclude<EasingPresetId, "custom">;
  label: string;
  /** Mini SVG path in 40×28 viewBox. */
  iconPath: string;
};

/** Sample cubic Bézier Y(X) into an SVG path for the preset tile. */
function cubicIconPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const W = 40;
  const H = 28;
  const pad = 4;
  const toX = (u: number) => pad + u * (W - pad * 2);
  const toY = (v: number) => H - pad - v * (H - pad * 2);

  // Approximate the eased curve by sampling (invert X→s then Y) lightly via parametric
  // for icon purposes: use the control polygon as a cubic Bezier in screen space
  // (good enough for a recognisable tile silhouette).
  const p0 = `${toX(0)},${toY(0)}`;
  const p1 = `${toX(x1)},${toY(y1)}`;
  const p2 = `${toX(x2)},${toY(y2)}`;
  const p3 = `${toX(1)},${toY(1)}`;
  return `M ${p0} C ${p1} ${p2} ${p3}`;
}

const LABELS: Record<Exclude<EasingPresetId, "custom">, string> = {
  none: "None",
  ease_in: "Ease In",
  quad_in: "Quad In",
  cubic_in: "Cubic In",
  ease_out: "Ease Out",
  quad_out: "Quad Out",
  cubic_out: "Cubic Out",
  ease: "Ease",
  quad_ease: "Quad Ease",
};

export const EASING_PRESET_DEFS: EasingPresetDef[] = (
  Object.keys(EASING_PRESET_CUBICS) as Exclude<EasingPresetId, "custom">[]
).map((id) => {
  const [x1, y1, x2, y2] = EASING_PRESET_CUBICS[id];
  return {
    id,
    label: LABELS[id],
    iconPath: cubicIconPath(x1, y1, x2, y2),
  };
});
