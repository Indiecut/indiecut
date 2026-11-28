import {
  formatLinearGradientCss,
} from "../compositor/rasterizeText";
import type { TextProps } from "../project/types";
import { mapRunStyles, normalizeTextProps } from "../text/runs";
import {
  AA_CUSTOM_PRESET_ID,
  cleanRecipeDefaults,
  touchesAaRecipe,
} from "./aaPresets";

export type EffectPreset = {
  id: string;
  name: string;
  patch: Partial<TextProps>;
};

/** Effects tiles write the same TextProps paint fields as Aa. */
export const EFFECT_PRESETS: EffectPreset[] = [
  {
    id: "clear-effects",
    name: "Clear",
    patch: cleanRecipeDefaults(),
  },
  {
    id: "soft-glow",
    name: "Soft glow",
    patch: {
      shadowColor: "#ffffff",
      shadowBlur: 16,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      strokeWidth: 0,
      retro3DColor: null,
      gradient: null,
    },
  },
  {
    id: "hard-outline",
    name: "Hard outline",
    patch: {
      strokeColor: "#000000",
      strokeWidth: 5,
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      retro3DColor: null,
      gradient: null,
    },
  },
  {
    id: "ice-glow",
    name: "Ice glow",
    patch: {
      color: "#e0f2fe",
      strokeColor: "#ffffff",
      strokeWidth: 2,
      shadowColor: "#38bdf8",
      shadowBlur: 18,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      retro3DColor: null,
      gradient: formatLinearGradientCss(180, "#38bdf8", "#1d4ed8"),
    },
  },
  {
    id: "retro-pop",
    name: "Retro pop",
    patch: {
      color: "#fb923c",
      strokeColor: "#ffffff",
      strokeWidth: 4,
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      retro3DColor: "#7c2d12",
      gradient: null,
    },
  },
];

export function applyEffectPreset(
  current: TextProps,
  presetId: string,
): TextProps {
  const preset = EFFECT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return current;
  let next: TextProps = {
    ...current,
    ...preset.patch,
    stylePresetId: AA_CUSTOM_PRESET_ID,
  };
  next = mapRunStyles(next, (style) => ({
    ...(style ?? {}),
    color: next.color ?? style?.color,
    gradient: next.gradient !== undefined ? next.gradient : style?.gradient,
    strokeColor: next.strokeColor ?? style?.strokeColor,
    strokeWidth: next.strokeWidth ?? style?.strokeWidth,
  }));
  return normalizeTextProps(next);
}

export function parseGradientStops(gradient: string | null | undefined): {
  enabled: boolean;
  angle: number;
  from: string;
  to: string;
} {
  if (!gradient) {
    return { enabled: false, angle: 180, from: "#38bdf8", to: "#1d4ed8" };
  }
  const m = gradient
    .trim()
    .match(
      /^linear-gradient\(\s*([+-]?\d*\.?\d+)deg\s*,\s*(.+?)\s+([+-]?\d*\.?\d+)%\s*,\s*(.+?)\s+([+-]?\d*\.?\d+)%\s*\)$/i,
    );
  if (!m) {
    return { enabled: true, angle: 180, from: "#38bdf8", to: "#1d4ed8" };
  }
  return {
    enabled: true,
    angle: Number(m[1]) || 180,
    from: m[2]!.trim(),
    to: m[4]!.trim(),
  };
}

export function effectRecipePartial(
  current: TextProps,
  partial: Partial<TextProps>,
): Partial<TextProps> {
  if (!touchesAaRecipe(partial)) return partial;
  if (current.stylePresetId === AA_CUSTOM_PRESET_ID) return partial;
  return { ...partial, stylePresetId: AA_CUSTOM_PRESET_ID };
}
