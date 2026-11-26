import { z } from "zod";
import { listRegisteredCapabilities } from "./register";
import type {
  CapabilityDefinition,
  CapabilityIndexRow,
  CatalogBuildOpts,
} from "./types";

let domainsLoaded = false;

/** Ensure domain modules have registered (idempotent). */
export async function ensureCatalogLoaded(): Promise<void> {
  if (domainsLoaded) return;
  await import("./domains");
  domainsLoaded = true;
}

/** Sync ensure for tests that import domains directly. */
export function markCatalogLoaded(): void {
  domainsLoaded = true;
}

export function capabilityToIndexRow(
  def: CapabilityDefinition,
): CapabilityIndexRow {
  return {
    id: def.id,
    domain: def.domain,
    title: def.title,
    summary: def.summary,
    verbs: def.verbs,
    targets: def.targets,
    risk: def.risk,
    skill: def.skill ?? null,
    status: def.status ?? "stable",
  };
}

function skillAvailable(
  def: CapabilityDefinition,
  opts: CatalogBuildOpts,
): boolean {
  if (!def.skill) return true;
  if (def.skill.startsWith("image.")) return Boolean(opts.imageGemini);
  if (def.skill.startsWith("voice.")) return Boolean(opts.voiceElevenlabs);
  if (def.skill.startsWith("sfx.")) return Boolean(opts.sfxElevenlabs);
  return true;
}

export function buildCapabilityIndex(
  opts: CatalogBuildOpts = {},
): CapabilityIndexRow[] {
  return listRegisteredCapabilities()
    .map((def) => {
      const available = skillAvailable(def, opts);
      const row = capabilityToIndexRow(def);
      if (!available) {
        return { ...row, status: "unavailable" as const };
      }
      return row;
    })
    .filter((row) => {
      // Omit ungated skills entirely from list (plan: never half-register dead tools).
      if (row.skill && row.status === "unavailable") return false;
      return true;
    });
}

export function listAvailableDomains(opts: CatalogBuildOpts = {}): string[] {
  const domains = new Set<string>();
  for (const row of buildCapabilityIndex(opts)) {
    domains.add(row.domain);
  }
  return [...domains].sort();
}

export function listAvailableSkills(opts: CatalogBuildOpts = {}): string[] {
  const skills = new Set<string>();
  for (const row of buildCapabilityIndex(opts)) {
    if (row.skill) skills.add(row.skill);
  }
  return [...skills].sort();
}

/** One-screen domain index for system prompt (ids + one-liners). */
export function formatDomainIndexForPrompt(
  opts: CatalogBuildOpts = {},
): string {
  const byDomain = new Map<string, CapabilityIndexRow[]>();
  for (const row of buildCapabilityIndex(opts)) {
    const list = byDomain.get(row.domain) ?? [];
    list.push(row);
    byDomain.set(row.domain, list);
  }
  const lines: string[] = ["Capability domains (discover via capabilities_list):"];
  for (const domain of [...byDomain.keys()].sort()) {
    const rows = byDomain.get(domain)!;
    const titles = rows.map((r) => `${r.id}: ${r.summary}`).join("; ");
    lines.push(`- ${domain}: ${titles}`);
  }
  return lines.join("\n");
}

export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  try {
    const json = z.toJSONSchema(schema, { target: "draft-7" });
    return json as Record<string, unknown>;
  } catch {
    return { type: "object", description: "Schema export unavailable" };
  }
}

const RECIPE_CAP_BYTES = 2048;

const recipeMap: Record<string, string> = {};

/** Register short recipe MD for capability_describe (no dynamic Vite imports). */
export function registerRecipe(ref: string, body: string): void {
  recipeMap[ref] = body;
}

export function loadRecipeMarkdown(
  recipeRef: string | null | undefined,
): string | null {
  if (!recipeRef) return null;
  const text = recipeMap[recipeRef];
  if (!text) return null;
  if (text.length <= RECIPE_CAP_BYTES) return text;
  return `${text.slice(0, RECIPE_CAP_BYTES)}\n…[truncated]`;
}

export async function describeCapability(
  id: string,
): Promise<Record<string, unknown> | null> {
  const def = listRegisteredCapabilities().find((c) => c.id === id);
  if (!def) return null;
  return {
    id: def.id,
    domain: def.domain,
    title: def.title,
    summary: def.summary,
    verbs: def.verbs,
    targets: def.targets,
    risk: def.risk,
    skill: def.skill ?? null,
    status: def.status ?? "stable",
    schema: zodToJsonSchema(def.schema),
    constraints: def.constraints ?? [],
    examples: def.examples ?? [],
    recipe: loadRecipeMarkdown(def.recipeRef),
  };
}
