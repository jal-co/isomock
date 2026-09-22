import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolcraftPerformanceIterationComparison,
  getToolcraftPerformanceIterationComparisonError,
} from "./toolcraft-performance-iteration-comparison.mjs";
import {
  createToolcraftTargetedPerformanceReport,
  createToolcraftTargetedPerformanceComparisonHash,
  createToolcraftTargetedPerformanceEvidenceHash,
} from "./toolcraft-targeted-performance-report.mjs";

const metrics = {
  droppedFrameCount: 0,
  droppedFrameRatio: 0,
  durationMs: 10,
  frameGapP50Ms: 10,
  frameGapP95Ms: 16,
  frameGapP99Ms: 16,
  longTaskCount: 0,
  longTaskMaxMs: 0,
  maxFrameGapMs: 16,
  sampleCount: 3,
};
const report = createToolcraftTargetedPerformanceReport({
  fixtureResolutionMode: "strict-development",
  fixtureSelector: "development",
  measurements: [
    {
      evidenceType: "performance-measurement-metrics",
      kind: "interaction",
      metrics,
      pathId: "control-drag:composite",
      phase: "cold",
      profile: "interactive-discrete",
      profileCatalogVersion: 1,
      version: 1,
    },
    {
      evidenceType: "performance-measurement-metrics",
      kind: "interaction",
      metrics,
      pathId: "control-drag:composite",
      phase: "warm",
      profile: "interactive-discrete",
      profileCatalogVersion: 1,
      version: 1,
    },
    {
      evidenceType: "performance-measurement-metrics",
      kind: "interaction",
      metrics,
      pathId: "control-drag:composite",
      phase: "sustained",
      profile: "interactive-discrete",
      profileCatalogVersion: 1,
      version: 1,
    },
  ],
  nonce: "comparison-report",
  performancePassIds: ["composite"],
  performancePathIds: ["control-drag:composite"],
  requestAuthorityHash: "b".repeat(64),
  sourceHash: "a".repeat(64),
  testNames: ["browser perf: focused workload"],
});
const comparisonHash =
  createToolcraftTargetedPerformanceComparisonHash(report);

test("records numeric deltas for compatible repeated iterations", () => {
  const comparison = createToolcraftPerformanceIterationComparison({
    comparisonHash,
    currentReport: {
      ...report,
      measurements: report.measurements.map((measurement, index) =>
        index === 0
          ? {
              ...measurement,
              metrics: { ...measurement.metrics, durationMs: 8 },
            }
          : measurement
      ),
    },
    previousReport: report,
  });

  assert.equal(comparison.status, "compared");
  assert.equal(comparison.measurements[0].metrics.durationMs, -2);
  assert.equal(
    getToolcraftPerformanceIterationComparisonError(comparison, report),
    undefined,
  );
});

test("does not accept an evidence hash as a comparison hash", () => {
  const evidenceHash = createToolcraftTargetedPerformanceEvidenceHash({
    report,
    testEvidence: [{
      fullTitle: "app-controls.spec.ts › browser perf: focused workload",
      leafTitle: "browser perf: focused workload",
    }],
  });

  assert.deepEqual(
    createToolcraftPerformanceIterationComparison({
      comparisonHash: evidenceHash,
      currentReport: report,
      previousReport: report,
    }),
    {
      reason: "previous-delivery-has-no-compatible-targeted-measurements",
      status: "not-comparable",
    },
  );
});

test("records an explicit non-comparable result without inventing progress", () => {
  const comparison = createToolcraftPerformanceIterationComparison({
    comparisonHash: null,
    currentReport: report,
    previousReport: null,
  });

  assert.deepEqual(comparison, {
    reason: "previous-delivery-has-no-compatible-targeted-measurements",
    status: "not-comparable",
  });
  assert.equal(
    getToolcraftPerformanceIterationComparisonError(comparison, report),
    undefined,
  );
});
