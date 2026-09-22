#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { TOOLCRAFT_PERFORMANCE_PROFILE_MANIFEST } from "../src/toolcraft/runtime/performance/profile-catalog-manifest.mjs";

export const TOOLCRAFT_PERFORMANCE_REPORT_VERSION = 1;
export const TOOLCRAFT_PERFORMANCE_PROFILE_CATALOG_VERSION =
  TOOLCRAFT_PERFORMANCE_PROFILE_MANIFEST.version;

const phases = ["cold", "warm", "sustained"];
const phaseSet = new Set(phases);
const profileSet = new Set(TOOLCRAFT_PERFORMANCE_PROFILE_MANIFEST.names);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function createToolcraftPerformanceReportHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export function getToolcraftPerformanceReportPath(rootDir) {
  return path.join(
    path.resolve(rootDir),
    ".toolcraft",
    "verification",
    "performance-report.json",
  );
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHash(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function assertFiniteNonNegative(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Toolcraft performance report ${field} is invalid.`);
  }
}

function assertEnvironment(environment) {
  if (
    !isObject(environment) ||
    environment.evidenceType !== "performance-environment" ||
    environment.version !== 1 ||
    !isObject(environment.browser) ||
    typeof environment.browser.name !== "string" ||
    !environment.browser.name ||
    typeof environment.browser.version !== "string" ||
    !environment.browser.version ||
    !isObject(environment.viewport) ||
    !Number.isSafeInteger(environment.viewport.width) ||
    environment.viewport.width <= 0 ||
    !Number.isSafeInteger(environment.viewport.height) ||
    environment.viewport.height <= 0 ||
    !Number.isSafeInteger(environment.hardwareConcurrency) ||
    environment.hardwareConcurrency <= 0 ||
    !isObject(environment.cpuThrottling) ||
    !["cdp", "none"].includes(environment.cpuThrottling.mode) ||
    typeof environment.cpuThrottling.rate !== "number" ||
    environment.cpuThrottling.rate < 1 ||
    !isObject(environment.calibration) ||
    !Number.isSafeInteger(environment.calibration.iterations) ||
    environment.calibration.iterations <= 0
  ) {
    throw new Error("Toolcraft performance report environment is malformed.");
  }
  assertFiniteNonNegative(
    environment.calibration.durationMs,
    "environment calibration duration",
  );
}

function assertMeasurement(measurement, pathsById) {
  if (
    !isObject(measurement) ||
    measurement.evidenceType !== "performance-measurement-metrics" ||
    measurement.version !== 1 ||
    measurement.profileCatalogVersion !==
      TOOLCRAFT_PERFORMANCE_PROFILE_CATALOG_VERSION ||
    !phaseSet.has(measurement.phase) ||
    !profileSet.has(measurement.profile) ||
    !["animation-frames", "interaction"].includes(measurement.kind) ||
    !isObject(measurement.metrics)
  ) {
    throw new Error("Toolcraft performance report contains malformed measurement evidence.");
  }
  const pathEntry = pathsById.get(measurement.pathId);
  if (!pathEntry || pathEntry.profile !== measurement.profile) {
    throw new Error(
      `Toolcraft performance report measurement path "${measurement.pathId}" is not canonical.`,
    );
  }
  for (const key of [
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
  ]) {
    assertFiniteNonNegative(measurement.metrics[key], `measurement ${key}`);
  }
  if (
    !Number.isSafeInteger(measurement.metrics.sampleCount) ||
    measurement.metrics.sampleCount <= 0 ||
    !Number.isSafeInteger(measurement.metrics.droppedFrameCount) ||
    !Number.isSafeInteger(measurement.metrics.longTaskCount) ||
    measurement.metrics.droppedFrameRatio > 1
  ) {
    throw new Error("Toolcraft performance report measurement counters are invalid.");
  }
}

function validateReportShape(report, options) {
  if (
    !isObject(report) ||
    report.version !== TOOLCRAFT_PERFORMANCE_REPORT_VERSION ||
    report.status !== "passed" ||
    report.nonce !== options.nonce ||
    report.sourceHash !== options.sourceHash ||
    report.profileCatalogVersion !==
      TOOLCRAFT_PERFORMANCE_PROFILE_CATALOG_VERSION ||
    !Array.isArray(report.paths) ||
    report.paths.length === 0 ||
    !Array.isArray(report.measurements) ||
    !Array.isArray(report.pipelineSummaries) ||
    !isHash(report.matrixHash)
  ) {
    throw new Error(
      "Toolcraft performance report is missing, stale, failed, or malformed.",
    );
  }
  const generatedAtMs = Date.parse(report.generatedAt);
  if (!Number.isFinite(generatedAtMs) || generatedAtMs < options.notBeforeMs) {
    throw new Error("Toolcraft performance report predates the protected checkpoint.");
  }
  const expectedMatrixHash = createToolcraftPerformanceReportHash(report.paths);
  if (report.matrixHash !== expectedMatrixHash) {
    throw new Error("Toolcraft performance report path-matrix hash is invalid.");
  }

  const pathsById = new Map();
  for (const entry of report.paths) {
    if (
      !isObject(entry) ||
      typeof entry.id !== "string" ||
      !entry.id ||
      !profileSet.has(entry.profile) ||
      pathsById.has(entry.id)
    ) {
      throw new Error("Toolcraft performance report path matrix is malformed.");
    }
    pathsById.set(entry.id, entry);
  }
  const measurementKeys = new Set();
  for (const measurement of report.measurements) {
    assertMeasurement(measurement, pathsById);
    const key = `${measurement.pathId}\u0000${measurement.phase}`;
    if (measurementKeys.has(key)) {
      throw new Error("Toolcraft performance report contains duplicate measurements.");
    }
    measurementKeys.add(key);
  }
  for (const pathId of pathsById.keys()) {
    for (const phase of phases) {
      if (!measurementKeys.has(`${pathId}\u0000${phase}`)) {
        throw new Error(
          `Toolcraft performance report is incomplete for path "${pathId}" phase "${phase}".`,
        );
      }
    }
  }
  if (measurementKeys.size !== pathsById.size * phases.length) {
    throw new Error("Toolcraft performance report contains extra measurements.");
  }
  for (const summary of report.pipelineSummaries) {
    if (
      !isObject(summary) ||
      !pathsById.has(summary.pathId) ||
      !phaseSet.has(summary.phase) ||
      !Array.isArray(summary.passes)
    ) {
      throw new Error("Toolcraft performance report pipeline summary is malformed.");
    }
  }
  assertEnvironment(report.environment);
}

export async function readAndValidateToolcraftPerformanceReport({
  nonce,
  notBeforeMs,
  reportPath,
  sourceHash,
}) {
  let source;
  try {
    source = await fs.readFile(reportPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("Toolcraft protected performance report is missing.");
    }
    throw error;
  }
  let report;
  try {
    report = JSON.parse(source);
  } catch {
    throw new Error("Toolcraft protected performance report is malformed JSON.");
  }
  validateReportShape(report, { nonce, notBeforeMs, sourceHash });
  const reportHash = createToolcraftPerformanceReportHash(report);
  return {
    evidence: Object.freeze({
      environment: report.environment,
      matrixHash: report.matrixHash,
      measurements: Object.freeze([...report.measurements]),
      pipelineSummaries: Object.freeze([...report.pipelineSummaries]),
      profileCatalogVersion: report.profileCatalogVersion,
      reportHash,
    }),
    report: Object.freeze(report),
    reportHash,
  };
}
