import path from "node:path";

function isTrimmedString(value) {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

export function getToolcraftPlaywrightProjectRoot(config) {
  const configFile = config?.configFile;
  if (!isTrimmedString(configFile) || !path.isAbsolute(configFile)) {
    throw new Error(
      "Toolcraft Playwright project root requires an absolute configFile.",
    );
  }
  return path.dirname(configFile);
}

function normalizeContainingFile(file, rootDir) {
  if (!isTrimmedString(file) || !isTrimmedString(rootDir)) {
    throw new Error("Playwright containing file metadata is malformed.");
  }
  const relativeFile = path.isAbsolute(file)
    ? path.relative(rootDir, file).split(path.sep).join("/")
    : file;
  if (
    path.posix.isAbsolute(relativeFile) ||
    path.win32.isAbsolute(relativeFile) ||
    relativeFile.includes("\\") ||
    relativeFile !== path.posix.normalize(relativeFile) ||
    relativeFile.split("/").some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    throw new Error(
      "Playwright containing file must be a canonical path under its configured root.",
    );
  }
  return relativeFile;
}

export function getToolcraftPlaywrightContainingFile(testCase, rootDir) {
  const files = new Set();
  for (let suite = testCase?.parent; suite; suite = suite.parent) {
    if (suite.type === "file" && suite.location?.file) {
      files.add(normalizeContainingFile(suite.location.file, rootDir));
    }
  }
  if (files.size === 0) {
    throw new Error(
      `Test "${testCase?.title ?? "<unknown>"}" has no containing Playwright file suite.`,
    );
  }
  if (files.size > 1) {
    throw new Error(
      `Test "${testCase?.title ?? "<unknown>"}" has ambiguous containing Playwright file suites.`,
    );
  }
  return [...files][0];
}
