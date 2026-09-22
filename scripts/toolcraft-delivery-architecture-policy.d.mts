export type ToolcraftLineBudget = Readonly<{
  maxLines: number;
  pathPattern?: RegExp;
  prefix?: string;
  priority?: number;
  reason: string;
  scope?: string;
}>;

export type ToolcraftScriptLineBudgetPolicy = Readonly<{
  scopedLineBudgets: readonly ToolcraftLineBudget[];
  testFilePatterns: readonly RegExp[];
  testLineBudget: Readonly<{
    maxLines: number;
    reason: string;
  }>;
}>;

export type ToolcraftCheckpointOwnershipViolation = Readonly<{
  importerRepoPath: string;
  operation: string;
  ownerRepoPath: string;
}>;

export type ToolcraftDeliveryArchitectureReport = Readonly<
  Record<string, unknown> & {
    checkpointOwnershipViolations:
      readonly ToolcraftCheckpointOwnershipViolation[];
    currentOrchestrationPaths: readonly string[];
    productionModuleCount: number;
    productionPaths: readonly string[];
  }
>;

export const toolcraftScriptSourceExtensions: ReadonlySet<string>;

export function classifyToolcraftDeliveryArchitectureRole(
  repoPath: string,
): "orchestration" | "shared-foundation" | "support";

export function getToolcraftScriptProductionEntryPaths(
  scriptsRoot: string,
): readonly string[];

export function createToolcraftScriptLineBudgetPolicy(
  scriptsRoot: string,
): ToolcraftScriptLineBudgetPolicy;

export function createToolcraftDeliveryArchitectureReport(
  options?: Readonly<Record<string, unknown>>,
): Promise<ToolcraftDeliveryArchitectureReport>;
