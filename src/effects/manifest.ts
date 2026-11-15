/** Bundled video effects — manifest imported (no public fetch). */

import rawManifest from "../../assets/effects/effects.manifest.json";

export type EffectCategory = "basic";

export type EffectManifestEntry = {
  id: string;
  name: string;
  category: EffectCategory;
  defaultDurationMs: number;
  tags: string[];
};

export type EffectManifest = {
  version: number;
  source: string;
  license: string;
  effects: EffectManifestEntry[];
};

export const EFFECT_CATEGORY_ORDER: EffectCategory[] = ["basic"];

export const EFFECT_CATEGORY_LABEL: Record<EffectCategory, string> = {
  basic: "Basic",
};

const bundled = rawManifest as EffectManifest;
const nameById = new Map<string, string>();
for (const e of bundled.effects) {
  nameById.set(e.id, e.name);
}

export async function loadEffectManifest(): Promise<EffectManifest> {
  return bundled;
}

export function effectDisplayName(effectId: string): string {
  return nameById.get(effectId) ?? effectId;
}

export function findEffect(
  manifest: EffectManifest,
  effectId: string,
): EffectManifestEntry | undefined {
  return manifest.effects.find((e) => e.id === effectId);
}

export function groupEffectsByCategory(
  effects: EffectManifestEntry[],
): { category: EffectCategory; items: EffectManifestEntry[] }[] {
  const map = new Map<EffectCategory, EffectManifestEntry[]>();
  for (const cat of EFFECT_CATEGORY_ORDER) map.set(cat, []);
  for (const e of effects) {
    const list = map.get(e.category) ?? [];
    list.push(e);
    map.set(e.category, list);
  }
  return EFFECT_CATEGORY_ORDER.map((category) => ({
    category,
    items: map.get(category) ?? [],
  })).filter((g) => g.items.length > 0);
}
