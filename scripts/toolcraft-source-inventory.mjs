import fs from "node:fs";
import path from "node:path";

import { toolcraftModuleExtensions } from "./toolcraft-product-dependency-resolution.mjs";

export const toolcraftSourceExtensions = new Set([
  ...toolcraftModuleExtensions,
  ".css",
]);

const defaultGeneratedFilePatterns = [/\/route-tree\.gen\.ts$/u];
const defaultTestFilePatterns = [
  /(?:^|\/)[^/]+\.(?:test|spec|story|stories)\.[cm]?[jt]sx?$/u,
];
const defaultTestSupportPatterns = [
  /^e2e\//u,
  /(?:^|\/)(?:__mocks__|__tests__|fixtures|story|stories|support|test-evidence|test-support|tests?)(?:\/|$)/u,
  /(?:^|\/)[^/]*(?:[.-](?:fixtures?|support|test-support|test-utils))\.[cm]?[jt]sx?$/u,
];

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function matchesAny(repoPath, patterns) {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(repoPath);
  });
}

function normalizePrefix(prefix) {
  const normalized = toPosixPath(prefix).replace(/^\.\//u, "");
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

export function classifyToolcraftSourcePath(
  repoPath,
  {
    frameworkPathPrefixes = ["src/toolcraft/"],
    generatedFilePatterns = defaultGeneratedFilePatterns,
    protectedFilePaths = [],
    testFilePatterns = defaultTestFilePatterns,
    testSupportPatterns = defaultTestSupportPatterns,
  } = {},
) {
  const normalizedPath = toPosixPath(repoPath).replace(/^\.\//u, "");
  const protectedPathSet = new Set(
    protectedFilePaths.map((filePath) =>
      toPosixPath(filePath).replace(/^\.\//u, ""),
    ),
  );
  const normalizedFrameworkPrefixes =
    frameworkPathPrefixes.map(normalizePrefix);

  const owner = protectedPathSet.has(normalizedPath)
    ? "platform"
    : normalizedFrameworkPrefixes.some((prefix) =>
          normalizedPath.startsWith(prefix),
        )
      ? "framework"
      : "product";
  const role = matchesAny(normalizedPath, generatedFilePatterns)
    ? "generated"
    : matchesAny(normalizedPath, testFilePatterns)
      ? "test"
      : matchesAny(normalizedPath, testSupportPatterns)
        ? "test-support"
        : "production";

  return { owner, role };
}

export function collectToolcraftSourceInventorySync({
  frameworkPathPrefixes = ["src/toolcraft/"],
  generatedFilePatterns = defaultGeneratedFilePatterns,
  ignoredFilePatterns = [],
  includeResourceFiles = false,
  protectedFilePaths = [],
  rootDir,
  sourceExtensions = toolcraftSourceExtensions,
  sourceRoots = ["src"],
  testFilePatterns = defaultTestFilePatterns,
  testSupportPatterns = defaultTestSupportPatterns,
}) {
  const entriesByRepoPath = new Map();
  const filesystemViolationsByRepoPath = new Map();

  function recordSymbolicLink(repoPath) {
    filesystemViolationsByRepoPath.set(repoPath, {
      reason:
        "Symbolic links can move checked source outside the Toolcraft source boundary.",
      repoPath,
    });
  }

  function visit(directory) {
    let entries;

    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const repoPath = toPosixPath(path.relative(rootDir, absolutePath));

      if (entry.isSymbolicLink()) {
        recordSymbolicLink(repoPath);
        continue;
      }

      if (matchesAny(repoPath, ignoredFilePatterns)) {
        continue;
      }

      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }

      if (
        !entry.isFile() ||
        (!includeResourceFiles &&
          !sourceExtensions.has(path.extname(entry.name)))
      ) {
        continue;
      }

      const classification = classifyToolcraftSourcePath(repoPath, {
        frameworkPathPrefixes,
        generatedFilePatterns,
        protectedFilePaths,
        testFilePatterns,
        testSupportPatterns,
      });

      entriesByRepoPath.set(repoPath, {
        absolutePath,
        repoPath,
        ...classification,
      });
    }
  }

  for (const sourceRoot of sourceRoots) {
    const absoluteSourceRoot = path.join(rootDir, sourceRoot);
    let sourceRootStat;

    try {
      sourceRootStat = fs.lstatSync(absoluteSourceRoot);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }

    if (sourceRootStat.isSymbolicLink()) {
      recordSymbolicLink(
        toPosixPath(path.relative(rootDir, absoluteSourceRoot)),
      );
      continue;
    }

    visit(absoluteSourceRoot);
  }

  return {
    entries: [...entriesByRepoPath.values()].sort((left, right) =>
      compareCodeUnits(left.repoPath, right.repoPath),
    ),
    filesystemViolations: [...filesystemViolationsByRepoPath.values()].sort(
      (left, right) => compareCodeUnits(left.repoPath, right.repoPath),
    ),
  };
}

export async function collectToolcraftSourceInventory(options) {
  return collectToolcraftSourceInventorySync(options);
}

function createResourceRootEscapeError(resourcePath, rootDir, reason) {
  const error = new Error(
    `Explicit resource path "${resourcePath}" ${reason} "${rootDir}".`,
  );
  error.code = "TOOLCRAFT_RESOURCE_ROOT_ESCAPE";
  return error;
}

function pathEscapesRoot(rootPath, targetPath) {
  const relativePath = path.relative(rootPath, targetPath);
  return (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  );
}

function resolveExistingResourceAncestor(targetPath) {
  let candidatePath = targetPath;
  for (;;) {
    try {
      return fs.realpathSync(candidatePath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parentPath = path.dirname(candidatePath);
      if (parentPath === candidatePath) throw error;
      candidatePath = parentPath;
    }
  }
}

export function resolveToolcraftRootResourcePath(resourcePath, rootDir) {
  if (
    typeof resourcePath !== "string" ||
    path.isAbsolute(resourcePath) ||
    path.posix.isAbsolute(resourcePath) ||
    path.win32.isAbsolute(resourcePath)
  ) {
    throw createResourceRootEscapeError(
      resourcePath,
      rootDir,
      "must be root-relative and stay within the configured root boundary",
    );
  }
  const normalizedPath = path.posix.normalize(
    resourcePath.replaceAll("\\", "/"),
  );
  const absolutePath = path.resolve(rootDir, ...normalizedPath.split("/"));
  if (
    normalizedPath === ".." ||
    normalizedPath.startsWith("../") ||
    pathEscapesRoot(path.resolve(rootDir), absolutePath)
  ) {
    throw createResourceRootEscapeError(
      resourcePath,
      rootDir,
      "is outside the configured root boundary",
    );
  }
  const rootRealPath = fs.realpathSync(rootDir);
  const resourceBoundaryPath = resolveExistingResourceAncestor(absolutePath);
  if (pathEscapesRoot(rootRealPath, resourceBoundaryPath)) {
    throw createResourceRootEscapeError(
      resourcePath,
      rootDir,
      "resolves outside the root boundary for configured root",
    );
  }
  return absolutePath;
}

export function createCanonicalGraphEntries({
  entries,
  explicitResourcePaths = [],
  rootDir,
}) {
  const entriesByRepoPath = new Map(
    entries.map((entry) => [
      toPosixPath(entry.repoPath).replace(/^\.\//u, ""),
      entry,
    ]),
  );
  for (const resourcePath of explicitResourcePaths) {
    const absolutePath = resolveToolcraftRootResourcePath(
      resourcePath,
      rootDir,
    );
    const repoPath = toPosixPath(path.relative(rootDir, absolutePath));
    if (entriesByRepoPath.has(repoPath)) continue;

    let resourceStat;
    try {
      resourceStat = fs.lstatSync(absolutePath);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (!resourceStat.isFile() || resourceStat.isSymbolicLink()) continue;
    entriesByRepoPath.set(repoPath, {
      absolutePath,
      repoPath,
      ...classifyToolcraftSourcePath(repoPath),
    });
  }

  return [...entriesByRepoPath.values()].sort((left, right) =>
    compareCodeUnits(left.repoPath, right.repoPath),
  );
}
