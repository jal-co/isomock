import {
  createToolcraftTargetedPerformanceComparisonHash,
} from "./toolcraft-targeted-performance-report.mjs";

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

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reportIsComparable(current, previous) {
  return (
    current?.version === 3 &&
    previous?.version === 3 &&
    current.fixtureResolutionMode === previous.fixtureResolutionMode &&
    current.fixtureSelector === previous.fixtureSelector &&
    JSON.stringify(current.performancePathIds) ===
      JSON.stringify(previous.performancePathIds) &&
    current.measurements.length === previous.measurements.length &&
    current.measurements.every(
      (measurement, index) =>
        measurement.pathId === previous.measurements[index]?.pathId &&
        measurement.phase === previous.measurements[index]?.phase &&
        measurement.profile === previous.measurements[index]?.profile,
    )
  );
}

export function createToolcraftPerformanceIterationComparison({
  currentReport,
  comparisonHash,
  previousReport,
}) {
  let expectedPreviousHash;
  try {
    expectedPreviousHash =
      createToolcraftTargetedPerformanceComparisonHash(previousReport);
  } catch {
    expectedPreviousHash = null;
  }
  if (
    !reportIsComparable(currentReport, previousReport) ||
    comparisonHash !== expectedPreviousHash
  ) {
    return Object.freeze({
      reason: "previous-delivery-has-no-compatible-targeted-measurements",
      status: "not-comparable",
    });
  }
  return Object.freeze({
    measurements: Object.freeze(
      currentReport.measurements.map((measurement, index) =>
        Object.freeze({
          metrics: Object.freeze(
            Object.fromEntries(
              metricKeys.map((key) => [
                key,
                measurement.metrics[key] -
                  previousReport.measurements[index].metrics[key],
              ]),
            ),
          ),
          pathId: measurement.pathId,
          phase: measurement.phase,
        }),
      ),
    ),
    comparisonHash,
    status: "compared",
  });
}

export function getToolcraftPerformanceIterationComparisonError(
  comparison,
  currentReport,
) {
  if (
    isRecord(comparison) &&
    comparison.status === "not-comparable" &&
    comparison.reason ===
      "previous-delivery-has-no-compatible-targeted-measurements" &&
    Object.keys(comparison).length === 2
  ) {
    return undefined;
  }
  if (
    !isRecord(comparison) ||
    comparison.status !== "compared" ||
    !/^[a-f0-9]{64}$/u.test(comparison.comparisonHash ?? "") ||
    !Array.isArray(comparison.measurements) ||
    comparison.measurements.length !== currentReport?.measurements?.length ||
    Object.keys(comparison).length !== 3
  ) {
    return "Toolcraft performance iteration comparison is malformed.";
  }
  for (const [index, measurement] of comparison.measurements.entries()) {
    const current = currentReport.measurements[index];
    if (
      !isRecord(measurement) ||
      Object.keys(measurement).length !== 3 ||
      measurement.pathId !== current.pathId ||
      measurement.phase !== current.phase ||
      !isRecord(measurement.metrics) ||
      Object.keys(measurement.metrics).length !== metricKeys.length ||
      !metricKeys.every(
        (key) =>
          Object.hasOwn(measurement.metrics, key) &&
          typeof measurement.metrics[key] === "number" &&
          Number.isFinite(measurement.metrics[key]),
      )
    ) {
      return "Toolcraft performance iteration comparison is malformed.";
    }
  }
  return undefined;
}
