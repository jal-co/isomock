import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { hasValidToolcraftIntegrityManifestSignature } from "./toolcraft-integrity-manifest.mjs";
import { requiredProtectedTrustRootFilePaths } from "./toolcraft-integrity-policy.mjs";

const executableConfigPattern = /^(?:playwright|vite)\.config\.[cm]?[jt]s$/u;
const domainMarkerRepoPaths = ["src/toolcraft/runtime", "src/toolcraft/ui"];
const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

async function readManifestAuthority(projectDir) {
  try {
    const source = await fs.readFile(path.join(projectDir, "src/toolcraft/.toolcraft-manifest.json"), "utf8");
    return Object.freeze({ digest: digest(source), manifest: deepFreeze(JSON.parse(source)), source });
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function inspectDomainMarkers(projectDir) {
  return Promise.all(domainMarkerRepoPaths.map(async (repoPath) => {
    const markerPath = path.join(projectDir, repoPath);
    try {
      const stat = await fs.lstat(markerPath);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${repoPath} is not a regular domain marker directory.`);
      return Object.freeze({ exists: true, markerPath, realPath: await fs.realpath(markerPath), repoPath });
    } catch (error) { if (error?.code === "ENOENT") return Object.freeze({ exists: false, markerPath, repoPath }); throw error; }
  }));
}

const digest = (source) => crypto.createHash("sha256").update(source).digest("hex");

export const toolcraftFeatureManifestRepoPath = "src/toolcraft/.toolcraft-manifest.json";

export async function readToolcraftFeatureManifestSource(projectDir) {
  return fs.readFile(path.join(projectDir, toolcraftFeatureManifestRepoPath));
}

export async function requireToolcraftFeaturePreflightManifest(projectDir) {
  const authority = await readManifestAuthority(projectDir);
  if (!authority) {
    throw new Error("Protected preflight requires .toolcraft-manifest.json.");
  }
  const { manifest } = authority;
  if (!hasValidToolcraftIntegrityManifestSignature(manifest) || Object.keys(manifest.files ?? {}).length === 0 || Object.keys(manifest.protectedFiles ?? {}).length === 0) {
    throw new Error("Protected preflight requires a signed nonempty Toolcraft manifest inventory.");
  }
  const domainMarkers = Object.freeze(await inspectDomainMarkers(projectDir));
  const hasGeneratedDomain = domainMarkers.every(({ exists }) => exists);
  if (manifest.domain === "starter") {
    if (domainMarkers.some(({ exists }) => exists)) throw new Error("Generated applications cannot use the starter preflight manifest domain.");
    const packageSource = await fs.readFile(path.join(projectDir, "package.json"));
    if (digest(packageSource) !== manifest.protectedFiles?.["package.json"]) throw new Error("Starter preflight manifest is outside its canonical package authority.");
  } else if (manifest.domain === "generated") {
    if (!hasGeneratedDomain) throw new Error("Generated preflight manifest requires its runtime and UI domain evidence.");
    for (const repoPath of requiredProtectedTrustRootFilePaths)
      if (typeof manifest.protectedFiles?.[repoPath] !== "string") throw new Error(`Generated manifest is missing protected framework coverage for ${repoPath}.`);
  } else throw new Error("Protected preflight manifest domain is missing or unsupported.");
  return Object.freeze({ ...authority, domainMarkers });
}

export async function assertToolcraftSignedConfigSources(projectDir, sources, authority) {
  const manifest = authority?.manifest ?? (await readManifestAuthority(projectDir))?.manifest;
  if (!manifest) return;
  if (!hasValidToolcraftIntegrityManifestSignature(manifest)) throw new Error("Protected config inventory signature is invalid.");
  for (const [repoPath, source] of sources) {
    if (!executableConfigPattern.test(repoPath)) continue;
    const expected = manifest.protectedFiles?.[repoPath];
    if (typeof expected !== "string" || digest(source) !== expected) {
      throw new Error(`${repoPath} required signed config authority is missing or changed.`);
    }
  }
  for (const [repoPath, expected] of Object.entries(manifest.protectedFiles ?? {})) {
    if (!executableConfigPattern.test(repoPath) && !/^tsconfig(?:\.|$)/u.test(repoPath)) continue;
    const source = sources.get(repoPath);
    if (!source || digest(source) !== expected) throw new Error(`${repoPath} required signed config authority is missing or changed.`);
  }
}

export async function assertToolcraftSignedLoaderSources(projectDir, sources, authority) {
  const manifest = authority?.manifest ?? (await readManifestAuthority(projectDir))?.manifest;
  if (!manifest) return;
  if (!hasValidToolcraftIntegrityManifestSignature(manifest)) throw new Error("Protected feature source-loader inventory signature is invalid.");
  for (const [repoPath, source] of sources) {
    const expected = manifest.files?.[repoPath] ?? manifest.protectedFiles?.[repoPath];
    if (expected !== digest(source)) throw new Error(`${repoPath} is not the signed protected feature source-loader authority.`);
  }
}

export async function inspectToolcraftExecutableConfigCandidates(projectDir, repoPaths) {
  return Promise.all(repoPaths.map(async (repoPath) => {
    const filePath = path.join(projectDir, repoPath);
    try {
      const stat = await fs.lstat(filePath), source = await fs.readFile(filePath, "utf8");
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${repoPath} is not a regular executable config candidate.`);
      return Object.freeze({ digest: digest(source), exists: true, filePath, realPath: await fs.realpath(filePath), repoPath, source });
    } catch (error) { if (error?.code === "ENOENT") return Object.freeze({ exists: false, filePath, repoPath }); throw error; }
  }));
}
