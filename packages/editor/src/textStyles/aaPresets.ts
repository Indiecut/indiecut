import type { TextProps } from "../project/types";

/** Partial paint fields set by Aa presets (not full templates). */
export type AaPreset = {
  id: string;
  name: string;
  patch: Partial<TextProps>;
};

/** Recipe keys that Aa presets / Effects-lite own. Manual edits → custom. */
export const AA_RECIPE_KEYS = [
  "color",
  "gradient",
  "strokeColor",
  "strokeWidth",
  "shadowColor",
  "shadowBlur",
  "shadowOffsetX",
  "shadowOffsetY",
  "retro3DColor",
] as const;

export type AaRecipeKey = (typeof AA_RECIPE_KEYS)[number];

export const AA_CUSTOM_PRESET_ID = "custom";

/** Clean default recipe — clears stroke/glow/retro extras without wiping typography. */
export function cleanRecipeDefaults(): Partial<TextProps> {
  return {
    color: "#ffffff",
    gradient: null,
    strokeColor: "#000000",
    strokeWidth: 0,
    shadowColor: undefined,
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    retro3DColor: null,
  };
}

/**
 * One-tap Aa presets (Basic → Preset style).
 * Values adapted from documents/.../text_studio_canvas.tsx PRESET_AA_STYLES.
 */
export const AA_STYLE_PRESETS: AaPreset[] = [
  {
    id: "none",
    name: "Default",
    patch: cleanRecipeDefaults(),
  },
  {
    id: "outline-black",
    name: "Strong Stroke",
    patch: {
      color: "#ffffff",
      strokeColor: "#000000",
      strokeWidth: 4,
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      retro3DColor: null,
      gradient: null,
    },
  },
  {
    id: "hollow-white",
    name: "Hollow",
    patch: {
      color: "#18181b",
      strokeColor: "#ffffff",
      strokeWidth: 3,
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      retro3DColor: null,
      gradient: null,
    },
  },
  {
    id: "soft-glow",
    name: "White Glow",
    patch: {
      color: "#ffffff",
      strokeWidth: 0,
      shadowColor: "#ffffff",
      shadowBlur: 16,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      retro3DColor: null,
      gradient: null,
    },
  },
  {
    id: "yellow-pop",
    name: "Yellow Sub",
    patch: {
      color: "#facc15",
      strokeColor: "#000000",
      strokeWidth: 4,
      shadowColor: "#000000",
      shadowBlur: 0,
      shadowOffsetX: 3,
      shadowOffsetY: 3,
      retro3DColor: null,
      gradient: null,
    },
  },
  {
    id: "red-punch",
    name: "Red Punch",
    patch: {
      color: "#ef4444",
      strokeColor: "#ffffff",
      strokeWidth: 4,
      shadowColor: "rgba(0,0,0,0.6)",
      shadowBlur: 6,
      shadowOffsetX: 0,
      shadowOffsetY: 3,
      retro3DColor: null,
      gradient: null,
    },
  },
  {
    id: "orange-warm",
    name: "Orange Toon",
    patch: {
      color: "#fb923c",
      strokeColor: "#ffffff",
      strokeWidth: 4,
      shadowColor: "#7c2d12",
      shadowBlur: 0,
      shadowOffsetX: 3,
      shadowOffsetY: 4,
      retro3DColor: "#7c2d12",
      gradient: null,
    },
  },
  {
    id: "cyan-ice",
    name: "Ice Neon",
    patch: {
      color: "#38bdf8",
      strokeColor: "#ffffff",
      strokeWidth: 3,
      shadowColor: "#0284c7",
      shadowBlur: 18,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      retro3DColor: null,
      gradient: null,
    },
  },
  {
    id: "neon-green",
    name: "Toxic Green",
    patch: {
      color: "#4ade80",
      strokeColor: "#052e16",
      strokeWidth: 4,
      shadowColor: "#22c55e",
      shadowBlur: 14,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      retro3DColor: null,
      gradient: null,
    },
  },
  {
    id: "cyber-purple",
    name: "Cyber Pink",
    patch: {
      color: "#f472b6",
      strokeColor: "#ffffff",
      strokeWidth: 2,
      shadowColor: "#db2777",
      shadowBlur: 18,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      retro3DColor: "#831843",
      gradient: null,
    },
  },
];

export function findAaPreset(id: string): AaPreset | undefined {
  return AA_STYLE_PRESETS.find((p) => p.id === id);
}

function recipeValue(
  text: TextProps,
  key: AaRecipeKey,
): string | number | null | undefined {
  return text[key] as string | number | null | undefined;
}

function normalizeRecipeCompare(
  key: AaRecipeKey,
  value: string | number | null | undefined,
): string {
  if (value === undefined || value === null) {
    if (key === "gradient" || key === "retro3DColor") return "null";
    if (key === "shadowColor") return "";
    if (
      key === "strokeWidth" ||
      key === "shadowBlur" ||
      key === "shadowOffsetX" ||
      key === "shadowOffsetY"
    ) {
      return "0";
    }
    if (key === "color") return "#ffffff";
    if (key === "strokeColor") return "#000000";
    return "";
  }
  if (typeof value === "number") return String(value);
  return value;
}

/** True when text recipe fields match the preset patch (ignoring typography). */
export function aaPresetMatches(text: TextProps, preset: AaPreset): boolean {
  const baseline = cleanRecipeDefaults();
  const expected: Partial<TextProps> = { ...baseline, ...preset.patch };
  for (const key of AA_RECIPE_KEYS) {
    const a = normalizeRecipeCompare(key, recipeValue(text, key));
    const b = normalizeRecipeCompare(key, recipeValue(expected as TextProps, key));
    if (a !== b) return false;
  }
  return true;
}

/**
 * Apply an Aa preset in one shot. Preserves content / font / size / align / spacing /
 * bubble / templateId. Sets stylePresetId to the preset id.
 */
export function applyAaPreset(current: TextProps, presetId: string): TextProps {
  const preset = findAaPreset(presetId) ?? findAaPreset("none")!;
  const next: TextProps = { ...current };

  if (preset.id === "none") {
    Object.assign(next, cleanRecipeDefaults());
  } else {
    // Clear leftover shadow offsets / colors before applying a named look.
    Object.assign(next, cleanRecipeDefaults(), preset.patch);
  }

  next.stylePresetId = preset.id;
  return next;
}

/** Mark recipe as hand-tuned after a named Aa apply. */
export function markStyleCustom(text: TextProps): TextProps {
  if (text.stylePresetId === AA_CUSTOM_PRESET_ID) return text;
  if (!text.stylePresetId || text.stylePresetId === "none") {
    return { ...text, stylePresetId: AA_CUSTOM_PRESET_ID };
  }
  return { ...text, stylePresetId: AA_CUSTOM_PRESET_ID };
}

/** Resolve which Aa tile should show as active. */
export function resolveActiveAaPresetId(text: TextProps): string | null {
  const id = text.stylePresetId;
  if (id === AA_CUSTOM_PRESET_ID) return null;
  if (id && findAaPreset(id)) return id;
  // Old clips without stylePresetId: match by recipe fields.
  for (const preset of AA_STYLE_PRESETS) {
    if (aaPresetMatches(text, preset)) return preset.id;
  }
  return null;
}

/** True if `partial` touches any Aa recipe field. */
export function touchesAaRecipe(partial: Partial<TextProps>): boolean {
  return AA_RECIPE_KEYS.some((key) => key in partial);
}
