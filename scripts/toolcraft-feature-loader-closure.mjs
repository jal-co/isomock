import fs from "node:fs/promises";
import path from "node:path";

import { createToolcraftDependencySourceRecord, getToolcraftDependencyImports } from "./toolcraft-dependency-source-record.mjs";

const loaderRoots = ["scripts/toolcraft-feature-source-loader.mjs", "scripts/toolcraft-feature-source-loader-child.mjs"];

async function resolveLocal(projectDir, importerRepoPath, specifier) {
  const base = path.resolve(projectDir, path.dirname(importerRepoPath), specifier);
  for (const candidate of [base, `${base}.mjs`, `${base}.js`, `${base}.ts`, path.join(base, "index.mjs"), path.join(base, "index.js")]) try {
    const stat = await fs.lstat(candidate), relative = path.relative(projectDir, candidate);
    if (stat.isFile() && !stat.isSymbolicLink() && relative !== "" && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) return relative.split(path.sep).join("/");
  } catch (error) { if (error?.code !== "ENOENT") throw error; }
  return undefined;
}

export async function collectToolcraftFeatureLoaderClosure(projectDir) {
  const externalRequests = [], pending = [...loaderRoots], sources = new Map();
  while (pending.length > 0) {
    const repoPath = pending.shift();
    if (sources.has(repoPath)) continue;
    const absolutePath = path.join(projectDir, repoPath), source = await fs.readFile(absolutePath);
    const entry = { absolutePath, owner: "framework", repoPath };
    const record = await createToolcraftDependencySourceRecord({ entry, importsOnly: true, rootDir: projectDir });
    sources.set(repoPath, source);
    for (const imported of getToolcraftDependencyImports(entry, record)) if (!imported.typeOnly) {
      if (imported.specifier.startsWith(".")) {
        const resolved = await resolveLocal(projectDir, repoPath, imported.specifier);
        if (!resolved) throw new Error(`${repoPath} has an unresolved protected loader dependency: ${imported.specifier}`);
        pending.push(resolved);
      } else externalRequests.push({ category: imported.category, deep: false, importer: absolutePath, specifier: imported.specifier });
    }
  }
  return { externalRequests, sources };
}
