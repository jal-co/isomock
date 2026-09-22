import path from "node:path";

function getVerificationReceiptPath(rootDir, fileName) {
  return path.join(
    path.resolve(rootDir),
    ".toolcraft",
    "verification",
    fileName,
  );
}

function getToolcraftObsoleteDeliveryReceiptPath(rootDir) {
  return getVerificationReceiptPath(rootDir, "delivery.json");
}

export function getToolcraftCheckpointBundlePath(rootDir) {
  return getVerificationReceiptPath(rootDir, "checkpoint.json");
}

function getToolcraftObsoletePerformanceBaselineReceiptPath(rootDir) {
  return getVerificationReceiptPath(rootDir, "performance-baseline.json");
}

function getToolcraftObsoletePerformanceReceiptPath(rootDir) {
  return getVerificationReceiptPath(rootDir, "performance.json");
}

export function getToolcraftObsoleteCheckpointReceiptPaths(rootDir) {
  return Object.freeze({
    currentPerformance: getToolcraftObsoletePerformanceReceiptPath(rootDir),
    delivery: getToolcraftObsoleteDeliveryReceiptPath(rootDir),
    performanceBaseline:
      getToolcraftObsoletePerformanceBaselineReceiptPath(rootDir),
  });
}
