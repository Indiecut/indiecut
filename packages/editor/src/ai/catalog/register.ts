import type { CapabilityDefinition } from "./types";

const registry = new Map<string, CapabilityDefinition>();

export function registerCapability(def: CapabilityDefinition): void {
  if (registry.has(def.id)) {
    throw new Error(`Duplicate capability id: ${def.id}`);
  }
  registry.set(def.id, {
    ...def,
    skill: def.skill ?? null,
    status: def.status ?? "stable",
  });
}

export function getCapability(id: string): CapabilityDefinition | undefined {
  return registry.get(id);
}

export function listRegisteredCapabilities(): CapabilityDefinition[] {
  return [...registry.values()];
}

/** Test helper — wipe registrations between suites. */
export function clearCapabilityRegistry(): void {
  registry.clear();
}
