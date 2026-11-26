import type { z } from "zod";

export type CapabilityRisk = "safe" | "review" | "skill";

export type CapabilityStatus = "stable" | "unavailable" | "experimental";

export type CapabilityVerb =
  | "inspect"
  | "patch"
  | "keyframe"
  | "timeline"
  | "capture"
  | "skill";

export type CapabilityDomain =
  | "project"
  | "session"
  | "clip"
  | "timeline"
  | "track"
  | "media"
  | "captions"
  | "assets"
  | "vision"
  | "skill.image"
  | "skill.voice"
  | `plugin.${string}`;

/** Compact row returned by capabilities_list. */
export type CapabilityIndexRow = {
  id: string;
  domain: CapabilityDomain | string;
  title: string;
  summary: string;
  verbs: CapabilityVerb[];
  targets: string[];
  risk: CapabilityRisk;
  skill: string | null;
  status: CapabilityStatus;
};

export type CapabilityDefinition = {
  id: string;
  domain: CapabilityDomain | string;
  title: string;
  summary: string;
  verbs: CapabilityVerb[];
  targets: string[];
  risk: CapabilityRisk;
  skill?: string | null;
  status?: CapabilityStatus;
  /** Zod schema describing patch/input contract for capability_describe. */
  schema: z.ZodType;
  /** Optional key into registerRecipe() short MD helpers. */
  recipeRef?: string | null;
  /** 1–2 illustrative examples for describe. */
  examples?: unknown[];
  /** Constraints / notes shown in describe. */
  constraints?: string[];
};

export type CatalogBuildOpts = {
  imageGemini?: boolean;
  voiceElevenlabs?: boolean;
};
