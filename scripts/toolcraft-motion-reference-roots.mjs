import fs from "node:fs/promises";
import path from "node:path";

import {
  resolveToolcraftRootResourcePath,
} from "./toolcraft-source-inventory.mjs";

const REFERENCE_ID = /^motion-reference-v1-[a-f0-9]{64}$/u;
const REFERENCE_STUDIES_RESOURCE_PATH = "src/app/reference-studies";
const TEMPORARY_RESOURCE_PATH = ".toolcraft/tmp";

function fail(message, cause) {
  throw new Error(`Toolcraft motion reference roots failed: ${message}`, { cause });
}

async function requireDirectRoot({ fileSystem, label, requestedRoot, resolvedRoot }) {
  if (typeof requestedRoot !== "string" || !path.isAbsolute(requestedRoot) ||
      requestedRoot !== resolvedRoot) {
    fail(`${label} must be the canonical app-owned directory`);
  }
  const status = await fileSystem.lstat(resolvedRoot);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    fail(`${label} must be a direct directory, not a link`);
  }
  return resolvedRoot;
}

export function resolveToolcraftMotionReferenceRoots(rootDir) {
  return {
    referenceStudiesRoot: resolveToolcraftRootResourcePath(
      REFERENCE_STUDIES_RESOURCE_PATH, rootDir,
    ),
    temporaryRoot: resolveToolcraftRootResourcePath(
      TEMPORARY_RESOURCE_PATH, rootDir,
    ),
  };
}

export function requireToolcraftMotionReferenceStudiesRoot({
  fileSystem = fs,
  referenceStudiesRoot,
  rootDir,
}) {
  return requireDirectRoot({
    fileSystem,
    label: "reference studies root",
    requestedRoot: referenceStudiesRoot,
    resolvedRoot: resolveToolcraftMotionReferenceRoots(rootDir).referenceStudiesRoot,
  });
}

export function requireToolcraftMotionReferenceTemporaryRoot({
  fileSystem = fs,
  rootDir,
  temporaryRoot,
}) {
  return requireDirectRoot({
    fileSystem,
    label: "temporary root",
    requestedRoot: temporaryRoot,
    resolvedRoot: resolveToolcraftMotionReferenceRoots(rootDir).temporaryRoot,
  });
}

export function requireToolcraftMotionReferenceSourceIdentity(sourceIdentity) {
  if (!REFERENCE_ID.test(sourceIdentity ?? "")) {
    fail("source identity must be a canonical motion reference id");
  }
  return sourceIdentity;
}

export function defineToolcraftMotionReferenceTransactionPaths(
  checkedTemporaryRoot,
  sourceIdentity,
) {
  requireToolcraftMotionReferenceSourceIdentity(sourceIdentity);
  return {
    lockDirectory: path.join(checkedTemporaryRoot, `${sourceIdentity}.lock`),
    transactionRoot: path.join(
      checkedTemporaryRoot, `${sourceIdentity}.transaction`,
    ),
  };
}
