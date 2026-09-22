import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

import { hasValidToolcraftIntegrityManifestSignature } from "./toolcraft-integrity-manifest.mjs";
import { createToolcraftNodeEsmResolver } from "./toolcraft-node-esm-resolution.mjs";

const compareCodeUnits = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export function createToolcraftFeaturePreflightSnapshot({ configCandidates, directories, manifestAuthority, resolutions, sources }) {
  return Object.freeze({ configCandidates: Object.freeze([...configCandidates]), directories: Object.freeze([...directories]),
    domainMarkers: manifestAuthority.domainMarkers, manifestAuthority, resolutions: Object.freeze([...resolutions]), sources: Object.freeze([...sources]) });
}

export function createToolcraftFeaturePreflightSeal(projectDir, graph, protectedFilePaths, snapshot) {
  return createToolcraftFeaturePlaywrightAuthoritySeal(projectDir, graph, [], new Map(snapshot.sources), protectedFilePaths,
    snapshot.resolutions, new Map(snapshot.directories), snapshot.configCandidates, snapshot.domainMarkers);
}

export async function revalidateToolcraftFeaturePlaywrightAuthoritySeal(seal) {
  if (!seal?.files) throw new Error("Selected browser authority seal is missing before Playwright execution.");
  for (const file of seal.files) {
    const fileStat = await fs.lstat(file.filePath);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error(`${file.repoPath} changed after authority validation.`);
    if (await fs.realpath(file.filePath) !== file.realPath) throw new Error(`${file.repoPath} changed after authority validation.`);
    const actual = crypto.createHash("sha256").update(await fs.readFile(file.filePath)).digest("hex");
    if (actual !== file.digest) throw new Error(`${file.repoPath} changed after authority validation.`);
  }
  for (const directory of seal.directories ?? []) {
    let stat;
    try { stat = await fs.lstat(directory.directoryPath); }
    catch (error) {
      if (error?.code === "ENOENT" && !directory.exists) continue;
      throw new Error(`${directory.repoPath} directory membership changed after authority validation.`, { cause: error });
    }
    if (!directory.exists) throw new Error(`${directory.repoPath} directory membership changed after authority validation.`);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(directory.directoryPath) !== directory.realPath || JSON.stringify((await fs.readdir(directory.directoryPath)).sort()) !== JSON.stringify(directory.entries))
      throw new Error(`${directory.repoPath} directory membership changed after authority validation.`);
  }
  for (const candidate of seal.pathCandidates ?? []) {
    let stat;
    try { stat = await fs.lstat(candidate.filePath); }
    catch (error) {
      if (error?.code === "ENOENT" && !candidate.exists) continue;
      throw new Error(`${candidate.repoPath} executable config precedence changed after authority validation.`, { cause: error });
    }
    const actualDigest = stat.isFile() ? crypto.createHash("sha256").update(await fs.readFile(candidate.filePath)).digest("hex") : undefined;
    if (!candidate.exists || !stat.isFile() || stat.isSymbolicLink() || await fs.realpath(candidate.filePath) !== candidate.realPath || actualDigest !== candidate.digest)
      throw new Error(`${candidate.repoPath} executable config precedence changed after authority validation.`);
  }
  for (const marker of seal.domainMarkers ?? []) {
    let stat;
    try { stat = await fs.lstat(marker.markerPath); }
    catch (error) {
      if (error?.code === "ENOENT" && !marker.exists) continue;
      throw new Error(`${marker.repoPath} manifest domain evidence changed after authority validation.`, { cause: error });
    }
    if (!marker.exists || !stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(marker.markerPath) !== marker.realPath)
      throw new Error(`${marker.repoPath} manifest domain evidence changed after authority validation.`);
  }
  const esmResolutions = (seal.resolutions ?? []).filter((resolution) => !/require|import-equals|package-directory|package-mapping/iu.test(resolution.category ?? ""));
  const esmResolver = createToolcraftNodeEsmResolver();
  let esmResolved;
  try { esmResolved = await esmResolver.resolveMany(esmResolutions.map(({ importer, specifier }) => ({ importer, specifier }))); }
  finally { await esmResolver.close(); }
  let esmIndex = 0;
  for (const resolution of seal.resolutions ?? []) {
    const useRequire = /require|import-equals/iu.test(resolution.category ?? "");
    if (resolution.category === "package-mapping") {
      if (await fs.realpath(resolution.resolvedPath) !== resolution.realPath) throw new Error(`${resolution.specifier} package mapping changed after authority validation.`);
      continue;
    }
    if (resolution.category === "package-directory") {
      let current;
      for (const directory of createRequire(resolution.importer).resolve.paths(resolution.specifier) ?? []) try {
        const candidate = path.join(directory, resolution.specifier);
        if ((await fs.lstat(path.join(candidate, "package.json"))).isFile()) { current = candidate; break; }
      } catch (error) { if (error?.code !== "ENOENT") throw error; }
      if (!current || path.resolve(current) !== resolution.resolvedPath || await fs.realpath(current) !== resolution.realPath) throw new Error(`${resolution.specifier} resolution changed after authority validation.`);
      continue;
    }
    if (resolution.missing) {
      let appeared = false;
      try { createRequire(resolution.importer).resolve(resolution.specifier); appeared = true; } catch (error) { if (error?.code !== "MODULE_NOT_FOUND") throw error; }
      if (appeared) throw new Error(`${resolution.specifier} resolution changed after authority validation.`);
      continue;
    }
    let resolved = useRequire ? createRequire(resolution.importer).resolve(resolution.specifier) : esmResolved[esmIndex++];
    if (!resolved) throw new Error(`${resolution.specifier} resolution changed after authority validation.`);
    if (!ts.sys.fileExists(resolved)) resolved = ts.resolveModuleName(resolution.specifier, resolution.importer,
      { moduleResolution: ts.ModuleResolutionKind.NodeNext }, ts.sys).resolvedModule?.resolvedFileName ?? resolved;
    if (path.resolve(resolved) !== resolution.resolvedPath || await fs.realpath(resolved) !== resolution.realPath)
      throw new Error(`${resolution.specifier} resolution changed after authority validation (${resolution.resolvedPath} -> ${resolved}).`);
  }
}

export async function createToolcraftFeaturePlaywrightAuthoritySeal(projectDir, graph, reachablePaths, inspectedSources, protectedFilePaths = [], resolutions = [], sealedDirectories = new Map(), sealedPathCandidates = [], sealedDomainMarkers = []) {
  let manifest;
  try { manifest = JSON.parse(await fs.readFile(path.join(projectDir, "src/toolcraft/.toolcraft-manifest.json"), "utf8")); } catch {}
  const signedManifest = manifest && hasValidToolcraftIntegrityManifestSignature(manifest) ? manifest : undefined;
  const protectedPaths = new Set(protectedFilePaths), files = [];
  for (const repoPath of [...new Set([...reachablePaths, ...inspectedSources.keys()])].sort(compareCodeUnits)) {
    const filePath = path.join(projectDir, repoPath);
    let source = graph.sourceRecords.get(repoPath)?.rawSource ?? inspectedSources.get(repoPath);
    try {
      const fileStat = await fs.lstat(filePath);
      if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error(`${repoPath} is not a regular file.`);
      const currentSource = await fs.readFile(filePath);
      if (source === undefined) source = currentSource;
      else if (crypto.createHash("sha256").update(currentSource).digest("hex") !== crypto.createHash("sha256").update(source).digest("hex")) throw new Error(`${repoPath} changed during authority validation.`);
    } catch (error) { if (source !== undefined || reachablePaths.includes(repoPath) || error?.code !== "ENOENT") throw error; else continue; }
    const digest = crypto.createHash("sha256").update(source).digest("hex");
    const signedDigest = manifest?.protectedFiles?.[repoPath];
    if (protectedPaths.has(repoPath) && typeof signedDigest === "string" && (!signedManifest || signedDigest !== digest)) throw new Error(`${repoPath} is not the signed protected config authority.`);
    files.push(Object.freeze({ digest, filePath, realPath: await fs.realpath(filePath), repoPath }));
  }
  const directories = await Promise.all([...sealedDirectories].map(async ([repoPath, state]) => {
    const directoryPath = state.absolutePath ?? path.join(projectDir, repoPath);
    if (!state.exists) {
      try { await fs.lstat(directoryPath); throw new Error(`${repoPath} directory membership changed during authority validation.`); }
      catch (error) { if (error?.code !== "ENOENT") throw error; }
      return Object.freeze({ directoryPath, entries: Object.freeze([]), exists: false, repoPath });
    }
    const stat = await fs.lstat(directoryPath), entries = (await fs.readdir(directoryPath)).sort(), realPath = await fs.realpath(directoryPath);
    if (!stat.isDirectory() || stat.isSymbolicLink() || realPath !== state.realPath || JSON.stringify(entries) !== JSON.stringify(state.entries))
      throw new Error(`${repoPath} directory membership changed during authority validation.`);
    return Object.freeze({ directoryPath, entries: state.entries, exists: true, realPath: state.realPath, repoPath });
  }));
  const pathCandidates = Object.freeze([...sealedPathCandidates]);
  const domainMarkers = Object.freeze([...sealedDomainMarkers]);
  await revalidateToolcraftFeaturePlaywrightAuthoritySeal({ directories: [], domainMarkers, files: [], pathCandidates });
  return Object.freeze({ directories: Object.freeze(directories), domainMarkers, files: Object.freeze(files), pathCandidates, resolutions: Object.freeze([...resolutions]) });
}
