import type {
  ToolcraftLineBudget,
  ToolcraftScriptLineBudgetPolicy,
} from "./toolcraft-delivery-architecture-policy.mjs";

export type ToolcraftLineBudgetViolation = Readonly<{
  lineCount: number;
  maxLines: number;
  reason: string;
  repoPath: string;
  scope: string;
}>;

export type ToolcraftCodeHealthResult = Readonly<{
  dependencyCycleAnalysisDeferred: boolean;
  dependencyCycleViolations: readonly unknown[];
  filesystemViolations: readonly unknown[];
  forbiddenPatternViolations: readonly unknown[];
  lineBudgetViolations: readonly ToolcraftLineBudgetViolation[];
  sourceFileCount: number;
}>;

export type ToolcraftCodeHealthOptions = Partial<
  ToolcraftScriptLineBudgetPolicy
> &
  Readonly<{
    dependencyCycleAliases?: readonly unknown[];
    dependencyCycleIgnoredFilePatterns?: readonly RegExp[];
    dependencyCycleIncludedFilePatterns?: readonly RegExp[];
    forbiddenPatterns?: readonly unknown[];
    frameworkPathPrefixes?: readonly string[];
    globalLineBudget?: ToolcraftLineBudget;
    ignoredFilePatterns?: readonly RegExp[];
    inventory?: unknown;
    localDependencyGraph?: unknown;
    productionEntryPaths?: readonly string[];
    protectedFilePaths?: readonly string[];
    rootDir: string;
    sourceExtensions?: ReadonlySet<string>;
    sourceRoots: readonly string[];
    testForbiddenPatterns?: readonly unknown[];
  }>;

export function evaluateCodeHealth(
  options: ToolcraftCodeHealthOptions,
): Promise<ToolcraftCodeHealthResult>;
