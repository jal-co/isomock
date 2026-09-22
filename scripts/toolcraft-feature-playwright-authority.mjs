import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { createRequire, isBuiltin } from "node:module";
import { getToolcraftReachablePaths } from "./toolcraft-graph-reachability.mjs";
import { createToolcraftLocalDependencyGraph } from "./toolcraft-local-dependency-graph.mjs";
import { createToolcraftDefaultSourceAliases, loadToolcraftLocalModuleAliases } from "./toolcraft-product-dependency-resolution.mjs";
import { collectToolcraftSourceInventory } from "./toolcraft-source-inventory.mjs";
import { collectToolcraftFrameworkOwnedLocalPaths } from "./toolcraft-source-ownership.mjs";
import { collectToolcraftPlaywrightBindingProvenanceViolations } from "./toolcraft-playwright-test-type-provenance.mjs";
import { createToolcraftDependencySourceRecord, getToolcraftDependencyImports } from "./toolcraft-dependency-source-record.mjs";
import { createToolcraftFeaturePlaywrightAuthoritySeal, createToolcraftFeaturePreflightSeal, createToolcraftFeaturePreflightSnapshot, revalidateToolcraftFeaturePlaywrightAuthoritySeal } from "./toolcraft-feature-playwright-authority-seal.mjs";
import { createToolcraftNodeEsmResolver } from "./toolcraft-node-esm-resolution.mjs";
import { collectToolcraftPackageContentClosure } from "./toolcraft-package-content-closure.mjs";
import { collectToolcraftFeatureLoaderClosure } from "./toolcraft-feature-loader-closure.mjs";
import { assertToolcraftSignedConfigSources, assertToolcraftSignedLoaderSources, inspectToolcraftExecutableConfigCandidates, readToolcraftFeatureManifestSource, requireToolcraftFeaturePreflightManifest, toolcraftFeatureManifestRepoPath } from "./toolcraft-feature-preflight-manifest.mjs";
import { assertToolcraftPlaywrightConfigStaticUse } from "./toolcraft-playwright-config-mutation.mjs";
import { createToolcraftStaticStringSetResolver } from "./toolcraft-static-string.mjs";
import { createToolcraftTypeScriptChecker } from "./toolcraft-typescript-analysis.mjs";
import { parseToolcraftTypeScriptSource } from "./toolcraft-typescript-source-evidence.mjs";
import { getVerifiedProductTestFacade } from "./toolcraft-product-test-facade.mjs";
export { hasVerifiedProductTestFacade, revalidateToolcraftProductTestFacade } from "./toolcraft-product-test-facade.mjs";
export { revalidateToolcraftFeaturePlaywrightAuthoritySeal }; const compareCodeUnits = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const isWithinPath = (root, candidate) => { const relative = path.relative(root, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`)); };
const authorityConfigPaths = ["package.json", "playwright.config.cjs", "playwright.config.cts", "playwright.config.js", "playwright.config.mjs", "playwright.config.mts", "playwright.config.ts", "vite.config.cjs", "vite.config.cts", "vite.config.js", "vite.config.mjs", "vite.config.mts", "vite.config.ts", "tsconfig.app.json", "tsconfig.json"];
const pathTouchesSymbolicLink = (repoPath, symbolicLinkPath) => repoPath === symbolicLinkPath || repoPath.startsWith(`${symbolicLinkPath}/`);
async function findAuthorityBoundaryRoot(projectDir) {
  const realRoot = await fs.realpath(projectDir);
  for (let cursor = realRoot; path.dirname(cursor) !== cursor; cursor = path.dirname(cursor)) try {
    if ((await fs.lstat(path.join(cursor, "pnpm-workspace.yaml"))).isFile()) return await fs.realpath(cursor);
  } catch (error) { if (error?.code !== "ENOENT") throw error; }
  return realRoot;
}
async function collectAuthorityConfigClosure(projectDir) {
  const sources = new Map(), externalRequests = [], pending = [...authorityConfigPaths], configJsonPaths = new Set(["tsconfig.json", "tsconfig.app.json"]);
  const strictConfigPaths = new Set(authorityConfigPaths.filter((repoPath) => /^playwright\.config\./u.test(repoPath)));
  const realRoot = await fs.realpath(projectDir), boundaryRoot = await findAuthorityBoundaryRoot(projectDir);
  const rootConfig = ts.readConfigFile(path.join(projectDir, "tsconfig.json"), ts.sys.readFile);
  const options = rootConfig.error ? { resolveJsonModule: true } :
    { ...ts.parseJsonConfigFileContent(rootConfig.config, ts.sys, projectDir).options, resolveJsonModule: true };
  const isConfiguredLocal = (specifier) => specifier.startsWith(".") || specifier.startsWith("/") ||
    Object.keys(options.paths ?? {}).some((pattern) => pattern.includes("*")
      ? specifier.startsWith(pattern.slice(0, pattern.indexOf("*"))) && specifier.endsWith(pattern.slice(pattern.indexOf("*") + 1)) : specifier === pattern);
  const resolveConfig = async (importer, specifier, jsonConfig) => {
    const importerPath = path.join(projectDir, importer);
    let resolved = ts.resolveModuleName(specifier, importerPath, options, ts.sys).resolvedModule?.resolvedFileName;
    if (!resolved && jsonConfig && specifier.startsWith(".")) {
      const base = path.resolve(path.dirname(importerPath), specifier);
      for (const candidate of [base, `${base}.json`, path.join(base, "tsconfig.json")]) try {
        if ((await fs.lstat(candidate)).isFile()) { resolved = candidate; break; }
      } catch (error) { if (error?.code !== "ENOENT") throw error; }
    }
    if (!resolved) return undefined;
    const real = await fs.realpath(resolved), boundaryRelative = path.relative(boundaryRoot, real), relative = path.relative(realRoot, real);
    if (boundaryRelative === ".." || boundaryRelative.startsWith(`..${path.sep}`) || path.isAbsolute(boundaryRelative)) throw new Error(`${importer} imports config outside the project boundary.`);
    return relative.split(path.sep).join("/");
  };
  while (pending.length > 0) {
    const repoPath = pending.shift();
    if (sources.has(repoPath)) continue;
    const filePath = path.join(realRoot, repoPath);
    let source;
    try {
      const stat = await fs.lstat(filePath), real = await fs.realpath(filePath);
      if (!stat.isFile() || stat.isSymbolicLink() || (real !== boundaryRoot && !real.startsWith(`${boundaryRoot}${path.sep}`))) throw new Error(`${repoPath} is not a contained regular file.`);
      source = await fs.readFile(filePath);
    } catch (error) { if (error?.code === "ENOENT") continue; throw error; }
    sources.set(repoPath, source);
    const specifiers = [];
    const jsonConfig = configJsonPaths.has(repoPath);
    if (jsonConfig) {
      const parsed = ts.parseConfigFileTextToJson(repoPath, source.toString("utf8"));
      if (parsed.error) throw new Error(`${repoPath} is not valid JSONC.`);
      const config = parsed.config;
      for (const extended of Array.isArray(config.extends) ? config.extends : [config.extends]) if (typeof extended === "string") specifiers.push(extended);
      for (const reference of config.references ?? []) if (typeof reference?.path === "string") specifiers.push(reference.path.endsWith(".json") ? reference.path : `${reference.path}/tsconfig.json`);
    } else if (!repoPath.endsWith(".json")) {
      const entry = { absolutePath: filePath, owner: "framework", repoPath };
      const record = await createToolcraftDependencySourceRecord({ entry, importsOnly: true, rootDir: realRoot });
      for (const imported of getToolcraftDependencyImports(entry, record)) if (!imported.typeOnly) {
        if (isConfiguredLocal(imported.specifier)) specifiers.push(imported.specifier);
        else if (/^@playwright\/test(?:\/|$)/u.test(imported.specifier)) continue;
        else externalRequests.push({ category: imported.category, deep: strictConfigPaths.has(repoPath), importer: filePath, specifier: imported.specifier });
      }
      if (!/^playwright\.config\.[cm]?[jt]s$/u.test(repoPath)) {
        for (const specifier of specifiers) {
          if (!isConfiguredLocal(specifier)) continue;
          const resolved = await resolveConfig(repoPath, specifier, false);
          if (!resolved) throw new Error(`${repoPath} has an unresolved executable config dependency: ${specifier}`);
          if (strictConfigPaths.has(repoPath)) strictConfigPaths.add(resolved);
          pending.push(resolved);
        }
        continue;
      }
      const parsedEvidence = parseToolcraftTypeScriptSource({ absolutePath: filePath, rawSource: source.toString("utf8") });
      if (!parsedEvidence) throw new Error(`${repoPath} requires the TypeScript compiler for Playwright config authority.`);
      const parsed = parsedEvidence.sourceFile;
      const checker = createToolcraftTypeScriptChecker(parsed, ts), defineConfigSymbols = new Set(), defineConfigNamespaces = new Set();
      for (const statement of parsed.statements) if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === "@playwright/test") {
        const bindings = statement.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) { for (const element of bindings.elements) if ((element.propertyName ?? element.name).text === "defineConfig") defineConfigSymbols.add(checker.getSymbolAtLocation(element.name)); }
        else if (bindings && ts.isNamespaceImport(bindings)) defineConfigNamespaces.add(checker.getSymbolAtLocation(bindings.name));
      }
      const isDefineConfigCall = (node) => ts.isCallExpression(node) && ((ts.isIdentifier(node.expression) && defineConfigSymbols.has(checker.getSymbolAtLocation(node.expression))) || (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "defineConfig" && ts.isIdentifier(node.expression.expression) && defineConfigNamespaces.has(checker.getSymbolAtLocation(node.expression.expression))));
      const collectStrings = createToolcraftStaticStringSetResolver(parsed, checker);
      const visitExecutableConfig = (node) => {
        if (ts.isSpreadAssignment(node)) {
          const spreadObjects = unwrapConfigs(node.expression);
          if (!spreadObjects || spreadObjects.length === 0) throw new Error(`${repoPath} has an unresolved executable Playwright config spread.`);
          spreadObjects.flatMap((object) => [...object.properties]).forEach(visitExecutableConfig);
          return;
        }
        const property = ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) ? node : undefined;
        let fieldName;
        if (property && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name))) fieldName = property.name.text;
        else if (property && ts.isComputedPropertyName(property.name)) {
          const names = collectStrings(property.name.expression);
          if (!names || names.length !== 1) throw new Error(`${repoPath} has an unresolved computed Playwright config field.`);
          [fieldName] = names;
        }
        if (property && ["reporter", "globalSetup", "globalTeardown"].includes(fieldName)) {
          const initializer = ts.isShorthandPropertyAssignment(property) ? property.name : property.initializer;
          const executableSpecifiers = initializer ? (fieldName === "reporter" ? collectReporterModules(initializer) : collectStrings(initializer)) : [];
          if (!executableSpecifiers || executableSpecifiers.length === 0) throw new Error(`${repoPath} has an unresolved executable Playwright config field: ${fieldName}`);
          for (const specifier of executableSpecifiers) {
            if (["blob", "dot", "github", "html", "json", "junit", "line", "list", "null"].includes(specifier)) continue;
            if (isConfiguredLocal(specifier)) specifiers.push(specifier);
            else externalRequests.push({ category: "dynamic-import", deep: true, importer: filePath, owner: "proof-extension", specifier });
          }
        }
        if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) throw new Error(`${repoPath} has an unresolved executable Playwright config accessor.`);
      };
      const declarations = new Map();
      const indexDeclarations = (node) => { if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) declarations.set(checker.getSymbolAtLocation(node.name), node.initializer); ts.forEachChild(node, indexDeclarations); };
      indexDeclarations(parsed);
      const getValueSymbol = (node) => ts.isShorthandPropertyAssignment(node.parent) ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
      const collectReporterModules = (input, seen = new Set()) => {
        let node = input;
        while (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node)) node = node.expression;
        if (ts.isIdentifier(node)) { const symbol = getValueSymbol(node); if (declarations.has(symbol) && !seen.has(symbol)) return collectReporterModules(declarations.get(symbol), new Set([...seen, symbol])); }
        if (ts.isConditionalExpression(node)) { const left = collectReporterModules(node.whenTrue, seen), right = collectReporterModules(node.whenFalse, seen); return !left || !right ? undefined : [...left, ...right]; }
        if (!ts.isArrayLiteralExpression(node)) return undefined;
        const first = node.elements[0];
        if (first && !ts.isArrayLiteralExpression(first) && !ts.isSpreadElement(first)) { const module = collectStrings(first); return module?.length === 1 ? module : undefined; }
        const parts = node.elements.map((element) => collectReporterModules(ts.isSpreadElement(element) ? element.expression : element, seen));
        return parts.some((part) => !part) ? undefined : parts.flat();
      };
      const unwrapConfigs = (input, seen = new Set()) => {
        let node = input;
        while (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node)) node = node.expression;
        if (ts.isCallExpression(node) && isDefineConfigCall(node) && node.arguments.length > 0) { const parts = node.arguments.map((argument) => unwrapConfigs(argument, seen)); return parts.some((part) => !part) ? undefined : parts.flat(); }
        if (ts.isConditionalExpression(node)) { const left = unwrapConfigs(node.whenTrue, seen), right = unwrapConfigs(node.whenFalse, seen); return !left || !right ? undefined : [...left, ...right]; }
        if (ts.isIdentifier(node)) { const symbol = checker.getSymbolAtLocation(node); if (declarations.has(symbol) && !seen.has(symbol)) return unwrapConfigs(declarations.get(symbol), new Set([...seen, symbol])); }
        return ts.isObjectLiteralExpression(node) ? [node] : undefined;
      };
      const exported = parsed.statements.find(ts.isExportAssignment), configObjects = exported ? unwrapConfigs(exported.expression) : [];
      if (!configObjects || configObjects.length === 0) throw new Error(`${repoPath} has an unresolved executable Playwright config object.`);
      assertToolcraftPlaywrightConfigStaticUse({ checker, exportedExpression: exported.expression, isDefineConfigCall, repoPath, sourceFile: parsed });
      configObjects.flatMap((object) => [...object.properties]).forEach(visitExecutableConfig);
    }
    for (const specifier of specifiers) {
      if (!jsonConfig && !isConfiguredLocal(specifier)) continue;
      const resolved = await resolveConfig(repoPath, specifier, jsonConfig);
      if (!resolved) throw new Error(`${repoPath} has an unresolved executable config dependency: ${specifier}`);
      if (strictConfigPaths.has(repoPath)) strictConfigPaths.add(resolved);
      if (jsonConfig) configJsonPaths.add(resolved);
      pending.push(resolved);
    }
  }
  return { externalRequests, sources };
}
async function inspectReachableExternalModules({ additionalRequests = [], entryByPath, graph, productFilePaths, projectDir, reachablePaths }) {
  const reachable = new Set(reachablePaths), directories = new Map(), sources = new Map(), violations = [], pending = [], resolutions = [];
  const realRoot = await fs.realpath(projectDir);
  const inspectedRoot = await findAuthorityBoundaryRoot(projectDir);
  const esmResolver = createToolcraftNodeEsmResolver();
  let resolutionUniverseSealed = false;
  try {
  for (const imported of graph.moduleImports) if (reachable.has(imported.importerRepoPath) && !imported.typeOnly &&
    imported.resolution === "external" && imported.specifier && !isBuiltin(imported.specifier) &&
    !/^@playwright\/test(?:\/|$)/u.test(imported.specifier)) pending.push({ category: imported.category, deep: true, importer: path.join(projectDir, imported.importerRepoPath), owner: "product", specifier: imported.specifier });
  pending.push(...additionalRequests);
  const queued = new Set();
  while (pending.length > 0) {
    if (sources.size > 150_000) throw new Error("Selected browser external dependency closure exceeded its bounded inspection budget.");
    const batch = pending.splice(0);
    const esmBatch = batch.filter(({ category, specifier }) => !isBuiltin(specifier) && !/require|import-equals/iu.test(category ?? ""));
    const esmValues = await esmResolver.resolveMany(esmBatch.map(({ importer, specifier }) => ({ importer, specifier })));
    const esmByRequest = new Map(esmBatch.map((request, index) => [`${request.importer}\0${request.specifier}`, esmValues[index]]));
    for (const { category, deep = true, importer, specifier } of batch) {
    if (isBuiltin(specifier)) continue;
    const useRequire = /require|import-equals/iu.test(category ?? "");
    const resolveRuntime = async () => {
      if (!useRequire) {
        const packageEntry = esmByRequest.get(`${importer}\0${specifier}`);
        if (packageEntry && ts.sys.fileExists(packageEntry)) return packageEntry;
        const esm = ts.resolveModuleName(specifier, importer, { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext }, ts.sys).resolvedModule?.resolvedFileName;
        if (esm && !/\.d\.[cm]?ts$/u.test(esm)) return esm;
      }
      try { return createRequire(importer).resolve(specifier); } catch {}
      return ts.resolveModuleName(specifier, importer, { moduleResolution: ts.ModuleResolutionKind.NodeNext }, ts.sys).resolvedModule?.resolvedFileName;
    };
    const resolved = await resolveRuntime();
    if (!resolved) { violations.push(`${path.relative(projectDir, importer)}: unresolved external runtime dependency ${specifier}.`); continue; }
    const absolutePath = path.resolve(resolved);
    try {
      const stat = await fs.lstat(absolutePath), real = await fs.realpath(absolutePath);
      if (!stat.isFile() || stat.isSymbolicLink() || !isWithinPath(inspectedRoot, real)) throw new Error("not a contained regular file");
      resolutions.push(Object.freeze({ category, importer, realPath: real, resolvedPath: absolutePath, specifier }));
      if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
        for (let directory = path.dirname(real); isWithinPath(inspectedRoot, directory); directory = path.dirname(directory)) {
          const packagePath = path.join(directory, "package.json");
          try {
            const packageStat = await fs.lstat(packagePath);
            if (!packageStat.isFile() || packageStat.isSymbolicLink()) throw new Error("package metadata is not regular");
            sources.set(path.relative(realRoot, packagePath).split(path.sep).join("/"), await fs.readFile(packagePath));
            break;
          } catch (error) { if (error?.code !== "ENOENT") throw error; }
          if (directory === inspectedRoot) break;
        }
        const confirmed = await fs.realpath(await resolveRuntime());
        if (confirmed !== real) throw new Error("package resolution changed during authority validation");
      }
      if (queued.has(real)) continue;
      queued.add(real);
      const relative = path.relative(realRoot, real);
      const entry = { absolutePath: real, owner: "product", repoPath: relative.split(path.sep).join("/") };
      if (!/\.[cm]?[jt]sx?$/iu.test(real)) { sources.set(entry.repoPath, await fs.readFile(real)); continue; }
      if (!deep) {
        const closure = await collectToolcraftPackageContentClosure({ boundaryRoot: inspectedRoot, entryPath: real, includeResolutionUniverse: !resolutionUniverseSealed, projectRoot: realRoot });
        resolutionUniverseSealed = true;
        for (const [repoPath, entries] of closure.directories) directories.set(repoPath, entries);
        for (const [repoPath, packageSource] of closure.sources) sources.set(repoPath, packageSource);
        resolutions.push(...closure.resolutions);
        continue;
      }
      const record = await createToolcraftDependencySourceRecord({ entry, rootDir: projectDir });
      sources.set(entry.repoPath, record.rawSource);
      if (deep) for (const item of record.boundaryEvidence?.playwrightAuthorityViolations ?? []) violations.push(`${entry.repoPath}:${item.line}:${item.column}: ${item.message}`);
      if (deep) for (const item of getToolcraftDependencyImports(entry, record)) if (!item.typeOnly) {
        if (item.specifier) pending.push({ category: item.category, deep: true, importer: real, specifier: item.specifier });
        else violations.push(`${entry.repoPath}:${item.line}:${item.column}: external runtime module loading must be statically resolvable.`);
      }
    } catch (error) { violations.push(`external dependency ${specifier}: runtime dependency could not be inspected (${error.message})`); }
    }
  }
  return { directories, resolutions, sources, violations };
  } finally { await esmResolver.close(); }
}
export async function validateToolcraftFeaturePlaywrightPreflightAuthority({ projectDir }) {
  const manifestAuthority = await requireToolcraftFeaturePreflightManifest(projectDir);
  const configCandidates = await inspectToolcraftExecutableConfigCandidates(projectDir, authorityConfigPaths);
  const protectedFilePaths = await collectToolcraftFrameworkOwnedLocalPaths(projectDir), pinnedSources = new Map();
  for (const repoPath of authorityConfigPaths) try { pinnedSources.set(repoPath, await fs.readFile(path.join(projectDir, repoPath))); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  await assertToolcraftSignedConfigSources(projectDir, pinnedSources, manifestAuthority);
  const configInspection = await collectAuthorityConfigClosure(projectDir), loaderInspection = await collectToolcraftFeatureLoaderClosure(projectDir);
  await assertToolcraftSignedConfigSources(projectDir, configInspection.sources, manifestAuthority);
  await assertToolcraftSignedLoaderSources(projectDir, loaderInspection.sources, manifestAuthority);
  const graph = { moduleImports: [], sourceRecords: new Map() };
  const external = await inspectReachableExternalModules({ additionalRequests: [...configInspection.externalRequests, ...loaderInspection.externalRequests], entryByPath: new Map(), graph,
    productFilePaths: new Set(), projectDir, reachablePaths: [] });
  if (external.violations.length > 0) throw new Error(`Protected config preflight violates executable authority:\n${external.violations.join("\n")}`);
  const snapshot = createToolcraftFeaturePreflightSnapshot({ configCandidates, directories: external.directories, manifestAuthority, resolutions: external.resolutions,
    sources: new Map([[toolcraftFeatureManifestRepoPath, manifestAuthority.source],
      ...configInspection.sources, ...loaderInspection.sources, ...external.sources]) }); return Object.freeze({ seal: await createToolcraftFeaturePreflightSeal(projectDir, graph, protectedFilePaths, snapshot), snapshot });
}
export async function validateToolcraftFeaturePlaywrightAuthority({ files, projectDir,
  productFilePaths: providedProductFilePaths, protectedFilePaths: providedProtectedFilePaths }) {
  const protectedFilePaths = providedProtectedFilePaths ??
    await collectToolcraftFrameworkOwnedLocalPaths(projectDir);
  const inventory = await collectToolcraftSourceInventory({ protectedFilePaths, rootDir: projectDir, sourceRoots: ["e2e", "src"] });
  const configuredAliases = await loadToolcraftLocalModuleAliases({ rootDir: projectDir, tsconfigPaths: ["tsconfig.json"] });
  const graph = await createToolcraftLocalDependencyGraph({ aliases: [...configuredAliases,
    ...createToolcraftDefaultSourceAliases(projectDir)], entries: inventory.entries, rootDir: projectDir });
  const reachablePaths = getToolcraftReachablePaths(graph, files);
  const entryByPath = new Map(graph.entries.map((entry) => [entry.repoPath, entry]));
  const productFilePaths = new Set(providedProductFilePaths ?? []);
  const configInspection = await collectAuthorityConfigClosure(projectDir);
  await assertToolcraftSignedConfigSources(projectDir, configInspection.sources);
  const externalInspection = await inspectReachableExternalModules({ additionalRequests: configInspection.externalRequests,
    entryByPath, graph, productFilePaths, projectDir, reachablePaths });
  const reachablePathSet = new Set(reachablePaths);
  const selectedOrImportedPaths = [...files, ...graph.unresolvedImports.filter(({ importerRepoPath }) =>
    reachablePathSet.has(importerRepoPath)).flatMap(({ resolvedRepoPath }) => resolvedRepoPath === undefined ? [] : [resolvedRepoPath])];
  const filesystemViolations = inventory.filesystemViolations.filter(
    ({ repoPath }) =>
      selectedOrImportedPaths.some((selectedPath) =>
        pathTouchesSymbolicLink(selectedPath, repoPath)
      ),
  );
  const nonStaticViolations = graph.moduleImports.filter((item) => reachablePathSet.has(item.importerRepoPath) &&
    item.resolution === "non-static" && (entryByPath.get(item.importerRepoPath)?.owner === "product" || productFilePaths.has(item.importerRepoPath)));
  const facadeReceipt = await getVerifiedProductTestFacade(projectDir, graph);
  const bridgeViolations = collectToolcraftPlaywrightBindingProvenanceViolations({ entryByPath,
    frameworkFilePaths: new Set(protectedFilePaths), graph, productFilePaths, reachablePaths, verifiedFacade: Boolean(facadeReceipt) });
  const violations = [...bridgeViolations, ...reachablePaths.flatMap((repoPath) => {
    if (entryByPath.get(repoPath)?.owner !== "product" && !productFilePaths.has(repoPath)) return [];
    return graph.sourceRecords.get(repoPath)?.boundaryEvidence
      ?.playwrightAuthorityViolations ?? [];
  })].sort(
    (left, right) =>
      compareCodeUnits(left.repoPath, right.repoPath) ||
      left.line - right.line ||
      left.column - right.column,
  );
  if (filesystemViolations.length > 0 || violations.length > 0 || externalInspection.violations.length > 0 || nonStaticViolations.length > 0) {
    const details = [
      ...filesystemViolations.map(
        ({ reason, repoPath }) => `${repoPath}: ${reason}`,
      ),
      ...violations.map(
        ({ column, line, message, repoPath }) =>
          `${repoPath}:${line}:${column}: ${message}`,
      ),
      ...externalInspection.violations,
      ...nonStaticViolations.map(({ column, importerRepoPath, line }) => `${importerRepoPath}:${line}:${column}: runtime module loading must use a statically resolvable specifier.`),
    ];
    throw new Error(
      `Selected Toolcraft browser proof violates protected Playwright authority:\n${details.join("\n")}`,
    );
  }
  const inspectedSources = new Map([...configInspection.sources, ...externalInspection.sources]);
  try { inspectedSources.set(toolcraftFeatureManifestRepoPath, await readToolcraftFeatureManifestSource(projectDir)); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  return Object.freeze({ facade: facadeReceipt, seal: await createToolcraftFeaturePlaywrightAuthoritySeal(projectDir, graph,
    reachablePaths, inspectedSources, protectedFilePaths, externalInspection.resolutions, externalInspection.directories) });
}
