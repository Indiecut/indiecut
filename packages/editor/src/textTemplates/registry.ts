/** Bundled text templates — manifest imported (no public fetch). */

import rawManifest from "../../../../assets/text-templates/manifest.json";
import type {
  TextAnimationParams,
  TextBubbleProps,
  TextProps,
} from "../project/types";

export type TextTemplateCategory =
  | "title"
  | "social"
  | "vlog"
  | "outro"
  | "promo"
  | "lower"
  | "gaming"
  | "caption";

export type TextTemplateRecipe = Partial<
  Omit<TextProps, "content" | "templateId" | "stylePresetId">
>;

export type TextTemplateEntry = {
  id: string;
  name: string;
  category: TextTemplateCategory;
  defaultText: string;
  recipe: TextTemplateRecipe;
  defaultAnimation?: TextAnimationParams;
};

export type TextTemplateManifest = {
  version: number;
  source: string;
  license: string;
  templates: TextTemplateEntry[];
};

/** Style keys a template recipe may overwrite when applied to an existing clip. */
export const TEMPLATE_RECIPE_KEYS = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "textDecoration",
  "textTransform",
  "color",
  "gradient",
  "align",
  "letterSpacing",
  "lineHeight",
  "strokeColor",
  "strokeWidth",
  "shadowColor",
  "shadowBlur",
  "shadowOffsetX",
  "shadowOffsetY",
  "retro3DColor",
  "bubble",
] as const satisfies ReadonlyArray<keyof TextProps>;

export type TemplateRecipeKey = (typeof TEMPLATE_RECIPE_KEYS)[number];

export const TEXT_TEMPLATE_CATEGORY_ORDER: TextTemplateCategory[] = [
  "title",
  "social",
  "vlog",
  "outro",
  "promo",
  "lower",
  "gaming",
  "caption",
];

export const TEXT_TEMPLATE_CATEGORY_LABEL: Record<TextTemplateCategory, string> =
  {
    title: "Title",
    social: "Social",
    vlog: "Vlog",
    outro: "Outro",
    promo: "Promo",
    lower: "Lower third",
    gaming: "Gaming",
    caption: "Caption",
  };

const bundled = rawManifest as TextTemplateManifest;
const entryById = new Map<string, TextTemplateEntry>();
for (const t of bundled.templates) {
  entryById.set(t.id, t);
}

export async function loadTextTemplateManifest(): Promise<TextTemplateManifest> {
  return bundled;
}

/** Sync access to the bundled pack (no fetch). */
export function getTextTemplates(): TextTemplateEntry[] {
  return bundled.templates;
}

export function findTextTemplate(
  templateId: string,
): TextTemplateEntry | undefined {
  return entryById.get(templateId);
}

export function findTextTemplateInManifest(
  manifest: TextTemplateManifest,
  templateId: string,
): TextTemplateEntry | undefined {
  return manifest.templates.find((t) => t.id === templateId);
}

export function groupTextTemplatesByCategory(
  templates: TextTemplateEntry[],
): { category: TextTemplateCategory; items: TextTemplateEntry[] }[] {
  const map = new Map<TextTemplateCategory, TextTemplateEntry[]>();
  for (const cat of TEXT_TEMPLATE_CATEGORY_ORDER) map.set(cat, []);
  for (const t of templates) {
    const list = map.get(t.category) ?? [];
    list.push(t);
    map.set(t.category, list);
  }
  return TEXT_TEMPLATE_CATEGORY_ORDER.map((category) => ({
    category,
    items: map.get(category) ?? [],
  })).filter((g) => g.items.length > 0);
}

function cloneBubble(
  bubble: TextBubbleProps | undefined,
): TextBubbleProps | undefined {
  if (!bubble) return undefined;
  return { ...bubble };
}

/** Build full TextProps for a new timeline clip from a template. */
export function textPropsFromTemplate(entry: TextTemplateEntry): TextProps {
  const recipe = entry.recipe;
  const next: TextProps = {
    content: entry.defaultText,
    templateId: entry.id,
    stylePresetId: null,
  };

  for (const key of TEMPLATE_RECIPE_KEYS) {
    if (!(key in recipe)) continue;
    const value = recipe[key];
    if (key === "bubble") {
      next.bubble = cloneBubble(value as TextBubbleProps | undefined);
    } else if (value !== undefined) {
      (next as Record<string, unknown>)[key] = value;
    }
  }

  return next;
}

/**
 * Apply a template recipe onto an existing clip's text.
 * Keeps `content`; sets `templateId`; clears `stylePresetId`.
 */
export function applyTemplateRecipe(
  current: TextProps,
  entry: TextTemplateEntry,
): TextProps {
  const recipe = entry.recipe;
  const next: TextProps = {
    ...current,
    content: current.content,
    templateId: entry.id,
    stylePresetId: null,
  };

  for (const key of TEMPLATE_RECIPE_KEYS) {
    if (!(key in recipe)) continue;
    const value = recipe[key];
    if (key === "bubble") {
      next.bubble = cloneBubble(value as TextBubbleProps | undefined);
    } else if (value !== undefined) {
      (next as Record<string, unknown>)[key] = value;
    }
  }

  return next;
}
