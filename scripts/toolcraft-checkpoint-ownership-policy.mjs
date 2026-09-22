import {
  createToolcraftCheckpointWriteCapabilityGraph,
  getToolcraftNodeFsWriteOperation,
} from "./toolcraft-checkpoint-write-capability.mjs";

const importedWriterRules = Object.freeze([
  Object.freeze({
    dependency: "toolcraft-checkpoint-bundle.mjs",
    operation: "updateToolcraftCheckpointBundle",
    owner: "run-browser-performance.mjs",
  }),
  Object.freeze({
    dependency: "toolcraft-checkpoint-bundle.mjs",
    operation: "writeToolcraftCheckpointBundle",
    owner: "toolcraft-checkpoint-transaction.mjs",
  }),
  Object.freeze({
    dependency: "toolcraft-checkpoint-durable-fs.mjs",
    operation: "writeDurableCheckpointAtomic",
    owner: "toolcraft-checkpoint-bundle.mjs",
  }),
]);
const exportedWriterRules = Object.freeze([
  Object.freeze({
    operation: "commitToolcraftDeliveryCheckpoint",
    owner: "toolcraft-checkpoint-transaction.mjs",
  }),
  Object.freeze({
    operation: "updateToolcraftCheckpointBundle",
    owner: "toolcraft-checkpoint-bundle.mjs",
  }),
  Object.freeze({
    operation: "writeDurableCheckpointAtomic",
    owner: "toolcraft-checkpoint-durable-fs.mjs",
  }),
  Object.freeze({
    operation: "writeToolcraftCheckpointBundle",
    owner: "toolcraft-checkpoint-bundle.mjs",
  }),
]);
const canonicalCheckpointWriteLayerNames = Object.freeze([
  "toolcraft-checkpoint-bundle.mjs",
  "toolcraft-checkpoint-durable-fs.mjs",
  "toolcraft-checkpoint-transaction.mjs",
]);

function importsProtectedOperation(facts, specifier, operation) {
  return (
    (facts?.importedRuntimeBindings ?? []).some(
      (binding) =>
        binding.specifier === specifier &&
        binding.importedName === operation,
    ) ||
    (facts?.importedCallTargets ?? []).some(
      (target) =>
        target.specifier === specifier &&
        target.operation === operation,
    )
  );
}

function hasCheckpointPathOwnership({
  graph,
  importerRepoPath,
  scriptsRoot,
}) {
  if (
    graph.moduleImports.some(
      (imported) =>
        imported.importerRepoPath === importerRepoPath &&
        imported.resolvedRepoPath ===
          `${scriptsRoot}/toolcraft-checkpoint-paths.mjs`,
    )
  ) {
    return true;
  }
  const strings =
    graph.sourceRecords.get(importerRepoPath)
      ?.semanticFacts?.staticStrings ?? [];
  return (
    strings.some((value) =>
      /(?:^|[/\\])\.toolcraft[/\\]verification(?:[/\\]|$)/u.test(value),
    ) ||
    (strings.includes(".toolcraft") &&
      strings.includes("verification") &&
      strings.some((value) =>
        /^(?:checkpoint|delivery|performance(?:-baseline)?)\.json$/u.test(
          value,
        ),
      ))
  );
}

export function collectToolcraftCheckpointOwnershipViolations({
  graph,
  productionPaths,
  scriptsRoot,
}) {
  const violations = [];
  const violationKeys = new Set();
  const canonicalCheckpointWriteLayers = new Set(
    canonicalCheckpointWriteLayerNames.map(
      (name) => `${scriptsRoot}/${name}`,
    ),
  );
  const capabilityGraph =
    createToolcraftCheckpointWriteCapabilityGraph({
      graph,
      productionPaths,
    });
  const protectedDynamicDependencies = new Set(
    canonicalCheckpointWriteLayerNames.map(
      (name) => `${scriptsRoot}/${name}`,
    ),
  );
  function record(importerRepoPath, operation, ownerRepoPath) {
    const key = `${importerRepoPath}\0${operation}`;
    if (violationKeys.has(key)) return;
    violationKeys.add(key);
    violations.push(
      Object.freeze({ importerRepoPath, operation, ownerRepoPath }),
    );
  }
  for (const importerRepoPath of productionPaths) {
    const exportedRuntimeBindings =
      graph.sourceRecords.get(importerRepoPath)
        ?.semanticFacts?.exportedRuntimeBindings ?? [];
    for (const rule of exportedWriterRules) {
      const ownerRepoPath = `${scriptsRoot}/${rule.owner}`;
      if (
        exportedRuntimeBindings.includes(rule.operation) &&
        importerRepoPath !== ownerRepoPath
      ) {
        record(importerRepoPath, rule.operation, ownerRepoPath);
      }
    }
  }
  for (const imported of graph.moduleImports) {
    if (
      imported.typeOnly ||
      !productionPaths.has(imported.importerRepoPath)
    ) {
      continue;
    }
    const facts =
      graph.sourceRecords.get(imported.importerRepoPath)?.semanticFacts;
    if (
      imported.category === "dynamic-import" &&
      protectedDynamicDependencies.has(imported.resolvedRepoPath)
    ) {
      const dependencyName = imported.resolvedRepoPath.slice(
        imported.resolvedRepoPath.lastIndexOf("/") + 1,
      );
      record(
        imported.importerRepoPath,
        `dynamic-import:${dependencyName}`,
        imported.resolvedRepoPath,
      );
    }
    for (const rule of importedWriterRules) {
      if (
        imported.resolvedRepoPath ===
          `${scriptsRoot}/${rule.dependency}` &&
        importsProtectedOperation(
          facts,
          imported.specifier,
          rule.operation,
        ) &&
        imported.importerRepoPath !== `${scriptsRoot}/${rule.owner}`
      ) {
        record(
          imported.importerRepoPath,
          rule.operation,
          `${scriptsRoot}/${rule.owner}`,
        );
      }
    }
  }
  for (const importerRepoPath of productionPaths) {
    if (
      canonicalCheckpointWriteLayers.has(importerRepoPath) ||
      !hasCheckpointPathOwnership({
        graph,
        importerRepoPath,
        scriptsRoot,
      })
    ) {
      continue;
    }
    const callTargets =
      graph.sourceRecords.get(importerRepoPath)
        ?.semanticFacts?.importedCallTargets ?? [];
    for (const target of callTargets) {
      const directOperation =
        getToolcraftNodeFsWriteOperation(target);
      if (directOperation) {
        record(
          importerRepoPath,
          directOperation,
          `${scriptsRoot}/toolcraft-checkpoint-durable-fs.mjs`,
        );
      }
      for (const operation of
        capabilityGraph.getImportedCallWriteOperations(
          importerRepoPath,
          target,
        )) {
        record(
          importerRepoPath,
          operation,
          `${scriptsRoot}/toolcraft-checkpoint-durable-fs.mjs`,
        );
      }
    }
  }
  return Object.freeze(violations);
}
