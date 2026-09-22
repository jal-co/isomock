#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findMisplacedDevelopmentFiles } from "./toolcraft-development-files.mjs";

import { isToolcraftTypeScriptCompilerAvailable } from "./toolcraft-typescript-source-evidence.mjs";
import {
  createToolcraftScriptLineBudgetPolicy,
  getToolcraftScriptProductionEntryPaths,
} from "./toolcraft-delivery-architecture-policy.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");

const scriptLineBudgetPolicy =
  createToolcraftScriptLineBudgetPolicy("scripts");
const generatedCodeHealthPolicy = {
  globalLineBudget: {
    maxLines: 1000,
    reason: "Generated product source must not become a giant mixed-responsibility module.",
  },
  ignoredFilePatterns: [
    /^src\/toolcraft(?:\/|$)/u,
    /\/route-tree\.gen\.ts$/u,
  ],
  scopedLineBudgets: [
    {
      maxLines: 700,
      prefix: "src/app/",
      reason:
        "Generated app modules should split schema, renderer, exports, and product behavior before they become one policy dump.",
    },
    {
      maxLines: 400,
      prefix: "src/routes/",
      reason: "Generated routes should remain thin Toolcraft composition boundaries.",
    },
    {
      maxLines: 700,
      prefix: "src/",
      reason:
        "Generated product modules should split rendering, state, and behavior before they become mixed-responsibility files.",
    },
    {
      maxLines: 500,
      prefix: "e2e/",
      reason: "Generated browser tests should stay split by behavior and evidence role.",
    },
    ...scriptLineBudgetPolicy.scopedLineBudgets,
  ],
  sourceRoots: ["src", "e2e", "scripts"],
  testFilePatterns: scriptLineBudgetPolicy.testFilePatterns,
  testLineBudget: scriptLineBudgetPolicy.testLineBudget,
};

export async function evaluateGeneratedCodeHealth(rootDir = appRoot) {
  const [
    { evaluateCodeHealth },
    { createToolcraftLocalDependencyGraph },
    { evaluateToolcraftProductBoundary },
    dependencyResolution,
    { collectToolcraftSourceInventory },
    { collectToolcraftFrameworkOwnedLocalPaths },
  ] = await Promise.all([
    import("./toolcraft-code-health-core.mjs"),
    import("./toolcraft-local-dependency-graph.mjs"),
    import("./toolcraft-product-boundary.mjs"),
    import("./toolcraft-product-dependency-resolution.mjs"),
    import("./toolcraft-source-inventory.mjs"),
    import("./toolcraft-source-ownership.mjs"),
  ]);
  const [configuredAliases, frameworkOwnedLocalPaths] = await Promise.all([
    dependencyResolution.loadToolcraftLocalModuleAliases({
      rootDir,
      tsconfigPaths: ["tsconfig.json"],
    }),
    collectToolcraftFrameworkOwnedLocalPaths(rootDir),
  ]);
  const dependencyCycleAliases = [
    ...configuredAliases,
    ...dependencyResolution.createToolcraftDefaultSourceAliases(rootDir),
  ];
  const inventory = await collectToolcraftSourceInventory({
    frameworkPathPrefixes: ["src/toolcraft/"],
    includeResourceFiles: true,
    protectedFilePaths: frameworkOwnedLocalPaths,
    rootDir,
    sourceRoots: generatedCodeHealthPolicy.sourceRoots,
  });
  const localDependencyGraph = await createToolcraftLocalDependencyGraph({
    aliases: dependencyCycleAliases,
    entries: inventory.entries,
    fullEvidenceEntryPaths: inventory.entries
      .filter(({ owner }) => owner === "product")
      .map(({ repoPath }) => repoPath),
    rootDir,
    sourceRecordMode: "imports-only",
  });
  const codeHealth = await evaluateCodeHealth({
    ...generatedCodeHealthPolicy,
    dependencyCycleAliases,
    dependencyCycleIncludedFilePatterns: [/^src\//u],
    frameworkPathPrefixes: ["src/toolcraft/"],
    inventory,
    localDependencyGraph,
    productionEntryPaths: getToolcraftScriptProductionEntryPaths("scripts"),
    protectedFilePaths: frameworkOwnedLocalPaths,
    rootDir,
  });
  return {
    ...codeHealth,
    productBoundary: await evaluateToolcraftProductBoundary({
      aliases: dependencyCycleAliases,
      inventory,
      localDependencyGraph,
      protectedFilePaths: frameworkOwnedLocalPaths,
      rootDir,
    }),
  };
}

export async function runGeneratedCodeHealth({
  logger = console,
  rootDir = appRoot,
} = {}) {
  const misplacedFiles = await findMisplacedDevelopmentFiles(rootDir);
  if (misplacedFiles.length) {
    for (const finding of misplacedFiles) logger.error(`${finding.path}: ${finding.reason}`);
    return false;
  }
  if (!isToolcraftTypeScriptCompilerAvailable()) {
    logger.log(
      "Toolcraft code health check passed (dependency-backed graph and AST checks are deferred until dependencies are installed).",
    );
    return true;
  }

  const result = await evaluateGeneratedCodeHealth(rootDir);
  const { codeHealthPassed, printCodeHealthResult } = await import(
    "./toolcraft-code-health-core.mjs"
  );
  printCodeHealthResult(result, logger);
  if (!codeHealthPassed(result)) {
    logger.error(
      "\nToolcraft code health check failed. Split the file, move logic behind a focused product boundary, or make the typed contract explicit.",
    );
    return false;
  }

  logger.log(`Toolcraft code health check passed (${result.sourceFileCount} files).`);
  return true;
}

const isDirectExecution =
  process.argv[1] &&
  fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(scriptPath);

if (isDirectExecution) {
  const passed = await runGeneratedCodeHealth();
  if (!passed) {
    process.exitCode = 1;
  }
}
