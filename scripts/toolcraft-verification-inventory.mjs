import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const ignoredDirectoryNames = new Set([
  ".agents",
  ".git",
  ".playwright-mcp",
  ".toolcraft",
  ".vite",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const ignoredRootFileNames = new Set([
  "skills-lock.json",
]);
const ignoredRepoPaths = new Set([
  "docs/toolcraft/workflow-observation.md",
]);
const verificationInventoryRoots = new WeakMap();

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function toRepoPath(rootDir, absolutePath) {
  return toPosixPath(path.relative(rootDir, absolutePath));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function createToolcraftVerificationSourceHash(entries) {
  return sha256(
    [...entries]
      .sort((left, right) => compareCodeUnits(left.path, right.path))
      .map((entry) => `${entry.path}\0${entry.sha256}\n`)
      .join(""),
  );
}

function isIgnoredVerificationInventoryPath(repoPath) {
  const pathSegments = repoPath.split("/");
  return (
    ignoredRepoPaths.has(repoPath) ||
    (pathSegments.length === 1 && ignoredRootFileNames.has(repoPath)) ||
    pathSegments.some((segment) => ignoredDirectoryNames.has(segment))
  );
}

export function getToolcraftChangedVerificationFiles(previousFiles, currentFiles) {
  const previous = new Map(
    previousFiles
      .filter(({ path: repoPath }) =>
        !isIgnoredVerificationInventoryPath(repoPath))
      .map(({ path: repoPath, sha256 }) => [repoPath, sha256]),
  );
  const current = new Map(
    currentFiles
      .filter(({ path: repoPath }) =>
        !isIgnoredVerificationInventoryPath(repoPath))
      .map(({ path: repoPath, sha256 }) => [repoPath, sha256]),
  );
  return [...new Set([...previous.keys(), ...current.keys()])]
    .filter((filePath) => previous.get(filePath) !== current.get(filePath))
    .sort(compareCodeUnits);
}

function isCanonicalVerificationInventoryPath(value) {
  if (typeof value !== "string") return false;
  const pathSegments = value.split("/");
  return (
    value.length > 0 &&
    !value.includes("\\") &&
    !path.posix.isAbsolute(value) &&
    !path.win32.isAbsolute(value) &&
    !pathSegments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  );
}

function isCanonicalVerificationInventoryEntry(value) {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, "path") ||
    !Object.hasOwn(value, "sha256") ||
    typeof value.path !== "string" ||
    typeof value.sha256 !== "string"
  ) {
    return false;
  }
  return (
    isCanonicalVerificationInventoryPath(value.path) &&
    /^[a-f0-9]{64}$/u.test(value.sha256)
  );
}

export function getToolcraftVerificationInventoryError({
  entries,
  label,
  sourceHash,
}) {
  if (
    !Array.isArray(entries) ||
    !entries.every(isCanonicalVerificationInventoryEntry)
  ) {
    return `${label} contains malformed or non-canonical paths.`;
  }
  const uniquePaths = new Set(entries.map((entry) => entry.path));
  if (uniquePaths.size !== entries.length) {
    return `${label} contains duplicate paths.`;
  }
  const sortedPaths = entries
    .map((entry) => entry.path)
    .sort(compareCodeUnits);
  if (!entries.every((entry, index) => entry.path === sortedPaths[index])) {
    return `${label} paths are not in canonical order.`;
  }
  if (createToolcraftVerificationSourceHash(entries) !== sourceHash) {
    return `${label} does not produce its source hash.`;
  }
  return undefined;
}

export function assertToolcraftVerificationInventoryProvenance({
  inventory,
  rootDir,
}) {
  const inventoryRoot = verificationInventoryRoots.get(inventory);
  if (inventoryRoot === undefined) {
    throw new Error(
      "Toolcraft integrity evaluation requires an inventory returned directly by collectToolcraftVerificationInputs.",
    );
  }
  if (inventoryRoot !== path.resolve(rootDir)) {
    throw new Error(
      "Toolcraft integrity inventory was collected for a different app root.",
    );
  }
}

async function collectFiles(directory, rootDir, files) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => compareCodeUnits(left.name, right.name));

  for (const entry of entries) {
    if (
      directory === rootDir &&
      ignoredRootFileNames.has(entry.name)
    ) {
      continue;
    }
    if (ignoredDirectoryNames.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    const repoPath = toRepoPath(rootDir, absolutePath);
    if (ignoredRepoPaths.has(repoPath)) continue;
    if (!isCanonicalVerificationInventoryPath(repoPath)) {
      throw new Error(
        `Toolcraft verification inputs contain a non-canonical path: ${repoPath}.`,
      );
    }
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Toolcraft verification inputs must not contain symbolic links: ${repoPath}.`,
      );
    }
    if (entry.isDirectory()) {
      await collectFiles(absolutePath, rootDir, files);
      continue;
    }
    if (entry.isFile()) files.push(absolutePath);
  }
}

export async function collectToolcraftVerificationInputs(rootDir) {
  const resolvedRoot = path.resolve(rootDir);
  const files = [];
  await collectFiles(resolvedRoot, resolvedRoot, files);
  files.sort((left, right) =>
    compareCodeUnits(toRepoPath(resolvedRoot, left), toRepoPath(resolvedRoot, right)),
  );
  const entries = [];
  for (const absolutePath of files) {
    entries.push({
      path: toRepoPath(resolvedRoot, absolutePath),
      sha256: sha256(await fs.readFile(absolutePath)),
    });
  }

  const inventory = Object.freeze({
    entries: Object.freeze(entries.map(Object.freeze)),
    sourceHash: createToolcraftVerificationSourceHash(entries),
  });
  verificationInventoryRoots.set(inventory, resolvedRoot);
  return inventory;
}

export function assertToolcraftVerificationInputsUnchanged({
  baseline,
  current,
  phase,
}) {
  if (baseline.sourceHash !== current.sourceHash) {
    throw new Error(
      `Toolcraft verification inputs changed ${phase}. Stop editing and rerun the active protected verification command.`,
    );
  }
}
