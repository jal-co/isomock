import path from "node:path";

import {
  createToolcraftLocalDependencyGraph,
  getToolcraftProductionCycleViolations,
} from "./toolcraft-local-dependency-graph.mjs";
import {
  defaultTestFilePatterns,
  getLineBudgetViolations,
  getLineCount,
  isTestFile,
  matchesToolcraftPathPatterns,
} from "./toolcraft-code-health-line-budget.mjs";
import { getToolcraftReachablePaths } from "./toolcraft-graph-reachability.mjs";
import {
  printToolcraftProductBoundaryResult,
  toolcraftProductBoundaryPassed,
} from "./toolcraft-product-boundary.mjs";
import { collectToolcraftSourceInventory } from "./toolcraft-source-inventory.mjs";
import { isToolcraftTypeScriptCompilerAvailable } from "./toolcraft-typescript-source-evidence.mjs";

export const defaultSourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".css",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);

export {
  defaultTestFilePatterns,
  getLineBudgetViolations,
  getLineCount,
  isTestFile,
};

export const defaultForbiddenPatterns = [
  {
    label: "@ts-ignore", // toolcraft-code-health-ignore policy self-definition
    pattern: /@ts-ignore/u, // toolcraft-code-health-ignore policy self-definition
    reason: "Type errors should be fixed or modeled explicitly, not suppressed.",
  },
  {
    label: "@ts-expect-error", // toolcraft-code-health-ignore policy self-definition
    pattern: /@ts-expect-error/u, // toolcraft-code-health-ignore policy self-definition
    reason:
      "Expected type failures need an explicit local test or typed boundary, not a blanket suppression.",
  },
  {
    label: "eslint-disable", // toolcraft-code-health-ignore policy self-definition
    pattern: /eslint-disable/u, // toolcraft-code-health-ignore policy self-definition
    reason: "Lint suppressions are architecture debt unless explicitly reviewed.",
  },
  {
    label: "biome-ignore", // toolcraft-code-health-ignore policy self-definition
    pattern: /biome-ignore/u, // toolcraft-code-health-ignore policy self-definition
    reason:
      "Formatter/linter suppressions are architecture debt unless explicitly reviewed.",
  },
  {
    label: "as any", // toolcraft-code-health-ignore policy self-definition
    pattern: /\bas\s+any\b/u,
    reason: "Use a typed boundary or narrow unknown values explicitly.",
  },
  {
    label: "explicit any annotation",
    pattern: /:\s*any\b/u,
    reason: "Use a concrete type, generic, or unknown with narrowing.",
  },
];

export const defaultTestForbiddenPatterns = defaultForbiddenPatterns.filter(
  (pattern) => pattern.label !== "@ts-expect-error", // toolcraft-code-health-ignore policy self-definition
);

const policySelfDefinitionPaths = new Set([
  "scripts/toolcraft-code-health-core.mjs",
  "starter/scripts/toolcraft-code-health-core.mjs",
]);

export function getForbiddenPatternViolations(
  repoPath,
  source,
  forbiddenPatterns = defaultForbiddenPatterns,
) {
  const violations = [];
  const lines = source.split(/\r\n|\r|\n/u);

  for (const [lineIndex, line] of lines.entries()) {
    if (
      policySelfDefinitionPaths.has(repoPath) &&
      line.includes("toolcraft-code-health-ignore")
    ) {
      continue;
    }

    for (const forbiddenPattern of forbiddenPatterns) {
      if (forbiddenPattern.pattern.test(line)) {
        violations.push({
          label: forbiddenPattern.label,
          line: lineIndex + 1,
          reason: forbiddenPattern.reason,
          repoPath,
        });
      }
    }
  }

  return violations;
}

export async function evaluateCodeHealth({
  dependencyCycleAliases = [],
  dependencyCycleIgnoredFilePatterns = [],
  dependencyCycleIncludedFilePatterns = [],
  forbiddenPatterns = defaultForbiddenPatterns,
  frameworkPathPrefixes = [],
  globalLineBudget,
  ignoredFilePatterns = [],
  inventory: providedInventory,
  localDependencyGraph: providedLocalDependencyGraph,
  rootDir,
  protectedFilePaths = [],
  productionEntryPaths = [],
  scopedLineBudgets = [],
  sourceExtensions = defaultSourceExtensions,
  sourceRoots,
  testFilePatterns = defaultTestFilePatterns,
  testForbiddenPatterns = defaultTestForbiddenPatterns,
  testLineBudget,
}) {
  const inventory =
    providedInventory ??
    (await collectToolcraftSourceInventory({
      frameworkPathPrefixes,
      protectedFilePaths,
      rootDir,
      sourceExtensions,
      sourceRoots,
      testFilePatterns,
    }));
  const filesystemViolations = inventory.filesystemViolations;
  const sourceFiles = inventory.entries.filter(
    ({ owner, repoPath }) =>
      owner === "product" &&
      sourceExtensions.has(path.extname(repoPath)) &&
      !matchesToolcraftPathPatterns(repoPath, ignoredFilePatterns),
  );
  const localDependencyGraph =
    providedLocalDependencyGraph ??
    (await createToolcraftLocalDependencyGraph({
      aliases: dependencyCycleAliases,
      entries: inventory.entries,
      rootDir,
      sourceRecordMode: "imports-only",
    }));
  const dependencyCycleAnalysisDeferred =
    !isToolcraftTypeScriptCompilerAvailable();
  const productionPaths = new Set(
    getToolcraftReachablePaths(localDependencyGraph, productionEntryPaths),
  );
  const dependencyCycleViolations =
    getToolcraftProductionCycleViolations(localDependencyGraph, {
      ignoredFilePatterns: [
        ...ignoredFilePatterns,
        ...dependencyCycleIgnoredFilePatterns,
      ],
      includedFilePatterns: dependencyCycleIncludedFilePatterns,
    });
  const lineBudgetViolations = [];
  const forbiddenPatternViolations = [];

  for (const { repoPath } of sourceFiles) {
    const source = localDependencyGraph.sourceRecords.get(repoPath)?.rawSource;
    if (source === undefined) {
      throw new Error(
        `Canonical dependency graph is missing source evidence for ${repoPath}.`,
      );
    }
    const lineCount = getLineCount(source);

    lineBudgetViolations.push(
      ...getLineBudgetViolations(repoPath, lineCount, {
        globalLineBudget,
        productionFile: productionPaths.has(repoPath),
        scopedLineBudgets,
        testFilePatterns,
        testLineBudget,
      }),
    );

    forbiddenPatternViolations.push(
      ...getForbiddenPatternViolations(
        repoPath,
        source,
        !productionPaths.has(repoPath) &&
          isTestFile(repoPath, testFilePatterns)
          ? testForbiddenPatterns
          : forbiddenPatterns,
      ),
    );
  }

  return {
    dependencyCycleAnalysisDeferred,
    dependencyCycleViolations,
    filesystemViolations,
    forbiddenPatternViolations,
    lineBudgetViolations,
    sourceFileCount: sourceFiles.length,
  };
}

export function printCodeHealthResult(result, logger = console) {
  if (result.dependencyCycleAnalysisDeferred) {
    logger.warn(
      "Product dependency cycle analysis deferred until TypeScript is installed.",
    );
  }

  if (result.filesystemViolations.length > 0) {
    logger.error("\nFilesystem boundary violations:");
    for (const violation of result.filesystemViolations) {
      logger.error(`- ${violation.repoPath}`);
      logger.error(`  ${violation.reason}`);
    }
  }

  if (result.lineBudgetViolations.length > 0) {
    logger.error("\nLine budget violations:");
    for (const violation of result.lineBudgetViolations) {
      logger.error(
        `- ${violation.repoPath}: ${violation.lineCount}/${violation.maxLines} lines (${violation.scope})`,
      );
      logger.error(`  ${violation.reason}`);
    }
  }

  if (result.dependencyCycleViolations.length > 0) {
    logger.error("\nProduct dependency cycles:");
    for (const violation of result.dependencyCycleViolations) {
      logger.error(`- ${violation.cycle.join(" -> ")}`);
      logger.error(`  ${violation.reason}`);
    }
  }

  if (result.forbiddenPatternViolations.length > 0) {
    logger.error("\nForbidden escape hatches:");
    for (const violation of result.forbiddenPatternViolations) {
      logger.error(
        `- ${violation.repoPath}:${violation.line} uses ${violation.label}`,
      );
      logger.error(`  ${violation.reason}`);
    }
  }

  if (
    result.productBoundary &&
    !toolcraftProductBoundaryPassed(result.productBoundary)
  ) {
    logger.error("\nProduct boundary violations:");
    printToolcraftProductBoundaryResult(result.productBoundary, logger);
  }
}

export function codeHealthPassed(result) {
  return (
    result.filesystemViolations.length === 0 &&
    result.dependencyCycleViolations.length === 0 &&
    result.lineBudgetViolations.length === 0 &&
    result.forbiddenPatternViolations.length === 0 &&
    (!result.productBoundary ||
      toolcraftProductBoundaryPassed(result.productBoundary))
  );
}
