import { TOOLCRAFT_PRODUCT_MODULE_CONTRACT_VERSION } from "../contract/capability";
import { assertToolcraftProductModuleDefinition, type ToolcraftModuleDefinition } from "../contract/module-definition";

export type MissingRequirement = Readonly<{
  capabilityId: string;
  moduleId: string;
  path: readonly string[];
}>;
type DefaultProviderCatalog = readonly Readonly<{
  capabilityId: string;
  definition: ToolcraftModuleDefinition;
  id: string;
}>[];
export function validateContractVersion(definition: ToolcraftModuleDefinition) {
  if (
    definition.contractVersion !== TOOLCRAFT_PRODUCT_MODULE_CONTRACT_VERSION
  ) {
    throw new Error(
      `Toolcraft product module "${definition.id}" uses contract version ${definition.contractVersion}; expected current version ${TOOLCRAFT_PRODUCT_MODULE_CONTRACT_VERSION}.`,
    );
  }
}
export function getCatalogProvider(
  providerId: string,
  requirement: MissingRequirement,
  catalog: DefaultProviderCatalog,
) {
  const matches = catalog.filter(
    (candidate) => candidate.id === providerId,
  );
  const path = requirement.path.join(" -> ");
  if (matches.length > 1) {
    throw new Error(`Default provider "${providerId}" is registered more than once along requirement path ${path}.`);
  }
  const entry = matches[0];
  if (entry === undefined) {
    throw new Error(
      `Toolcraft default provider "${providerId}" for capability "${requirement.capabilityId}" is missing from the catalog along requirement path ${path}.`,
    );
  }
  if (entry.capabilityId !== requirement.capabilityId) {
    throw new Error(
      `Toolcraft default provider "${providerId}" supplies "${entry.capabilityId}" instead of "${requirement.capabilityId}" along requirement path ${path}.`,
    );
  }
  validateContractVersion(entry.definition);
  assertToolcraftProductModuleDefinition(entry.definition);
  if (!entry.definition.provides.includes(requirement.capabilityId)) {
    throw new Error(
      `Toolcraft default provider "${providerId}" module "${entry.definition.id}" does not provide "${requirement.capabilityId}" along requirement path ${path}.`,
    );
  }
  return entry.definition;
}
