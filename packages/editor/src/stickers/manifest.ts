/**
 * IndieCut kinetic sticker pack — original text-free SVGs generated at runtime.
 */

import { SHAPE_STICKER_ID } from "../project/types";
import {
  filterKineticStickers,
  getKineticSticker,
  KINETIC_CATEGORIES,
  KINETIC_STICKERS,
  type KineticCategoryId,
  type KineticStickerDef,
} from "./kinetic";
import {
  defaultShapeStickerStyle,
  SHAPE_STICKER_PRESETS,
} from "./shapeStickerSvg";

export type StickerManifestEntry = {
  id: string;
  name: string;
  file: string;
  group: string;
  subgroup?: string;
  tags: string[];
  defaultDurationMs: number;
  template: string;
  colorRole: string;
  slug: string;
  catIndex: number;
};

export type StickerManifest = {
  version: number;
  source: string;
  license: string;
  stickers: StickerManifestEntry[];
};

export const STICKER_GROUP_ORDER = KINETIC_CATEGORIES.map((c) => c.id);

export type StickerGroupId = KineticCategoryId | string;

export const STICKER_GROUP_LABEL: Record<string, string> = {
  shapes: "Shapes",
  ...Object.fromEntries(KINETIC_CATEGORIES.map((c) => [c.id, c.name])),
};

export const STICKER_GROUP_ORDER_WITH_SHAPES = [
  "shapes",
  ...STICKER_GROUP_ORDER,
];

export function shapeStickerManifestEntries(): StickerManifestEntry[] {
  return SHAPE_STICKER_PRESETS.map((p, i) => ({
    id: `${SHAPE_STICKER_ID}:${p.id}`,
    name: p.label,
    file: `shape/${p.id}.svg`,
    group: "shapes",
    tags: ["shape", "vector", p.id],
    defaultDurationMs: 3000,
    template: p.id,
    colorRole: "primary",
    slug: `shape-${p.id}`,
    catIndex: i,
  }));
}

/** Logical sticker size in composition pixels (kinetic viewBox 256 → layout 256). */
export const STICKER_LOGICAL_SIZE = 256;

/**
 * Rasterize larger than layout so scaled preview/export stays sharp.
 * Default scale ~1 shows ~256px; scale 2 still looks crisp at 512.
 */
export const STICKER_RASTER_SIZE = 512;

const nameById = new Map<string, string>();
let cached: StickerManifest | null = null;

function defToEntry(def: KineticStickerDef): StickerManifestEntry {
  return {
    id: def.id,
    name: def.title,
    file: `kinetic/${def.slug}.svg`,
    group: def.category,
    subgroup: def.template,
    tags: [def.subtitle, def.template, def.category, def.slug].filter(Boolean),
    defaultDurationMs: 3000,
    template: def.template,
    colorRole: def.colorRole,
    slug: def.slug,
    catIndex: def.catIndex,
  };
}

function buildManifest(): StickerManifest {
  const stickers = [
    ...shapeStickerManifestEntries(),
    ...KINETIC_STICKERS.map(defToEntry),
  ];
  for (const s of stickers) nameById.set(s.id, s.name);
  nameById.set(SHAPE_STICKER_ID, "Shape");
  return {
    version: 4,
    source: "IndieCut Kinetic + Shapes (original, text-free)",
    license: "Original IndieCut assets — see stickers/LICENSE.md",
    stickers,
  };
}

/** Sync — kinetic pack is bundled in JS, no network fetch. */
export async function loadStickerManifest(): Promise<StickerManifest> {
  if (cached) return cached;
  cached = buildManifest();
  return cached;
}

export function stickerDisplayName(stickerId: string): string {
  if (nameById.size === 0) void buildManifest();
  return nameById.get(stickerId) ?? stickerId;
}

export function findSticker(
  manifest: StickerManifest,
  stickerId: string,
): StickerManifestEntry | undefined {
  if (stickerId === SHAPE_STICKER_ID || stickerId.startsWith(`${SHAPE_STICKER_ID}:`)) {
    const preset = stickerId.includes(":")
      ? stickerId.slice(SHAPE_STICKER_ID.length + 1)
      : "star";
    return (
      manifest.stickers.find((s) => s.id === stickerId) ?? {
        id: SHAPE_STICKER_ID,
        name: "Shape",
        file: `shape/${preset}.svg`,
        group: "shapes",
        tags: ["shape", "vector", preset],
        defaultDurationMs: 3000,
        template: preset,
        colorRole: "primary",
        slug: `shape-${preset}`,
        catIndex: -1,
      }
    );
  }
  return (
    manifest.stickers.find((s) => s.id === stickerId) ??
    (() => {
      const def = getKineticSticker(stickerId);
      return def ? defToEntry(def) : undefined;
    })()
  );
}

export function stickerGroupsFromManifest(
  stickers: StickerManifestEntry[],
): { id: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of stickers) {
    counts.set(s.group, (counts.get(s.group) ?? 0) + 1);
  }
  const ordered: { id: string; label: string; count: number }[] = [];
  for (const id of STICKER_GROUP_ORDER_WITH_SHAPES) {
    const count = counts.get(id);
    if (!count) continue;
    ordered.push({
      id,
      label: STICKER_GROUP_LABEL[id] ?? id,
      count,
    });
    counts.delete(id);
  }
  for (const [id, count] of [...counts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    ordered.push({
      id,
      label: STICKER_GROUP_LABEL[id] ?? id,
      count,
    });
  }
  return ordered;
}

export function filterStickers(
  stickers: StickerManifestEntry[],
  opts: {
    group?: string | null;
    query?: string;
  },
): StickerManifestEntry[] {
  if (opts.group === "shapes") {
    const q = (opts.query ?? "").trim().toLowerCase();
    return stickers.filter((s) => {
      if (s.group !== "shapes") return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }
  const filtered = filterKineticStickers({
    category: opts.group ?? undefined,
    query: opts.query,
  });
  const allow = new Set(filtered.map((d) => d.id));
  return stickers.filter((s) => {
    if (s.group === "shapes") {
      if (opts.group) return false;
      const q = (opts.query ?? "").trim().toLowerCase();
      if (!q) return false;
      return (
        s.name.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (opts.group && s.group !== opts.group) return false;
    return allow.has(s.id);
  });
}

export { defaultShapeStickerStyle };

/** Resolve kinetic def for SVG generation. */
export function stickerDefForId(
  stickerId: string,
): KineticStickerDef | undefined {
  return getKineticSticker(stickerId);
}
