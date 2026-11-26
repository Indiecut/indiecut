/** Bundled text templates — manifest imported (no public fetch). */

import rawManifest from "../../../../assets/text-templates/manifest.json";
import type {
  TextAnimationParams,
  TextBubbleProps,
  TextProps,
  TextRun,
} from "../project/types";
import { normalizeTextProps, plainContent } from "../text/runs";

export type TextTemplateCategory =
  | "title"
  | "social"
  | "vlog"
  | "outro"
  | "promo"
  | "lower"
  | "gaming"
  | "caption";

/** Box-level recipe (typography defaults + chrome). Run styles live in defaultRuns. */
export type TextTemplateRecipe = Partial<
  Omit<TextProps, "content" | "runs" | "templateId" | "stylePresetId">
>;

export type TextTemplateEntry = {
  id: string;
  name: string;
  category: TextTemplateCategory;
  /** Rich showcase content (source of truth for new clips / apply). */
  defaultRuns: TextRun[];
  /** Plain join of defaultRuns — labels / search / legacy. */
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

/** Style keys a template recipe may overwrite on the box. */
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

function hydrateEntry(raw: Record<string, unknown>): TextTemplateEntry {
  const defaultRuns = Array.isArray(raw.defaultRuns)
    ? (raw.defaultRuns as TextRun[])
    : [
        {
          text:
            typeof raw.defaultText === "string" ? raw.defaultText : "Text",
        },
      ];
  const defaultText =
    typeof raw.defaultText === "string"
      ? raw.defaultText
      : plainContent(defaultRuns);
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    category: raw.category as TextTemplateCategory,
    defaultRuns,
    defaultText,
    recipe: (raw.recipe ?? {}) as TextTemplateRecipe,
    defaultAnimation: raw.defaultAnimation as TextAnimationParams | undefined,
  };
}

const bundledRaw = rawManifest as {
  version: number;
  source: string;
  license: string;
  templates: Array<Record<string, unknown>>;
};
const bundled: TextTemplateManifest = {
  version: bundledRaw.version,
  source: bundledRaw.source,
  license: bundledRaw.license,
  templates: bundledRaw.templates.map(hydrateEntry),
};
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

function cloneRuns(runs: TextRun[]): TextRun[] {
  return runs.map((r) => ({
    text: r.text,
    style: r.style ? { ...r.style } : undefined,
  }));
}

/** Build full TextProps for a new timeline clip from a template. */
export function textPropsFromTemplate(entry: TextTemplateEntry): TextProps {
  const recipe = entry.recipe;
  const runs = cloneRuns(entry.defaultRuns);
  const next: TextProps = {
    content: plainContent(runs),
    runs,
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

  return normalizeTextProps(next);
}

/**
 * Apply a rich template: replaces runs + content with defaultRuns and box recipe.
 */
export function applyTemplateRecipe(
  current: TextProps,
  entry: TextTemplateEntry,
): TextProps {
  const recipe = entry.recipe;
  const runs = cloneRuns(entry.defaultRuns);
  const next: TextProps = {
    ...current,
    content: plainContent(runs),
    runs,
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

  return normalizeTextProps(next);
}
