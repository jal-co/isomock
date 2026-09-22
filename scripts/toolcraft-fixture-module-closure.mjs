import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import path from "node:path";

import { collectToolcraftTypeScriptImportFacts } from "./toolcraft-typescript-source-evidence.mjs";

const generatedRuntimeFixtureEntryPaths = Object.freeze([
  path.join("contracts", "performance-request-evidence-policy.mjs"),
  path.join("performance", "profile-catalog-manifest.mjs"),
  path.join("testing", "performance-path-codec.mjs"),
]);
const followedImportCategories = new Set([
  "dynamic-import",
  "static-export",
  "static-import",
]);

function pathEscapesRoot(rootPath, targetPath) {
  const relativePath = path.relative(rootPath, targetPath);
  return (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  );
}

function getOptionalStat(filePath) {
  try {
    return lstatSync(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function assertInsideRoot(rootPath, targetPath, label) {
  if (pathEscapesRoot(rootPath, targetPath)) {
    throw new Error(
      `Toolcraft fixture ${label} escapes its declared root: ${targetPath}`,
    );
  }
}

function assertNoSymbolicLinks(rootPath, targetPath, label) {
  assertInsideRoot(rootPath, targetPath, label);
  const relativePath = path.relative(rootPath, targetPath);
  let currentPath = rootPath;
  for (const part of relativePath.split(path.sep).filter(Boolean)) {
    currentPath = path.join(currentPath, part);
    const stat = getOptionalStat(currentPath);
    if (!stat) return;
    if (stat.isSymbolicLink()) {
      throw new Error(
        `Toolcraft fixture ${label} contains a symbolic link: ${currentPath}`,
      );
    }
  }
}

function resolveSourceRoot(sourceRoot) {
  const declaredRoot = path.resolve(sourceRoot);
  const stat = lstatSync(declaredRoot);
  if (stat.isSymbolicLink()) {
    throw new Error(
      `Toolcraft fixture source root must not be a symbolic link: ${declaredRoot}`,
    );
  }
  if (!stat.isDirectory()) {
    throw new Error(
      `Toolcraft fixture source root must be a directory: ${declaredRoot}`,
    );
  }
  return { declaredRoot, realRoot: realpathSync(declaredRoot) };
}

function resolveSourceModule(source, sourcePath) {
  const declaredPath = path.resolve(sourcePath);
  assertNoSymbolicLinks(
    source.declaredRoot,
    declaredPath,
    "source module",
  );
  const stat = lstatSync(declaredPath);
  if (!stat.isFile()) {
    throw new Error(
      `Toolcraft fixture source module must be a file: ${declaredPath}`,
    );
  }
  const relativePath = path.relative(source.declaredRoot, declaredPath);
  const realPath = realpathSync(declaredPath);
  const expectedRealPath = path.resolve(source.realRoot, relativePath);
  assertInsideRoot(source.realRoot, realPath, "source module realpath");
  if (realPath !== expectedRealPath) {
    throw new Error(
      `Toolcraft fixture source module resolves through a symbolic link: ${declaredPath}`,
    );
  }
  return { declaredPath, realPath, relativePath };
}

function resolveDestinationRoot(destinationRoot) {
  const declaredRoot = path.resolve(destinationRoot);
  const existingRootStat = getOptionalStat(declaredRoot);
  if (existingRootStat?.isSymbolicLink()) {
    throw new Error(
      `Toolcraft fixture destination root must not be a symbolic link: ${declaredRoot}`,
    );
  }
  if (existingRootStat && !existingRootStat.isDirectory()) {
    throw new Error(
      `Toolcraft fixture destination root must be a directory: ${declaredRoot}`,
    );
  }

  let existingParent = declaredRoot;
  const missingParts = [];
  let existingParentStat = existingRootStat;
  while (!existingParentStat) {
    missingParts.unshift(path.basename(existingParent));
    const parentPath = path.dirname(existingParent);
    if (parentPath === existingParent) {
      throw new Error(
        `Toolcraft fixture destination root has no existing parent: ${declaredRoot}`,
      );
    }
    existingParent = parentPath;
    existingParentStat = getOptionalStat(existingParent);
  }
  if (
    existingParentStat.isSymbolicLink() ||
    !existingParentStat.isDirectory()
  ) {
    throw new Error(
      `Toolcraft fixture destination parent is not a real directory: ${existingParent}`,
    );
  }
  const expectedRealRoot = path.resolve(
    realpathSync(existingParent),
    ...missingParts,
  );
  mkdirSync(declaredRoot, { recursive: true });
  const createdRootStat = lstatSync(declaredRoot);
  if (
    createdRootStat.isSymbolicLink() ||
    !createdRootStat.isDirectory()
  ) {
    throw new Error(
      `Toolcraft fixture destination root is not a real directory: ${declaredRoot}`,
    );
  }
  const realRoot = realpathSync(declaredRoot);
  if (realRoot !== expectedRealRoot) {
    throw new Error(
      `Toolcraft fixture destination root escapes through a symbolic link: ${declaredRoot}`,
    );
  }
  return { declaredRoot, realRoot };
}

function resolveDestinationModule(destination, relativePath) {
  const declaredPath = path.resolve(destination.declaredRoot, relativePath);
  assertInsideRoot(
    destination.declaredRoot,
    declaredPath,
    "destination module",
  );
  const declaredParent = path.dirname(declaredPath);
  assertNoSymbolicLinks(
    destination.declaredRoot,
    declaredParent,
    "destination module",
  );
  const existingStat = getOptionalStat(declaredPath);
  if (existingStat?.isSymbolicLink()) {
    throw new Error(
      `Toolcraft fixture destination module must not be a symbolic link: ${declaredPath}`,
    );
  }
  if (existingStat?.isDirectory()) {
    throw new Error(
      `Toolcraft fixture destination module must not be a directory: ${declaredPath}`,
    );
  }
  mkdirSync(declaredParent, { recursive: true });
  assertNoSymbolicLinks(
    destination.declaredRoot,
    declaredParent,
    "destination module",
  );
  const realParent = realpathSync(declaredParent);
  const expectedRealParent = path.resolve(
    destination.realRoot,
    path.relative(destination.declaredRoot, declaredParent),
  );
  assertInsideRoot(
    destination.realRoot,
    realParent,
    "destination module realpath",
  );
  if (realParent !== expectedRealParent) {
    throw new Error(
      `Toolcraft fixture destination module resolves through a symbolic link: ${declaredPath}`,
    );
  }
  return {
    declaredPath,
    expectedRealPath: path.join(realParent, path.basename(declaredPath)),
  };
}

export function copyGeneratedRuntimeFixtureModuleClosure({
  destinationRoot,
  sourceRoot,
}) {
  copyRelativeModuleClosure({
    destinationRoot,
    entryModulePaths: generatedRuntimeFixtureEntryPaths,
    sourceRoot,
  });
}

export function copyRelativeModuleClosure({
  destinationRoot,
  entryModulePaths,
  followParentImports = true,
  sourceRoot,
}) {
  const source = resolveSourceRoot(sourceRoot);
  const destination = resolveDestinationRoot(destinationRoot);
  const pending = entryModulePaths.map((entryModulePath) =>
    path.resolve(source.declaredRoot, entryModulePath),
  );
  const copied = new Set();
  while (pending.length > 0) {
    const sourceModule = resolveSourceModule(source, pending.pop());
    if (copied.has(sourceModule.relativePath)) continue;
    const rawSource = readFileSync(sourceModule.realPath, "utf8");
    const destinationModule = resolveDestinationModule(
      destination,
      sourceModule.relativePath,
    );
    copyFileSync(sourceModule.realPath, destinationModule.declaredPath);
    const destinationRealPath = realpathSync(destinationModule.declaredPath);
    assertInsideRoot(
      destination.realRoot,
      destinationRealPath,
      "destination module realpath",
    );
    if (destinationRealPath !== destinationModule.expectedRealPath) {
      throw new Error(
        `Toolcraft fixture destination module escaped during copy: ${destinationModule.declaredPath}`,
      );
    }
    copied.add(sourceModule.relativePath);
    for (const imported of collectToolcraftTypeScriptImportFacts({
      absolutePath: sourceModule.declaredPath,
      rawSource,
    })) {
      const { category, specifier } = imported;
      if (
        !followedImportCategories.has(category) ||
        typeof specifier !== "string" ||
        !specifier.endsWith(".mjs") ||
        (!specifier.startsWith("./") && !specifier.startsWith("../")) ||
        (!followParentImports && specifier.startsWith("../"))
      ) {
        continue;
      }
      pending.push(
        path.resolve(path.dirname(sourceModule.declaredPath), specifier),
      );
    }
  }
}
