const writeCapableFsOperations = new Set([
  "appendFile",
  "appendFileSync",
  "chmod",
  "chmodSync",
  "chown",
  "chownSync",
  "copyFile",
  "copyFileSync",
  "cp",
  "cpSync",
  "createWriteStream",
  "fchmod",
  "fchmodSync",
  "fchown",
  "fchownSync",
  "ftruncate",
  "ftruncateSync",
  "futimes",
  "futimesSync",
  "lchmod",
  "lchmodSync",
  "lchown",
  "lchownSync",
  "link",
  "linkSync",
  "lutimes",
  "lutimesSync",
  "mkdir",
  "mkdirSync",
  "mkdtemp",
  "mkdtempSync",
  "open",
  "openSync",
  "rename",
  "renameSync",
  "rm",
  "rmSync",
  "rmdir",
  "rmdirSync",
  "symlink",
  "symlinkSync",
  "truncate",
  "truncateSync",
  "unlink",
  "unlinkSync",
  "utimes",
  "utimesSync",
  "write",
  "writeSync",
  "writeFile",
  "writeFileSync",
  "writev",
  "writevSync",
]);

function isNodeFsSpecifier(specifier) {
  return /^(?:node:)?fs(?:\/promises)?$/u.test(specifier);
}

export function getToolcraftNodeFsWriteOperation(target) {
  return isNodeFsSpecifier(target.specifier) &&
    writeCapableFsOperations.has(target.operation)
    ? target.operation
    : undefined;
}

function getExactCalleeExportName(target) {
  if (target.importedName === "*") {
    return target.memberPath &&
      !target.memberPath.includes(".")
      ? target.operation
      : undefined;
  }
  return target.memberPath === ""
    ? target.importedName
    : undefined;
}

function resolveLocalCall({
  graph,
  importerRepoPath,
  productionPaths,
  target,
}) {
  const exportName = getExactCalleeExportName(target);
  if (!exportName) return undefined;
  const imported = graph.moduleImports.find(
    (fact) =>
      !fact.typeOnly &&
      fact.importerRepoPath === importerRepoPath &&
      fact.specifier === target.specifier &&
      fact.resolution === "resolved",
  );
  return imported?.resolvedRepoPath &&
    productionPaths.has(imported.resolvedRepoPath)
    ? { exportName, repoPath: imported.resolvedRepoPath }
    : undefined;
}

function callableKey(repoPath, callableId) {
  return `${repoPath}\0callable:${callableId}`;
}

function exportKey(repoPath, exportName) {
  return `${repoPath}\0export:${exportName}`;
}

function addCapability(capabilities, key, operation) {
  let operations = capabilities.get(key);
  if (!operations) {
    operations = new Set();
    capabilities.set(key, operations);
  }
  const previousSize = operations.size;
  operations.add(operation);
  return operations.size !== previousSize;
}

export function createToolcraftCheckpointWriteCapabilityGraph({
  graph,
  productionPaths,
}) {
  const capabilities = new Map();
  const edges = [];
  for (const repoPath of productionPaths) {
    const facts =
      graph.sourceRecords.get(repoPath)?.semanticFacts;
    for (const binding of facts?.exportedCallableBindings ?? []) {
      edges.push({
        from: exportKey(repoPath, binding.exportedName),
        to: callableKey(repoPath, binding.callableId),
      });
    }
    for (const target of facts?.localCallTargets ?? []) {
      edges.push({
        from: callableKey(repoPath, target.callerCallableId),
        to: callableKey(repoPath, target.calleeCallableId),
      });
    }
    const targets = facts?.importedCallTargets ?? [];
    for (const target of targets) {
      const directOperation =
        getToolcraftNodeFsWriteOperation(target);
      if (directOperation && target.callerCallableId) {
        addCapability(
          capabilities,
          callableKey(repoPath, target.callerCallableId),
          directOperation,
        );
      }
      const callee = resolveLocalCall({
        graph,
        importerRepoPath: repoPath,
        productionPaths,
        target,
      });
      if (callee && target.callerCallableId) {
        edges.push({
          from: callableKey(repoPath, target.callerCallableId),
          to: exportKey(callee.repoPath, callee.exportName),
        });
      }
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      for (const operation of capabilities.get(edge.to) ?? []) {
        changed =
          addCapability(capabilities, edge.from, operation) ||
          changed;
      }
    }
  }
  return Object.freeze({
    getImportedCallWriteOperations(importerRepoPath, target) {
      const callee = resolveLocalCall({
        graph,
        importerRepoPath,
        productionPaths,
        target,
      });
      return Object.freeze(
        callee
          ? [
              ...(capabilities.get(
                exportKey(callee.repoPath, callee.exportName),
              ) ?? []),
            ].sort()
          : [],
      );
    },
  });
}
