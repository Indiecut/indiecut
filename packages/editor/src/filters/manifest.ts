/** Bundled filter LUT pack — manifest bundled; .cube files served from /filters. */

import type { FilterCategory } from "../project/types";
import rawManifest from "../../../../assets/filters/filters.manifest.json";

export type FilterManifestEntry = {
  id: string;
  name: string;
  file: string;
  category: FilterCategory;
  tags: string[];
};

export type FilterManifest = {
  version: number;
  source: string;
  license: string;
  filters: FilterManifestEntry[];
};

export const FILTER_CATEGORY_ORDER: FilterCategory[] = [
  "life",
  "movies",
  "retro",
  "nature",
  "food",
  "bw",
  "technical",
  "custom",
];

export const FILTER_CATEGORY_LABEL: Record<FilterCategory, string> = {
  life: "Life / Portrait",
  movies: "Movies",
  retro: "Retro",
  nature: "Nature",
  food: "Food",
  bw: "B&W",
  technical: "Technical",
  custom: "Custom",
};

function publicRoot(): string {
  const base = import.meta.env.BASE_URL || "./";
  return base.endsWith("/") ? base : `${base}/`;
}

export function filterLutUrl(file: string): string {
  return `${publicRoot()}filters/${file}`;
}

const bundled = rawManifest as FilterManifest;
const nameById = new Map<string, string>();
for (const f of bundled.filters) {
  nameById.set(f.id, f.name);
}

export async function loadFilterManifest(): Promise<FilterManifest> {
  return bundled;
}

export function filterDisplayName(lutId: string): string {
  return nameById.get(lutId) ?? lutId;
}

export function findFilter(
  manifest: FilterManifest,
  lutId: string,
): FilterManifestEntry | undefined {
  return manifest.filters.find((f) => f.id === lutId);
}

export function groupFiltersByCategory(
  filters: FilterManifestEntry[],
): { category: FilterCategory; items: FilterManifestEntry[] }[] {
  const map = new Map<FilterCategory, FilterManifestEntry[]>();
  for (const cat of FILTER_CATEGORY_ORDER) map.set(cat, []);
  for (const f of filters) {
    const list = map.get(f.category) ?? [];
    list.push(f);
    map.set(f.category, list);
  }
  return FILTER_CATEGORY_ORDER.map((category) => ({
    category,
    items: map.get(category) ?? [],
  })).filter((g) => g.items.length > 0);
}
