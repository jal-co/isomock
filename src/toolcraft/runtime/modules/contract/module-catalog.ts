import type { ToolcraftDefaultProviderId, ToolcraftProductCapabilityId } from "./capability";
import type { ToolcraftProductModuleDefinition } from "./module-definition";
import type { ToolcraftContributionValidator } from "./validate-module-contribution";

export type ToolcraftDefaultProviderCatalog = readonly Readonly<{
  capabilityId: ToolcraftProductCapabilityId;
  definition: ToolcraftProductModuleDefinition;
  id: ToolcraftDefaultProviderId;
}>[];
export type ToolcraftModuleCatalog = Readonly<{
  defaultProviders: ToolcraftDefaultProviderCatalog;
  validateContribution: ToolcraftContributionValidator;
}>;
