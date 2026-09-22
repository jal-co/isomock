import fs from "node:fs/promises";
import path from "node:path";

import {
  createToolcraftCssSourceRecord,
} from "./toolcraft-css-source-evidence.mjs";
import {
  toolcraftModuleExtensions,
} from "./toolcraft-product-dependency-resolution.mjs";
import {
  createToolcraftTypeScriptDependencyRecord,
  createToolcraftTypeScriptSourceRecord,
} from "./toolcraft-typescript-source-evidence.mjs";

export async function createToolcraftDependencySourceRecord({
  entry,
  includeBoundaryEvidence = true,
  importsOnly,
  rootDir,
}) {
  const extension = path.extname(entry.repoPath);
  const isModule = toolcraftModuleExtensions.includes(extension);
  const isCss = /\.css$/u.test(entry.repoPath);
  if (!isModule && !isCss) return undefined;
  const rawSource = await fs.readFile(entry.absolutePath, "utf8");
  if (isCss) {
    return createToolcraftCssSourceRecord({
      rawSource,
      repoPath: entry.repoPath,
    });
  }
  return importsOnly
    ? createToolcraftTypeScriptDependencyRecord({
        absolutePath: entry.absolutePath,
        rawSource,
      })
    : createToolcraftTypeScriptSourceRecord({
        absolutePath: entry.absolutePath,
        includeBoundaryEvidence,
        rawSource,
        repoPath: entry.repoPath,
        rootDir,
      });
}

export function getToolcraftDependencyImports(entry, sourceRecord) {
  if (!sourceRecord.cssEvidence) return sourceRecord.imports;
  if (!/\.module\.css$/iu.test(entry.repoPath)) return [];
  return sourceRecord.cssEvidence.urlFacts
    .filter(({ local, quoted }) => local && quoted)
    .map(({ column, line, value }) => Object.freeze({
      category: "css-url",
      column,
      line,
      specifier:
        [".", "/", "@/"].some((prefix) => value.startsWith(prefix))
          ? value
          : `./${value}`,
      typeOnly: false,
    }));
}
