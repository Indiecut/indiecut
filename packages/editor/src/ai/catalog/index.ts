export type {
  CapabilityDefinition,
  CapabilityDomain,
  CapabilityIndexRow,
  CapabilityRisk,
  CapabilityStatus,
  CapabilityVerb,
  CatalogBuildOpts,
} from "./types";
export {
  registerCapability,
  getCapability,
  listRegisteredCapabilities,
  clearCapabilityRegistry,
} from "./register";
export {
  ensureCatalogLoaded,
  markCatalogLoaded,
  buildCapabilityIndex,
  listAvailableDomains,
  listAvailableSkills,
  formatDomainIndexForPrompt,
  describeCapability,
  zodToJsonSchema,
  registerRecipe,
  capabilityToIndexRow,
} from "./buildCatalog";

/** Side-effect: register all host capabilities. */
import "./domains";
