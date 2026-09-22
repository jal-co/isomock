import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  getToolcraftCheckpointBundlePath,
  getToolcraftObsoleteCheckpointReceiptPaths,
} from "./toolcraft-checkpoint-paths.mjs";
import { writeDurableCheckpointAtomic } from "./toolcraft-checkpoint-durable-fs.mjs";
import { readToolcraftReceiptFile } from "./toolcraft-receipt-file-io.mjs";
import {
  assertToolcraftVerificationInputsUnchanged,
  assertToolcraftVerificationInventoryProvenance,
  collectToolcraftVerificationInputs,
} from "./toolcraft-verification-inventory.mjs";

export const TOOLCRAFT_CHECKPOINT_BUNDLE_VERSION = 1;

const bundleKeys = Object.freeze([
  "currentPerformance",
  "delivery",
  "kind",
  "performanceBaseline",
  "version",
]);
const unsupportedOldLayoutError =
  "Toolcraft verification checkpoint uses an unsupported old split-file layout.";
const ambiguousLayoutError =
  "Toolcraft verification checkpoint uses an ambiguous unsupported layout: checkpoint.json exists with obsolete split files.";
const unreadableCanonicalError =
  "Toolcraft verification checkpoint bundle is malformed or unreadable.";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isNullableRecord(value) {
  return value === null || isRecord(value);
}

export function createToolcraftCheckpointBundle({
  currentPerformance = null,
  delivery,
  performanceBaseline = null,
}) {
  return {
    currentPerformance,
    delivery,
    kind: "toolcraft-verification-checkpoint",
    performanceBaseline,
    version: TOOLCRAFT_CHECKPOINT_BUNDLE_VERSION,
  };
}

export function getToolcraftCheckpointBundleShapeError(bundle) {
  if (
    !hasExactKeys(bundle, bundleKeys) ||
    bundle.kind !== "toolcraft-verification-checkpoint" ||
    bundle.version !== TOOLCRAFT_CHECKPOINT_BUNDLE_VERSION ||
    !isRecord(bundle.delivery) ||
    !isNullableRecord(bundle.performanceBaseline) ||
    !isNullableRecord(bundle.currentPerformance)
  ) {
    return "Toolcraft verification checkpoint bundle is malformed or uses an unsupported version.";
  }
  return undefined;
}

async function readDirectoryEntryNames(directoryPath) {
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    return new Set(entries.map(({ name }) => name));
  } catch (error) {
    if (error?.code === "ENOENT") return new Set();
    throw error;
  }
}

async function inspectCheckpointLayout(rootDir) {
  const canonicalPath = getToolcraftCheckpointBundlePath(rootDir);
  const obsoletePaths = Object.values(
    getToolcraftObsoleteCheckpointReceiptPaths(rootDir),
  );
  const entryNames = await readDirectoryEntryNames(path.dirname(canonicalPath));
  const canonicalExists = entryNames.has(path.basename(canonicalPath));
  const hasObsolete = obsoletePaths.some((filePath) =>
    entryNames.has(path.basename(filePath)),
  );
  return {
    canonicalExists,
    error: hasObsolete
      ? canonicalExists
        ? ambiguousLayoutError
        : unsupportedOldLayoutError
      : undefined,
  };
}

async function readCanonicalBundle(rootDir) {
  const layout = await inspectCheckpointLayout(rootDir);
  if (layout.error) return { error: layout.error };
  if (!layout.canonicalExists) return { missing: true };
  const loaded = await readToolcraftReceiptFile(
    getToolcraftCheckpointBundlePath(rootDir),
  );
  if (loaded.missing) return { error: unreadableCanonicalError };
  if (loaded.malformed) {
    return { error: "Toolcraft verification checkpoint bundle is malformed JSON." };
  }
  const shapeError = getToolcraftCheckpointBundleShapeError(loaded.receipt);
  return shapeError
    ? { error: shapeError }
    : { bundle: loaded.receipt, source: "canonical" };
}

export async function readToolcraftCheckpointBundle(rootDir) {
  return readCanonicalBundle(rootDir);
}

export async function writeToolcraftCheckpointBundle({
  assertCommitPrecondition,
  bundle,
  observeDurabilityBarrier,
  rootDir,
}) {
  const shapeError = getToolcraftCheckpointBundleShapeError(bundle);
  if (shapeError) throw new Error(shapeError);
  const current = await readCanonicalBundle(rootDir);
  if (current.error) throw new Error(current.error);
  const filePath = getToolcraftCheckpointBundlePath(rootDir);
  await writeDurableCheckpointAtomic({
    assertCommitPrecondition: async () => {
      await assertCommitPrecondition?.();
      const preparedCurrent = await readCanonicalBundle(rootDir);
      if (preparedCurrent.error) throw new Error(preparedCurrent.error);
    },
    contents: `${JSON.stringify(bundle, null, 2)}\n`,
    filePath,
    observeDurabilityBarrier,
    phase: "checkpoint-committed",
    temporaryPath: path.join(
      path.dirname(filePath),
      `.checkpoint-${randomUUID()}.tmp`,
    ),
  });
  return bundle;
}

export async function updateToolcraftCheckpointBundle({
  expectedSourceInventory,
  rootDir,
  update,
  observeDurabilityBarrier,
}) {
  if (typeof update !== "function") {
    throw new Error("Toolcraft checkpoint bundle update must be a function.");
  }
  const loaded = await readToolcraftCheckpointBundle(rootDir);
  if (loaded.missing) {
    throw new Error("Toolcraft verification checkpoint bundle is missing.");
  }
  if (loaded.error) throw new Error(loaded.error);
  const bundle = update(loaded.bundle);
  if (expectedSourceInventory !== undefined) {
    assertToolcraftVerificationInventoryProvenance({
      inventory: expectedSourceInventory,
      rootDir,
    });
  }
  await writeToolcraftCheckpointBundle({
    assertCommitPrecondition:
      expectedSourceInventory === undefined
        ? undefined
        : async () => {
            const currentInventory =
              await collectToolcraftVerificationInputs(rootDir);
            assertToolcraftVerificationInputsUnchanged({
              baseline: expectedSourceInventory,
              current: currentInventory,
              phase: "immediately before checkpoint commit",
            });
          },
    bundle,
    observeDurabilityBarrier,
    rootDir,
  });
  return bundle;
}
