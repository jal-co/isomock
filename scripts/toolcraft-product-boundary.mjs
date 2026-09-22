#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createToolcraftPrivateEvidenceImportViolation } from "./toolcraft-product-evidence-import-policy.mjs";
import { getToolcraftResolvedUiModuleKind } from
  "./toolcraft-product-boundary-module-policy.mjs";
import { isToolcraftTypeScriptCompilerAvailable } from "./toolcraft-typescript-source-evidence.mjs";

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

const capabilityProofPathPattern =
  /^src\/app\/acceptance\/capability-proofs(?:\/|$)/u;
const runtimeProductionPathPattern = /^src\/toolcraft\/runtime(?:\/|$)/u;
const starterVerificationPathPattern =
  /^src\/app\/(?:acceptance(?:\/|$)|app-acceptance(?:[./]|$)|test-evidence(?:\/|$))/u;
const runtimeForbiddenImportPathPattern =
  /^(?:src\/app(?:\/|$)|e2e(?:\/|$))/u;

function createCapabilityProofBoundaryViolation(entry, moduleImport) {
  if (
    starterVerificationPathPattern.test(entry.repoPath) ||
    !capabilityProofPathPattern.test(moduleImport.resolvedRepoPath ?? "")
  ) {
    return null;
  }

  return {
    column: 1,
    kind: "capability-proof-boundary",
    line: 1,
    message:
      "Capability proof recipes are verification-owned. Product and runtime production source must not import or bridge them.",
    repoPath: entry.repoPath,
  };
}

function createRuntimeProductBoundaryViolation(entry, moduleImport) {
  const importedPath = moduleImport.resolvedRepoPath ?? "";
  if (
    !runtimeForbiddenImportPathPattern.test(importedPath) ||
    capabilityProofPathPattern.test(importedPath)
  ) {
    return null;
  }

  return {
    column: 1,
    kind: "starter-verification-boundary",
    line: 1,
    message:
      "Runtime production source must not import starter app or browser verification source.",
    repoPath: entry.repoPath,
  };
}

export async function evaluateToolcraftProductBoundary({
  aliases,
  allowMissingCompiler = false,
  inventory: providedInventory,
  localDependencyGraph: providedLocalDependencyGraph,
  protectedFilePaths,
  rootDir,
} = {}) {
  const resolvedRootDir =
    rootDir ?? path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  if (!isToolcraftTypeScriptCompilerAvailable()) {
    if (!allowMissingCompiler) {
      throw new Error(
        "TypeScript is required to evaluate the Toolcraft product boundary.",
      );
    }
    return {
      filesystemViolations: [],
      productSourceCount: 0,
      skippedReason:
        "Toolcraft product boundary check passed (dependency-backed graph and AST checks are deferred until dependencies are installed).",
      violations: [],
    };
  }
  const [
    { createToolcraftLocalDependencyGraph },
    dependencyResolution,
    { collectToolcraftFrameworkOwnedLocalPaths },
    { collectToolcraftProductProgramBoundaryEvidence },
    { collectToolcraftSourceInventory },
  ] = await Promise.all([
    import("./toolcraft-local-dependency-graph.mjs"),
    import("./toolcraft-product-dependency-resolution.mjs"),
    import("./toolcraft-source-ownership.mjs"),
    import("./toolcraft-product-program-boundary-evidence.mjs"),
    import("./toolcraft-source-inventory.mjs"),
  ]);
  const resolvedProtectedFilePaths =
    protectedFilePaths ??
    (await collectToolcraftFrameworkOwnedLocalPaths(resolvedRootDir));
  const inventory =
    providedInventory ??
    (await collectToolcraftSourceInventory({
      includeResourceFiles: true,
      protectedFilePaths: resolvedProtectedFilePaths,
      rootDir: resolvedRootDir,
      sourceRoots: ["src", "e2e"],
    }));
  const configuredAliases =
    aliases ??
    (await dependencyResolution.loadToolcraftLocalModuleAliases({
      rootDir: resolvedRootDir,
      tsconfigPaths: ["tsconfig.json"],
    }));
  const localAliases = [
    ...configuredAliases,
    ...dependencyResolution.createToolcraftDefaultSourceAliases(
      resolvedRootDir,
    ),
  ];
  const localDependencyGraph =
    providedLocalDependencyGraph ??
    (await createToolcraftLocalDependencyGraph({
      aliases: localAliases,
      entries: inventory.entries,
      // Framework files participate in import resolution, but product-only AST
      // policy must not be evaluated against every copied framework module.
      sourceRecordMode: "imports-only",
      fullEvidenceEntryPaths: inventory.entries
        .filter((entry) => entry.owner === "product")
        .map((entry) => entry.repoPath),
      rootDir: resolvedRootDir,
    }));
  const productEntries = localDependencyGraph.entries.filter(
    (entry) =>
      /^(?:e2e|src)\//u.test(entry.repoPath) &&
      entry.owner === "product" &&
      entry.role === "production" &&
      (dependencyResolution.toolcraftModuleExtensions.includes(
        path.extname(entry.repoPath),
      ) ||
        /\.css$/u.test(entry.repoPath)),
  );
  const productProgramViolations =
    collectToolcraftProductProgramBoundaryEvidence({
      aliases: localAliases,
      entries: localDependencyGraph.entries,
      inspectedEntries: productEntries.filter((entry) =>
        /\.[cm]?[jt]sx?$/u.test(entry.repoPath)
      ),
      rootDir: resolvedRootDir,
      moduleImports: localDependencyGraph.moduleImports,
      sourceRecords: localDependencyGraph.sourceRecords,
    });
  const violations = [];
  const entryByRepoPath = new Map(
    localDependencyGraph.entries.map((entry) => [entry.repoPath, entry]),
  );
  const importsByImporter = new Map();
  for (const evidence of localDependencyGraph.moduleImports) {
    const importerEvidence = importsByImporter.get(evidence.importerRepoPath) ?? [];
    importerEvidence.push(evidence);
    importsByImporter.set(evidence.importerRepoPath, importerEvidence);
  }
  const appendPrivateEvidenceImportViolations = (entry) => {
    for (const moduleImport of importsByImporter.get(entry.repoPath) ?? []) {
      const violation = createToolcraftPrivateEvidenceImportViolation({
        importerRepoPath: entry.repoPath,
        moduleImport,
      });
      if (violation) violations.push(violation);
    }
  };

  for (const entry of productEntries) {
    const sourceRecord = localDependencyGraph.sourceRecords.get(entry.repoPath);
    if (/\.css$/u.test(entry.repoPath)) {
      violations.push(...sourceRecord.cssEvidence.violations);
      continue;
    }
    if (!/\.[cm]?[jt]sx?$/u.test(entry.repoPath)) continue;
    const boundaryEvidence = sourceRecord.boundaryEvidence;
    if (!boundaryEvidence) {
      throw new Error(
        `Canonical dependency graph is missing TypeScript boundary evidence for ${entry.repoPath}.`,
      );
    }
    const productSourceViolations =
      productProgramViolations.get(entry.repoPath) ??
      boundaryEvidence.productSourceViolations;
    violations.push(
      ...productSourceViolations,
      ...boundaryEvidence.reservedEvidenceViolations,
      ...boundaryEvidence.playwrightAuthorityViolations,
    );
    appendPrivateEvidenceImportViolations(entry);
    for (const evidence of importsByImporter.get(entry.repoPath) ?? []) {
      const uiModuleKind = getToolcraftResolvedUiModuleKind({
        moduleSpecifier: evidence.specifier ?? "",
        resolvedRepoPath: evidence.resolvedRepoPath,
      });
      const uiModuleAlreadyReported = uiModuleKind &&
        productSourceViolations.some((violation) =>
          violation.kind === "private-ui-implementation" &&
          violation.line === evidence.line
        );
      if (uiModuleKind && !uiModuleAlreadyReported) {
        violations.push({
          column: evidence.column,
          kind: "private-ui-implementation",
          line: evidence.line,
          message:
            "Product source may import Toolcraft UI only from the exact public @/toolcraft/ui root target.",
          repoPath: entry.repoPath,
        });
      }
      const capabilityProofViolation =
        createCapabilityProofBoundaryViolation(entry, evidence);
      if (capabilityProofViolation) violations.push(capabilityProofViolation);
      if (evidence.resolution === "outside-inventory") {
        violations.push({
          column: 1,
          kind: "source-boundary-escape",
          line: 1,
          message: `Product production source must stay under the scanned src boundary. Move ${evidence.resolvedRepoPath} under src before importing it.`,
          repoPath: entry.repoPath,
        });
      }
      const importedEntry = entryByRepoPath.get(evidence.resolvedRepoPath);
      if (
        importedEntry?.role === "test" ||
        importedEntry?.role === "test-support" ||
        ((evidence.resolution === "outside-inventory" ||
          evidence.resolution === "unresolved-local") &&
          /(?:^|\/)[^/]+\.(?:test|spec)(?:\.[cm]?[jt]sx?)?$/u.test(
            evidence.specifier,
          ))
      ) {
        violations.push({
          column: 1,
          kind: "production-test-import",
          line: 1,
          message: `Production source must not import test or test-support module ${evidence.specifier}. Move reusable product code into an explicit production module.`,
          repoPath: entry.repoPath,
        });
      }
    }
  }

  for (const entry of localDependencyGraph.entries) {
    if (
      !/^(?:e2e|src)\//u.test(entry.repoPath) ||
      entry.owner !== "product" ||
      (entry.role !== "test" && entry.role !== "test-support") ||
      !/\.[cm]?[jt]sx?$/u.test(entry.repoPath)
    ) {
      continue;
    }
    const sourceRecord = localDependencyGraph.sourceRecords.get(entry.repoPath);
    const boundaryEvidence = sourceRecord.boundaryEvidence;
    if (!boundaryEvidence) {
      throw new Error(
        `Canonical dependency graph is missing TypeScript boundary evidence for ${entry.repoPath}.`,
      );
    }
    violations.push(
      ...boundaryEvidence.reservedEvidenceViolations,
      ...boundaryEvidence.playwrightAuthorityViolations,
      ...boundaryEvidence.moduleLoadingViolations,
    );
    appendPrivateEvidenceImportViolations(entry);
  }

  for (const entry of localDependencyGraph.entries) {
    if (
      entry.owner !== "framework" ||
      entry.role !== "production" ||
      !runtimeProductionPathPattern.test(entry.repoPath)
    ) {
      continue;
    }

    for (const moduleImport of importsByImporter.get(entry.repoPath) ?? []) {
      const capabilityProofViolation =
        createCapabilityProofBoundaryViolation(entry, moduleImport);
      if (capabilityProofViolation) violations.push(capabilityProofViolation);
      const runtimeProductViolation =
        createRuntimeProductBoundaryViolation(entry, moduleImport);
      if (runtimeProductViolation) {
        violations.push(runtimeProductViolation);
      }
    }
  }

  return {
    filesystemViolations: inventory.filesystemViolations,
    productSourceCount: productEntries.length,
    violations: violations.sort(
      (left, right) =>
        compareCodeUnits(left.repoPath, right.repoPath) ||
        left.line - right.line ||
        left.column - right.column,
    ),
  };
}

export function printToolcraftProductBoundaryResult(result, logger = console) {
  for (const violation of result.filesystemViolations) {
    logger.error(`- ${violation.repoPath}: ${violation.reason}`);
  }
  for (const violation of result.violations) {
    logger.error(
      `- ${violation.repoPath}:${violation.line}:${violation.column}: ${violation.message}`,
    );
  }
}

export function toolcraftProductBoundaryPassed(result) {
  return (
    result.filesystemViolations.length === 0 && result.violations.length === 0
  );
}

const scriptPath = fileURLToPath(import.meta.url);
const isDirectExecution =
  process.argv[1] &&
  fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(scriptPath);

if (isDirectExecution) {
  const result = await evaluateToolcraftProductBoundary({
    allowMissingCompiler: process.argv.includes("--allow-missing-compiler"),
  });
  if (!toolcraftProductBoundaryPassed(result)) {
    console.error("Toolcraft product boundary check failed.");
    printToolcraftProductBoundaryResult(result);
    process.exitCode = 1;
  } else {
    console.log(
      result.skippedReason ??
        `Toolcraft product boundary check passed (${result.productSourceCount} product production files).`,
    );
  }
}
