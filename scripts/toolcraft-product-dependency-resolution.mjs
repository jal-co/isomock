import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { getToolcraftTypeScriptCompiler } from "./toolcraft-typescript-source-evidence.mjs";

export const toolcraftModuleExtensions = [
  ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs",
];

export function createToolcraftDefaultSourceAliases(rootDir) {
  return [
    {
      match: "@/*",
      replacement: path.resolve(rootDir, "src/*"),
    },
    {
      match: "#/*",
      replacement: path.resolve(rootDir, "src/*"),
    },
  ];
}

const javascriptToTypeScriptExtensions = new Map([
  [".js", [".ts", ".tsx"]],
  [".jsx", [".tsx", ".ts"]],
  [".mjs", [".mts"]], [".cjs", [".cts"]],
]);

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function getExportTarget(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  for (const key of ["types", "default", "import", "browser", "development"]) {
    const target = getExportTarget(value[key]);
    if (target) return target;
  }
  return null;
}

function getPackageExportEntries(exportsField) {
  if (typeof exportsField === "string") return [[".", exportsField]];
  if (!exportsField || typeof exportsField !== "object" || Array.isArray(exportsField)) {
    return [];
  }
  const entries = Object.entries(exportsField);
  return entries.some(([key]) => key.startsWith("."))
    ? entries.filter(([key]) => key.startsWith("."))
    : [[".", exportsField]];
}

export async function loadToolcraftLocalModuleAliases({
  packageDirectories = [],
  rootDir,
  tsconfigPaths = [],
}) {
  const aliases = [];
  const ts = getToolcraftTypeScriptCompiler();
  if (ts) {
    for (const configEntry of tsconfigPaths) {
      const relativeConfigPath =
        typeof configEntry === "string" ? configEntry : configEntry.path;
      const importerPrefix =
        typeof configEntry === "string" ? undefined : configEntry.importerPrefix;
      const configPath = path.resolve(rootDir, relativeConfigPath);
      const result = ts.readConfigFile(configPath, ts.sys.readFile);
      if (result.error) continue;
      const compilerOptions = result.config.compilerOptions ?? {};
      const baseDir = path.resolve(
        path.dirname(configPath),
        compilerOptions.baseUrl ?? ".",
      );
      for (const [match, replacements] of Object.entries(
        compilerOptions.paths ?? {},
      )) {
        for (const replacement of replacements) {
          aliases.push({
            ...(importerPrefix ? { importerPrefix } : {}),
            match,
            replacement: path.resolve(baseDir, replacement),
          });
        }
      }
    }
  }

  for (const relativePackageDir of packageDirectories) {
    const packageDir = path.resolve(rootDir, relativePackageDir);
    let packageJson;
    try {
      packageJson = JSON.parse(
        await fs.readFile(path.join(packageDir, "package.json"), "utf8"),
      );
    } catch {
      continue;
    }
    if (typeof packageJson.name !== "string") continue;
    aliases.push({
      kind: "local-package-identity",
      localPackageName: packageJson.name,
    });
    for (const [exportKey, exportValue] of getPackageExportEntries(
      packageJson.exports,
    )) {
      const target = getExportTarget(exportValue);
      if (!target) continue;
      aliases.push({
        match:
          exportKey === "."
            ? packageJson.name
            : `${packageJson.name}/${exportKey.replace(/^\.\//u, "")}`,
        replacement: path.resolve(packageDir, target),
      });
    }
  }

  return aliases.sort(
    (left, right) =>
      (right.match?.length ?? 0) - (left.match?.length ?? 0) ||
      compareCodeUnits(left.match ?? "", right.match ?? ""),
  );
}

function aliasCandidates(specifier, importerRepoPath, aliases) {
  const candidates = [];
  for (const alias of aliases) {
    if (alias.kind === "local-package-identity") continue;
    if (alias.importerPrefix && !importerRepoPath.startsWith(alias.importerPrefix)) {
      continue;
    }
    const wildcardIndex = alias.match.indexOf("*");
    if (wildcardIndex < 0) {
      if (specifier === alias.match) candidates.push(alias.replacement);
      continue;
    }
    const prefix = alias.match.slice(0, wildcardIndex);
    const suffix = alias.match.slice(wildcardIndex + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
    const wildcardValue = specifier.slice(
      prefix.length,
      specifier.length - suffix.length,
    );
    candidates.push(alias.replacement.replace("*", wildcardValue));
  }
  return candidates;
}

function cleanModuleSpecifier(specifier) {
  const withoutQuery = specifier.replace(/\?.*$/u, "");
  return withoutQuery.startsWith("#")
    ? withoutQuery
    : withoutQuery.replace(/#.*$/u, "");
}

export function isToolcraftLocalDependencySpecifier({
  aliases,
  importer,
  specifier,
}) {
  const cleanSpecifier = cleanModuleSpecifier(specifier);
  return (
    cleanSpecifier.startsWith(".") ||
    cleanSpecifier.startsWith("/") ||
    aliasCandidates(cleanSpecifier, importer.repoPath, aliases).length > 0 ||
    aliases.some(
      ({ localPackageName }) =>
        localPackageName &&
        (cleanSpecifier === localPackageName ||
          cleanSpecifier.startsWith(`${localPackageName}/`)),
    )
  );
}

function resolveModuleCandidate(
  basePath,
  entryByAbsolutePath,
  { allowUnscanned = false, unscannedExtensions = toolcraftModuleExtensions } = {},
) {
  const normalizedBase = path.resolve(basePath);
  const candidates = [normalizedBase];
  const extension = path.extname(normalizedBase);
  if (!toolcraftModuleExtensions.includes(extension)) {
    candidates.push(
      ...toolcraftModuleExtensions.map((item) => `${normalizedBase}${item}`),
      ...toolcraftModuleExtensions.map((item) =>
        path.join(normalizedBase, `index${item}`),
      ),
    );
  } else {
    for (const replacement of javascriptToTypeScriptExtensions.get(extension) ?? []) {
      candidates.push(`${normalizedBase.slice(0, -extension.length)}${replacement}`);
    }
  }
  const inventoriedCandidate = candidates.find((candidate) =>
    entryByAbsolutePath.has(candidate),
  );
  if (inventoriedCandidate || !allowUnscanned) return inventoriedCandidate;
  return candidates.find(
    (candidate) =>
      unscannedExtensions.includes(path.extname(candidate)) &&
      fsSync.existsSync(candidate) &&
      fsSync.statSync(candidate).isFile(),
  );
}

export function resolveToolcraftLocalDependency({
  aliases,
  allowUnscanned = false,
  entryByAbsolutePath,
  importer,
  rootDir,
  specifier,
  unscannedExtensions,
}) {
  const cleanSpecifier = cleanModuleSpecifier(specifier);
  const baseCandidates = cleanSpecifier.startsWith(".")
    ? [path.resolve(path.dirname(importer.absolutePath), cleanSpecifier)]
    : cleanSpecifier.startsWith("/")
      ? [path.resolve(rootDir, `.${cleanSpecifier}`)]
      : aliasCandidates(cleanSpecifier, importer.repoPath, aliases);

  for (const basePath of baseCandidates) {
    const resolved = resolveModuleCandidate(basePath, entryByAbsolutePath, {
      allowUnscanned,
      unscannedExtensions,
    });
    if (resolved) return resolved;
  }
  return undefined;
}
