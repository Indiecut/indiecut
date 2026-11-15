/** Bundled text In/Out/Loop presets — served from /text-animations via Vite public. */

import type { TextAnimationGranularity } from "../project/types";

export type TextAnimPhaseKind = "in" | "out" | "loop";

export type TextAnimManifestEntry = {
  id: string;
  name: string;
  phase: TextAnimPhaseKind;
  thumb?: string;
  defaultDurationMs?: number;
  supportsDirection?: boolean;
  aliasOf?: string;
  preferGranularity?: TextAnimationGranularity;
};

export type TextAnimManifest = {
  version: number;
  presets: TextAnimManifestEntry[];
};

export function textAnimManifestUrl(): string {
  const base = import.meta.env.BASE_URL || "./";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}text-animations/text-animations.manifest.json`;
}

export function textAnimThumbUrl(thumb: string): string {
  const base = import.meta.env.BASE_URL || "./";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}text-animations/${thumb}`;
}

let cached: TextAnimManifest | null = null;

export async function loadTextAnimManifest(): Promise<TextAnimManifest> {
  if (cached) return cached;
  const res = await fetch(textAnimManifestUrl());
  if (!res.ok) {
    throw new Error(`Failed to load text-animations manifest (${res.status})`);
  }
  cached = (await res.json()) as TextAnimManifest;
  return cached;
}

export function presetsForPhase(
  manifest: TextAnimManifest,
  phase: TextAnimPhaseKind,
): TextAnimManifestEntry[] {
  return manifest.presets.filter((p) => p.phase === phase);
}

export function findTextAnimPreset(
  manifest: TextAnimManifest,
  phase: TextAnimPhaseKind,
  id: string,
): TextAnimManifestEntry | undefined {
  return manifest.presets.find((p) => p.phase === phase && p.id === id);
}
