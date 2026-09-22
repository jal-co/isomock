import { TOOLCRAFT_PERFORMANCE_PROFILE_MANIFEST } from "../src/toolcraft/runtime/performance/profile-catalog-manifest.mjs";

import { getToolcraftVerificationInventoryError } from "./toolcraft-verification-inventory.mjs";
export const TOOLCRAFT_PERFORMANCE_RECEIPT_VERSION = 5;

const acceptedRunners = new Set(["protected-playwright"]);
const currentCheckpointKeys = Object.freeze([
  "completedAt",
  "files",
  "kind",
  "performanceEvidence",
  "runner",
  "sourceHash",
  "status",
  "version",
]);

export function createToolcraftPerformanceCheckpointReceipt({
  evidence,
  inventory,
}) {
  const receipt = cloneAndDeepFreeze({
    completedAt: new Date().toISOString(),
    files: inventory.entries,
    kind: "performance-checkpoint",
    performanceEvidence: evidence,
    runner: "protected-playwright",
    sourceHash: inventory.sourceHash,
    status: "passed",
    version: TOOLCRAFT_PERFORMANCE_RECEIPT_VERSION,
  });
  const error = getToolcraftPerformanceReceiptShapeError(receipt);
  if (error) throw new Error(error);
  return receipt;
}

function cloneAndDeepFreeze(value) {
  if (typeof value !== "object" || value === null) return value;
  const clone = Array.isArray(value)
    ? value.map(cloneAndDeepFreeze)
    : Object.fromEntries(Object.entries(value).map(
        ([key, entry]) => [key, cloneAndDeepFreeze(entry)],
      ));
  return Object.freeze(clone);
}

function getReceiptInventoryError(receipt) {
  return getToolcraftVerificationInventoryError({
    entries: receipt.files,
    label: "Toolcraft performance receipt file inventory",
    sourceHash: receipt.sourceHash,
  });
}

function hasExactKeys(value, expectedKeys) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function getPerformanceEvidenceError(evidence) {
  if (
    typeof evidence !== "object" ||
    evidence === null ||
    Array.isArray(evidence) ||
    !/^[a-f0-9]{64}$/u.test(evidence.reportHash ?? "") ||
    !/^[a-f0-9]{64}$/u.test(evidence.matrixHash ?? "") ||
    evidence.profileCatalogVersion !==
      TOOLCRAFT_PERFORMANCE_PROFILE_MANIFEST.version ||
    typeof evidence.environment !== "object" ||
    evidence.environment === null ||
    !Array.isArray(evidence.measurements) ||
    evidence.measurements.length === 0 ||
    !Array.isArray(evidence.pipelineSummaries)
  ) {
    return "Toolcraft performance checkpoint evidence is malformed.";
  }
  return undefined;
}

function getCheckpointReceiptError(receipt, expectedKeys, checkpointReason) {
  if (
    !hasExactKeys(receipt, expectedKeys) ||
    typeof receipt.completedAt !== "string" ||
    !/^[a-f0-9]{64}$/u.test(receipt.sourceHash ?? "") ||
    !Array.isArray(receipt.files)
  ) {
    return "Toolcraft performance receipt is malformed or uses an unsupported version.";
  }
  if (
    receipt.kind !== "performance-checkpoint" ||
    receipt.status !== "passed" ||
    !acceptedRunners.has(receipt.runner) ||
    (checkpointReason !== undefined &&
      receipt.checkpointReason !== checkpointReason)
  ) {
    return "Toolcraft performance checkpoint receipt must be passed and name a supported runner.";
  }
  return (
    getPerformanceEvidenceError(receipt.performanceEvidence) ??
    getReceiptInventoryError(receipt)
  );
}

function getCurrentV5CheckpointError(receipt) {
  return getCheckpointReceiptError(receipt, currentCheckpointKeys);
}

export function getToolcraftPerformanceReceiptShapeError(receipt) {
  if (
    typeof receipt !== "object" ||
    receipt === null ||
    Array.isArray(receipt)
  ) {
    return "Toolcraft performance receipt is malformed or uses an unsupported version.";
  }
  if (receipt.version === TOOLCRAFT_PERFORMANCE_RECEIPT_VERSION) {
    return getCurrentV5CheckpointError(receipt);
  }
  return "Toolcraft performance receipt is malformed or uses an unsupported version.";
}
