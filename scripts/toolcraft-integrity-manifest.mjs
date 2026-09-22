import crypto from "node:crypto";
import path from "node:path";

const integrityManifestPublicKey = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAqbjGwrHmhB5DcE09wdkmFrD90fNWcdXwxZDjAh2+CV8=
-----END PUBLIC KEY-----`;

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function createManifestFileMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return new Map();
  }

  return new Map(
    Object.entries(value).map(([relativePath, hash]) => [
      relativePath,
      String(hash),
    ]),
  );
}

function sortManifestFileRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([relativePath, hash]) => [relativePath, String(hash)])
      .sort(([left], [right]) => compareCodeUnits(left, right)),
  );
}

export function hasValidToolcraftIntegrityManifestSignature(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return false;
  }
  if (typeof manifest.signature !== "string" || manifest.signature.length === 0) {
    return false;
  }

  const payload = JSON.stringify({
    ...(manifest.domain === undefined ? {} : { domain: manifest.domain }),
    files: sortManifestFileRecord(manifest.files),
    packageScripts: sortManifestFileRecord(manifest.packageScripts),
    protectedFiles: sortManifestFileRecord(manifest.protectedFiles),
    version: manifest.version,
  });

  try {
    return crypto.verify(
      null,
      Buffer.from(payload),
      integrityManifestPublicKey,
      Buffer.from(manifest.signature, "base64"),
    );
  } catch {
    return false;
  }
}

export function isToolcraftStarterPreflightManifest(manifest) {
  return hasValidToolcraftIntegrityManifestSignature(manifest) && manifest.domain === "starter";
}

function resolveRelativePathWithin(rootDir, relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.split("/").includes("..")
  ) {
    return null;
  }

  const resolvedPath = path.resolve(rootDir, ...relativePath.split("/"));
  const resolvedRelativePath = path.relative(rootDir, resolvedPath);

  if (
    resolvedRelativePath === "" ||
    resolvedRelativePath.startsWith(`..${path.sep}`) ||
    resolvedRelativePath === ".." ||
    path.isAbsolute(resolvedRelativePath)
  ) {
    return null;
  }

  return resolvedPath;
}

function resolveManifestFiles({ entries, failureLabel, failures, rootDir }) {
  const resolvedFiles = new Map();

  for (const [relativePath, expectedHash] of entries) {
    const filePath = resolveRelativePathWithin(rootDir, relativePath);

    if (!filePath) {
      failures.push(`invalid ${failureLabel} path ${relativePath}`);
      continue;
    }

    resolvedFiles.set(relativePath, { expectedHash, filePath });
  }

  return resolvedFiles;
}

export function validateIntegrityManifest({
  appRoot,
  manifest,
  requiredPackageScriptNames,
  requiredProtectedTrustRootFilePaths,
  toolcraftRoot,
}) {
  if (manifest.version !== 3) {
    return {
      failures: [
        `manifest version ${String(manifest.version)} is unsupported; expected 3`,
      ],
    };
  }

  if (!hasValidToolcraftIntegrityManifestSignature(manifest)) {
    return { failures: ["manifest signature is invalid"] };
  }

  const expectedFiles = createManifestFileMap(manifest.files);
  const expectedPackageScripts = createManifestFileMap(manifest.packageScripts);
  const protectedFiles = createManifestFileMap(manifest.protectedFiles);
  const failures = [];

  if (expectedFiles.size === 0) {
    failures.push("manifest files is missing or empty");
  }

  if (protectedFiles.size === 0) {
    failures.push("manifest protectedFiles is missing or empty");
  }

  if (expectedPackageScripts.size === 0) {
    failures.push("manifest packageScripts is missing or empty");
  }

  for (const scriptName of requiredPackageScriptNames) {
    if (!expectedPackageScripts.has(scriptName)) {
      failures.push(`manifest missing protected package script ${scriptName}`);
    }
  }

  for (const relativePath of requiredProtectedTrustRootFilePaths) {
    if (!protectedFiles.has(relativePath)) {
      failures.push(`manifest missing protected file ${relativePath}`);
    }
  }

  const resolvedExpectedFiles = resolveManifestFiles({
    entries: expectedFiles,
    failureLabel: "Toolcraft",
    failures,
    rootDir: toolcraftRoot,
  });
  const resolvedProtectedFiles = resolveManifestFiles({
    entries: protectedFiles,
    failureLabel: "protected",
    failures,
    rootDir: appRoot,
  });

  return {
    expectedPackageScripts,
    failures,
    resolvedExpectedFiles,
    resolvedProtectedFiles,
  };
}
