import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

export const TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_VERSION = 3;
const currentReportKeys = Object.freeze([
  "fixtureResolutionMode",
  "fixtureSelector",
  "nonce",
  "performancePassIds",
  "performancePathIds",
  "sourceHash",
  "testNames",
  "version",
  "measurements",
  "requestAuthorityHash",
]);
const measurementKeys = Object.freeze([
  "evidenceType",
  "kind",
  "metrics",
  "pathId",
  "phase",
  "profile",
  "profileCatalogVersion",
  "version",
]);
const metricKeys = Object.freeze([
  "droppedFrameCount",
  "droppedFrameRatio",
  "durationMs",
  "frameGapP50Ms",
  "frameGapP95Ms",
  "frameGapP99Ms",
  "longTaskCount",
  "longTaskMaxMs",
  "maxFrameGapMs",
  "sampleCount",
]);
const integerMetricKeys = new Set([
  "droppedFrameCount",
  "longTaskCount",
  "sampleCount",
]);
const performancePhases = Object.freeze(["cold", "warm", "sustained"]);

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  return (
    Object.keys(value).length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key))
  );
}

function isUniqueSortedStringArray(value, { allowEmpty = false } = {}) {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every(
      (item) =>
        typeof item === "string" && item.length > 0 && item.trim() === item,
    ) &&
    new Set(value).size === value.length &&
    value.every(
      (item, index) =>
        index === 0 || compareCodeUnits(value[index - 1], item) < 0,
    )
  );
}

function isCanonicalTestEvidence(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        Object.keys(entry).length === 2 &&
        typeof entry.fullTitle === "string" &&
        entry.fullTitle.length > 0 &&
        entry.fullTitle.trim() === entry.fullTitle &&
        typeof entry.leafTitle === "string" &&
        entry.leafTitle.length > 0 &&
        entry.leafTitle.trim() === entry.leafTitle &&
        (entry.fullTitle === entry.leafTitle ||
          entry.fullTitle.endsWith(` › ${entry.leafTitle}`)),
    ) &&
    new Set(value.map(({ fullTitle }) => fullTitle)).size === value.length &&
    value.every(
      (entry, index) =>
        index === 0 ||
        compareCodeUnits(value[index - 1].fullTitle, entry.fullTitle) < 0,
    )
  );
}

function isPerformanceMeasurement(value, pathIds) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, measurementKeys) ||
    value.evidenceType !== "performance-measurement-metrics" ||
    !["animation-frames", "interaction"].includes(value.kind) ||
    typeof value.pathId !== "string" ||
    !pathIds.has(value.pathId) ||
    !performancePhases.includes(value.phase) ||
    typeof value.profile !== "string" ||
    value.profile.length === 0 ||
    !Number.isSafeInteger(value.profileCatalogVersion) ||
    value.profileCatalogVersion < 1 ||
    value.version !== 1 ||
    !isRecord(value.metrics) ||
    !hasExactKeys(value.metrics, metricKeys)
  ) {
    return false;
  }
  for (const key of metricKeys) {
    const metric = value.metrics[key];
    if (
      typeof metric !== "number" ||
      !Number.isFinite(metric) ||
      metric < 0 ||
      (integerMetricKeys.has(key) && !Number.isSafeInteger(metric))
    ) {
      return false;
    }
  }
  return (
    value.metrics.droppedFrameRatio <= 1 &&
    value.metrics.droppedFrameCount <= value.metrics.sampleCount
  );
}

function isCanonicalMeasurementArray(value, pathIds) {
  if (!Array.isArray(value) || value.length === 0) return false;
  const expectedKeys = [...pathIds].flatMap((pathId) =>
    performancePhases.map((phase) => `${pathId}\u0000${phase}`),
  );
  const actualKeys = value.map((observation) =>
    isRecord(observation)
      ? `${String(observation.pathId)}\u0000${String(observation.phase)}`
      : "",
  );
  return (
    value.every((observation) =>
      isPerformanceMeasurement(observation, pathIds),
    ) &&
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  );
}

export function getToolcraftTargetedPerformanceReportError(
  report,
  expected = {},
) {
  if (
    !isRecord(report) ||
    report.version !== TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_VERSION ||
    !hasExactKeys(report, currentReportKeys) ||
    typeof report.nonce !== "string" ||
    report.nonce.length === 0 ||
    !/^[a-f0-9]{64}$/u.test(report.sourceHash ?? "") ||
    !isUniqueSortedStringArray(report.performancePassIds, { allowEmpty: true }) ||
    !isUniqueSortedStringArray(report.performancePathIds) ||
    !isUniqueSortedStringArray(report.testNames)
  ) {
    return "Toolcraft targeted performance report is malformed.";
  }
  if (
    report.fixtureSelector !== "development" ||
    report.fixtureResolutionMode !== "strict-development"
  ) {
    return "Toolcraft targeted performance report is malformed.";
  }
  if (
    !isCanonicalMeasurementArray(
      report.measurements,
      new Set(report.performancePathIds),
    ) ||
      !/^[a-f0-9]{64}$/u.test(report.requestAuthorityHash ?? "")
  ) {
    return "Toolcraft targeted performance report is malformed.";
  }
  for (const [field, actual] of [
    ["version", report.version],
    ["fixtureResolutionMode", report.fixtureResolutionMode],
    ["fixtureSelector", report.fixtureSelector],
    ["nonce", report.nonce],
    ["requestAuthorityHash", report.requestAuthorityHash],
    ["sourceHash", report.sourceHash],
  ]) {
    if (expected[field] !== undefined && expected[field] !== actual) {
      return `Toolcraft targeted performance report ${field} does not match the protected runner.`;
    }
  }
  for (const field of [
    "performancePassIds",
    "performancePathIds",
    "testNames",
  ]) {
    if (
      expected[field] !== undefined &&
      JSON.stringify(expected[field]) !== JSON.stringify(report[field])
    ) {
      return `Toolcraft targeted performance report ${field} does not match the protected runner.`;
    }
  }
  return undefined;
}

export function createToolcraftTargetedPerformanceReport(value) {
  const report = Object.freeze({
    fixtureResolutionMode: value.fixtureResolutionMode,
    fixtureSelector: value.fixtureSelector,
    nonce: value.nonce,
    performancePassIds: Object.freeze(
      [...value.performancePassIds].sort(compareCodeUnits),
    ),
    performancePathIds: Object.freeze(
      [...value.performancePathIds].sort(compareCodeUnits),
    ),
    measurements: Object.freeze(
      value.measurements.map((observation) =>
        Object.freeze({
          ...observation,
          metrics: Object.freeze({ ...observation.metrics }),
        }),
      ),
    ),
    requestAuthorityHash: value.requestAuthorityHash,
    sourceHash: value.sourceHash,
    testNames: Object.freeze([...value.testNames].sort(compareCodeUnits)),
    version: TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_VERSION,
  });
  const error = getToolcraftTargetedPerformanceReportError(report);
  if (error) throw new Error(error);
  return report;
}

function createCanonicalTargetedPerformanceHash(report, createPayload) {
  const reportError = getToolcraftTargetedPerformanceReportError(report);
  if (reportError) throw new Error(reportError);
  const canonicalReport = Object.fromEntries(
    currentReportKeys.map((key) => [key, report[key]]),
  );
  return createHash("sha256")
    .update(JSON.stringify(createPayload(canonicalReport)))
    .digest("hex");
}

export function createToolcraftTargetedPerformanceEvidenceHash(options) {
  if (!isRecord(options) || !hasExactKeys(options, ["report", "testEvidence"])) {
    throw new Error(
      "Toolcraft targeted performance report resolved test evidence is malformed.",
    );
  }
  const { report, testEvidence } = options;
  if (!isCanonicalTestEvidence(testEvidence)) {
    throw new Error(
      "Toolcraft targeted performance report resolved test evidence is malformed.",
    );
  }
  return createCanonicalTargetedPerformanceHash(
    report,
    (canonicalReport) => ({ report: canonicalReport, testEvidence }),
  );
}

export function createToolcraftTargetedPerformanceComparisonHash(report) {
  return createCanonicalTargetedPerformanceHash(
    report,
    (canonicalReport) => canonicalReport,
  );
}

export async function writeToolcraftTargetedPerformanceReport(filePath, value) {
  const report = createToolcraftTargetedPerformanceReport(value);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.rename(temporaryPath, filePath);
  return report;
}

export function writeToolcraftTargetedPerformanceReportSync(filePath, value) {
  const report = createToolcraftTargetedPerformanceReport(value);
  fsSync.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fsSync.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`);
  fsSync.renameSync(temporaryPath, filePath);
  return report;
}

export async function readToolcraftTargetedPerformanceReport(
  filePath,
  expected,
) {
  let report;
  try {
    report = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("Toolcraft targeted performance report is missing.");
    }
    throw new Error("Toolcraft targeted performance report is malformed JSON.");
  }
  const validationError = getToolcraftTargetedPerformanceReportError(
    report,
    expected,
  );
  if (validationError) throw new Error(validationError);
  return report;
}
