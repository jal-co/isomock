import path from "node:path";

const MAX_COMPOSITION_DEPTH = 12;

function resolveComposedRepoPath(repoPath, specifier, sourceRecords) {
  if (!specifier) return repoPath;
  if (!specifier.startsWith(".")) return undefined;
  const resolved = path.posix.normalize(path.posix.join(
    path.posix.dirname(repoPath),
    specifier,
  ));
  return !resolved.startsWith("../") && sourceRecords.has(resolved)
    ? resolved : undefined;
}

export function createToolcraftCssModuleFactResolver({
  moduleImports,
  sourceRecords,
}) {
  const resolvedImports = new Map();
  for (const evidence of moduleImports) {
    if (evidence.resolution !== "resolved" ||
      !evidence.resolvedRepoPath?.endsWith(".module.css")) continue;
    resolvedImports.set(
      `${evidence.importerRepoPath}\0${evidence.specifier}`,
      evidence.resolvedRepoPath,
    );
  }
  function resolveClass(repoPath, className, tag, visited, depth) {
    if (depth >= MAX_COMPOSITION_DEPTH) return undefined;
    const key = `${repoPath}\0${className}\0${tag}`;
    if (visited.has(key)) {
      return { applicable: true, domains: [], repoPath };
    }
    const classFacts = sourceRecords.get(repoPath)?.cssEvidence?.classFacts;
    if (!classFacts) return undefined;
    const declared = classFacts.filter((fact) => fact.className === className);
    if (declared.length === 0) return undefined;
    const matching = declared.filter((fact) => fact.tag === tag);
    const nextVisited = new Set(visited).add(key);
    const domains = new Set(matching.flatMap((fact) => fact.domains));
    const compositions = new Map(matching.flatMap((fact) =>
      (fact.compositions ?? []).map((composition) => [
        `${composition.className}\0${composition.specifier ?? ""}`,
        composition,
      ])
    ));
    for (const composition of compositions.values()) {
      const composedRepoPath = resolveComposedRepoPath(
        repoPath,
        composition.specifier,
        sourceRecords,
      );
      if (!composedRepoPath) return undefined;
      const composed = resolveClass(
        composedRepoPath,
        composition.className,
        tag,
        nextVisited,
        depth + 1,
      );
      if (!composed) return undefined;
      for (const domain of composed.domains) domains.add(domain);
    }
    return Object.freeze({
      applicable: matching.length > 0,
      domains: Object.freeze([...domains]),
      repoPath,
    });
  }
  return Object.freeze(function resolveCssModuleClass({
    className,
    importerRepoPath,
    specifier,
    tag,
  }) {
    const repoPath = resolvedImports.get(`${importerRepoPath}\0${specifier}`);
    if (!repoPath) return undefined;
    return resolveClass(repoPath, className, tag, new Set(), 0);
  });
}
