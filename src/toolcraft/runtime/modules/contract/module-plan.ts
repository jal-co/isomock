import type {
  ToolcraftProductCapabilityId,
  ToolcraftProductModuleId,
} from "./capability";
import type {
  ToolcraftModuleOwnershipKey,
  ToolcraftProductModuleContribution,
  ToolcraftProductModuleContributionId,
} from "./contribution";
import type { ToolcraftProductIntegrationPortRequirement } from "./integration-port";

export type ResolvedModuleOrigin = "default-provider" | "explicit";

export type ResolvedProductModule = {
  readonly id: ToolcraftProductModuleId;
  readonly origin: ResolvedModuleOrigin;
  readonly provides: readonly ToolcraftProductCapabilityId[];
  readonly requestedBy: readonly ToolcraftProductModuleId[];
  readonly requires: readonly ToolcraftProductCapabilityId[];
};

export type ResolvedCapabilityProvider = {
  readonly capabilityId: ToolcraftProductCapabilityId;
  readonly moduleId: ToolcraftProductModuleId;
};

export type ResolvedProductModulePlan = {
  readonly capabilities: readonly ResolvedCapabilityProvider[];
  readonly modules: readonly ResolvedProductModule[];
  readonly ownership: readonly {
    readonly contributionId: ToolcraftProductModuleContributionId;
    readonly kind: ToolcraftProductModuleContribution["kind"];
    readonly moduleId: ToolcraftProductModuleId;
    readonly ownershipKeys: readonly ToolcraftModuleOwnershipKey[];
  }[];
  readonly portRequirements: readonly {
    readonly applicability: ToolcraftProductIntegrationPortRequirement["applicability"];
    readonly consumers: readonly ToolcraftProductModuleId[];
    readonly id: ToolcraftProductIntegrationPortRequirement["id"];
  }[];
};
