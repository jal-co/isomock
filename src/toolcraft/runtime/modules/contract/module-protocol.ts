/** Mechanism-level declaration; product API specializes this to its trusted catalog. */
export type ToolcraftModuleContributionIdentity = Readonly<{ id: string; kind: string; moduleId: string; }>;
export type ToolcraftModuleRecord = Readonly<{
  contractVersion: number;
  id: string;
  contributions: readonly ToolcraftModuleContributionIdentity[];
  defaultProviders: readonly Readonly<{ capabilityId: string; providerId: string; }>[];
  provides: readonly string[];
  requires: readonly string[];
  portRequirements: readonly Readonly<{ applicability: string; id: string; }>[];
}>;
