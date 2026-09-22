import path from "node:path";

import {
  canonicalDeliveryModules,
  deliveryBehaviorModules,
  deliveryRuntimeEntryRoots,
  obsoleteDeliveryBasenames,
} from "./toolcraft-delivery-architecture-inventory.mjs";
import {
  findToolcraftCycles,
  getToolcraftReachablePaths,
} from "./toolcraft-graph-reachability.mjs";
import { collectToolcraftCheckpointOwnershipViolations } from "./toolcraft-checkpoint-ownership-policy.mjs";
import { createToolcraftLocalDependencyGraph } from "./toolcraft-local-dependency-graph.mjs";
import { collectToolcraftSourceInventory } from "./toolcraft-source-inventory.mjs";
import { isToolcraftPackageRootOrSubpath } from "./toolcraft-typescript-source-evidence.mjs";

export const toolcraftScriptSourceExtensions =
  new Set([".cjs", ".cts", ".js", ".mjs", ".mts"]);
const sharedFoundationStem =
  /^toolcraft-(?:checkpoint-ownership-policy|code-health-(?:core|line-budget)|delivery-architecture-.+|graph-reachability|local-dependency-graph|css-(?:source-evidence|url-scanner)|typescript-(?:analysis|callables|module-shape|source-evidence)|product-(?:boundary-ast(?:-utils)?|dependency-(?:graph|resolution)|evidence-boundary-ast|style-boundary))$/u;
const orchestrationStem =
  /^(?:playwright-test-title-selection|run-(?:browser-performance|delivery-verification|performance-iteration)|toolcraft-(?:checkpoint-|delivery-|performance-|targeted-).+|toolcraft-(?:integrity-manifest|linked-performance-authority|plan-execution-authority|proof-process|receipt-file-io|source-(?:inventory|ownership)|verification-(?:impact(?:-resolution)?|inventory|lock|receipt(?:-core)?)|worklog-verification-command))$/u;
const defaultDirectionRules = Object.freeze([
  {
    from: "run-delivery-verification.mjs",
    required: ["toolcraft-delivery-lifecycle.mjs"],
  },
  {
    from: "toolcraft-delivery-lifecycle.mjs",
    required: [
      "toolcraft-checkpoint-transaction.mjs",
      "toolcraft-delivery-anchor.mjs",
      "toolcraft-delivery-executor.mjs",
      "toolcraft-delivery-plan.mjs",
      "toolcraft-delivery-receipt.mjs",
    ],
  },
  {
    forbidden: [
      "toolcraft-delivery-anchor.mjs",
      "toolcraft-delivery-evidence.mjs",
      "toolcraft-delivery-executor.mjs",
      "toolcraft-delivery-lifecycle.mjs",
      "toolcraft-delivery-receipt.mjs",
      "toolcraft-plan-execution-authority.mjs",
      "toolcraft-proof-process.mjs",
    ],
    from: "toolcraft-delivery-plan.mjs",
  },
  {
    forbidden: [
      "run-delivery-verification.mjs",
      "toolcraft-delivery-anchor.mjs",
      "toolcraft-delivery-lifecycle.mjs",
      "toolcraft-delivery-receipt.mjs",
    ],
    from: "toolcraft-delivery-executor.mjs",
  },
  ...canonicalDeliveryModules.slice(2).map((from) =>
    Object.freeze({
      forbidden: [
        "run-delivery-verification.mjs",
        "toolcraft-delivery-lifecycle.mjs",
      ],
      from,
    }),
  ),
]);

function prefixed(scriptsRoot, values) {
  return values.map((value) =>
    value === scriptsRoot || value.startsWith(`${scriptsRoot}/`)
      ? value
      : path.posix.join(scriptsRoot, value),
  );
}

function isFacade(sourceRecord) {
  return /^(?:(?:forwarding|identity)-facade|reexport-only)$/u.test(
    sourceRecord.semanticFacts?.moduleShape ?? "",
  );
}

export function classifyToolcraftDeliveryArchitectureRole(repoPath) {
  const stem = path.posix
    .basename(repoPath)
    .replace(/\.(?:cjs|cts|js|mjs|mts)$/u, "");
  if (sharedFoundationStem.test(stem)) {
    return "shared-foundation";
  }
  return orchestrationStem.test(stem) ? "orchestration" : "support";
}

export function getToolcraftScriptProductionEntryPaths(scriptsRoot) {
  return Object.freeze(prefixed(scriptsRoot, deliveryRuntimeEntryRoots));
}

export function createToolcraftScriptLineBudgetPolicy(scriptsRoot) {
  const escapedRoot = scriptsRoot.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return Object.freeze({
    scopedLineBudgets: Object.freeze([
      Object.freeze({
        maxLines: 300,
        pathPattern: new RegExp(
          `^${escapedRoot}/(?:.*/)?toolcraft-performance-`,
          "u",
        ),
        priority: 2,
        reason:
          "Performance scripts should remain independent validation units.",
        scope: `${scriptsRoot}/toolcraft-performance-`,
      }),
      Object.freeze({
        maxLines: 350,
        prefix: `${scriptsRoot}/`,
        priority: 1,
        reason:
          "Generated operational scripts should stay focused and independently testable.",
      }),
    ]),
    testFilePatterns: Object.freeze([
      /\.(?:test|spec)\.[cm]?[jt]sx?$/u,
      new RegExp(
        `^${escapedRoot}/(?:.*/)?[^/]*(?:test-helpers|test-utils|fixtures)\\.[cm]?[jt]sx?$`,
        "u",
      ),
    ]),
    testLineBudget: Object.freeze({
      maxLines: 500,
      reason:
        "Generated test and support files should stay focused instead of becoming behavior dumps.",
    }),
  });
}

export async function createToolcraftDeliveryArchitectureReport({
  allowedProcessImporters,
  behaviorModules,
  canonicalModules,
  directionRules = defaultDirectionRules,
  obsoleteBasenames,
  productionEntryRoots,
  rootDir,
  scriptsRoot = "scripts",
} = {}) {
  const inventory = await collectToolcraftSourceInventory({
    frameworkPathPrefixes: [],
    rootDir,
    sourceExtensions: toolcraftScriptSourceExtensions,
    sourceRoots: [scriptsRoot],
  });
  const graph = await createToolcraftLocalDependencyGraph({
    entries: inventory.entries,
    rootDir,
    sourceRecordMode: "module-shape",
  });
  const productionRoots = prefixed(
    scriptsRoot,
    productionEntryRoots ?? deliveryRuntimeEntryRoots,
  );
  const production = new Set(
    getToolcraftReachablePaths(graph, productionRoots),
  );
  const productionPaths = [...production].sort();
  const productionModuleRoles = productionPaths.map((repoPath) =>
    Object.freeze({
      repoPath,
      role: classifyToolcraftDeliveryArchitectureRole(repoPath),
    }),
  );
  const currentOrchestrationPaths = productionModuleRoles
    .filter(({ role }) => role === "orchestration")
    .map(({ repoPath }) => repoPath);
  const processImporters = new Set(
    prefixed(
      scriptsRoot,
      allowedProcessImporters ?? [
        "run-kernel-benchmarks.mjs",
        "run-vite-on-free-port.mjs",
        "toolcraft-proof-process.mjs",
      ],
    ),
  );
  const behavior = prefixed(
    scriptsRoot,
    behaviorModules ?? deliveryBehaviorModules,
  );
  const obsolete = new Set(obsoleteBasenames ?? obsoleteDeliveryBasenames);
  const canonical = prefixed(
    scriptsRoot,
    canonicalModules ?? canonicalDeliveryModules,
  );
  const directionViolations = [];
  for (const rule of directionRules) {
    const from = path.posix.join(scriptsRoot, rule.from);
    const downstream = new Set(getToolcraftReachablePaths(graph, [from]));
    for (const forbidden of prefixed(scriptsRoot, rule.forbidden ?? [])) {
      if (downstream.has(forbidden)) {
        directionViolations.push({ forbidden, from });
      }
    }
    for (const required of prefixed(scriptsRoot, rule.required ?? [])) {
      if (!downstream.has(required)) {
        directionViolations.push({ from, required });
      }
    }
  }
  const facadeViolations = behavior.filter((repoPath) => {
    const record = graph.sourceRecords.get(repoPath);
    return record && isFacade(record);
  });
  return Object.freeze({
    checkpointOwnershipViolations: collectToolcraftCheckpointOwnershipViolations(
      { graph, productionPaths: production, scriptsRoot },
    ),
    currentOrchestrationPaths,
    directConsumerViolations: behavior.filter(
      (repoPath) =>
        !(graph.reverse.get(repoPath) ?? []).some((importer) =>
          production.has(importer),
        ),
    ),
    directionViolations,
    facadeViolations,
    missingCanonicalModules: canonical.filter((repoPath) => !graph.forward.has(repoPath)),
    missingEntryRoots: productionRoots.filter((repoPath) => !graph.forward.has(repoPath)),
    obsoleteModuleViolations: inventory.entries
      .filter(({ repoPath }) => obsolete.has(path.posix.basename(repoPath)))
      .map(({ repoPath }) => repoPath),
    processImportViolations: [
      ...new Set(
        graph.moduleImports
          .filter(
            ({ importerRepoPath, specifier }) =>
              isToolcraftPackageRootOrSubpath(specifier, "cross-spawn") &&
              production.has(importerRepoPath) &&
              !processImporters.has(importerRepoPath),
          )
          .map(({ importerRepoPath }) => importerRepoPath),
      ),
    ].sort(),
    productionCycles: findToolcraftCycles(graph, production),
    productionModuleCount: productionPaths.length,
    productionModuleRoles,
    productionPaths,
  });
}
