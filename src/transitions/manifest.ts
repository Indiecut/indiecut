/** Bundled transition presets — manifest imported (no public fetch). */

import type { TransitionCategory, TransitionDirection } from "../project/types";
import rawManifest from "../../assets/transitions/transitions.manifest.json";

export type TransitionManifestEntry = {
  id: string;
  name: string;
  category: TransitionCategory;
  defaultDurationMs: number;
  direction?: TransitionDirection;
  tags: string[];
};

export type TransitionManifest = {
  version: number;
  source: string;
  license: string;
  transitions: TransitionManifestEntry[];
};

export const TRANSITION_CATEGORY_ORDER: TransitionCategory[] = [
  "camera",
  "fade",
  "light",
  "glitch",
  "blur",
  "warp",
  "mask",
];

export const TRANSITION_CATEGORY_LABEL: Record<TransitionCategory, string> = {
  camera: "Camera",
  fade: "Fade",
  light: "Light",
  glitch: "Glitch",
  blur: "Blur",
  warp: "Warp",
  mask: "Mask",
};

const bundled = rawManifest as TransitionManifest;
const nameById = new Map<string, string>();
for (const t of bundled.transitions) {
  nameById.set(t.id, t.name);
}

export async function loadTransitionManifest(): Promise<TransitionManifest> {
  return bundled;
}

export function transitionDisplayName(presetId: string): string {
  return nameById.get(presetId) ?? presetId;
}

export function findTransition(
  manifest: TransitionManifest,
  presetId: string,
): TransitionManifestEntry | undefined {
  return manifest.transitions.find((t) => t.id === presetId);
}

export function groupTransitionsByCategory(
  transitions: TransitionManifestEntry[],
): { category: TransitionCategory; items: TransitionManifestEntry[] }[] {
  const map = new Map<TransitionCategory, TransitionManifestEntry[]>();
  for (const cat of TRANSITION_CATEGORY_ORDER) map.set(cat, []);
  for (const t of transitions) {
    const list = map.get(t.category) ?? [];
    list.push(t);
    map.set(t.category, list);
  }
  return TRANSITION_CATEGORY_ORDER.map((category) => ({
    category,
    items: map.get(category) ?? [],
  })).filter((g) => g.items.length > 0);
}
