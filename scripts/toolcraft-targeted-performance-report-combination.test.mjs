import assert from "node:assert/strict";
import test from "node:test";

import {
  combineToolcraftTargetedPerformanceReports,
} from "./toolcraft-targeted-performance-report-combination.mjs";
import {
  createToolcraftTargetedPerformanceReport,
} from "./toolcraft-targeted-performance-report.mjs";

const sourceHash = "a".repeat(64);
const requestAuthorityHash = "b".repeat(64);
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

function report(pathId, testName, performancePassIds = ["composite"]) {
  return createToolcraftTargetedPerformanceReport({
    fixtureResolutionMode: "strict-development",
    fixtureSelector: "development",
    measurements: ["cold", "warm", "sustained"].map((phase) => ({
      evidenceType: "performance-measurement-metrics",
      kind: "interaction",
      metrics,
      pathId,
      phase,
      profile: "interactive-discrete",
      profileCatalogVersion: 1,
      version: 1,
    })),
    nonce: `nonce-${pathId}`,
    performancePassIds,
    performancePathIds: [pathId],
    requestAuthorityHash,
    sourceHash,
    testNames: [testName],
  });
}

test("combines validated single-path reports in canonical planned order", () => {
  const first = report(
    "control-drag:composite",
    "browser perf: control-drag composite",
  );
  const second = report(
    "control-drag:overlay",
    "browser perf: control-drag overlay",
    ["overlay"],
  );
  const combined = combineToolcraftTargetedPerformanceReports({
    nonce: "combined-nonce",
    performancePassIds: ["composite", "overlay"],
    reports: [first, second],
    requestAuthorityHash,
    sourceHash,
  });

  assert.deepEqual(combined.performancePathIds, [
    "control-drag:composite",
    "control-drag:overlay",
  ]);
  assert.deepEqual(combined.testNames, [
    "browser perf: control-drag composite",
    "browser perf: control-drag overlay",
  ]);
  assert.equal(combined.measurements.length, 6);
  assert.deepEqual(combined.performancePassIds, ["composite", "overlay"]);
  assert.throws(
    () =>
      combineToolcraftTargetedPerformanceReports({
        nonce: "combined-nonce",
        performancePassIds: ["composite", "overlay"],
        reports: [second, first],
        requestAuthorityHash,
        sourceHash,
      }),
    /canonical planned order/iu,
  );
});

test("combines passless and pass-bearing single-path reports into the exact union", () => {
  const first = report(
    "control-change:passless",
    "browser perf: control-change passless",
    [],
  );
  const second = report(
    "control-drag:composite",
    "browser perf: control-drag composite",
  );
  const combined = combineToolcraftTargetedPerformanceReports({
    nonce: "combined-nonce",
    performancePassIds: ["composite"],
    reports: [first, second],
    requestAuthorityHash,
    sourceHash,
  });

  assert.deepEqual(combined.performancePassIds, ["composite"]);
  assert.deepEqual(combined.performancePathIds, [
    "control-change:passless",
    "control-drag:composite",
  ]);
});

test("rejects inconsistent single-path report inputs", () => {
  const first = report(
    "control-drag:composite",
    "browser perf: control-drag composite",
  );
  assert.throws(
    () =>
      combineToolcraftTargetedPerformanceReports({
        nonce: "combined-nonce",
        performancePassIds: ["overlay"],
        reports: [first],
        requestAuthorityHash,
        sourceHash,
      }),
    /malformed or inconsistent/iu,
  );
});
