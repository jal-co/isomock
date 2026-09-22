import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createToolcraftTargetedPerformanceReport,
  createToolcraftTargetedPerformanceComparisonHash,
  createToolcraftTargetedPerformanceEvidenceHash,
  getToolcraftTargetedPerformanceReportError,
  readToolcraftTargetedPerformanceReport,
  writeToolcraftTargetedPerformanceReport,
} from "./toolcraft-targeted-performance-report.mjs";

const sourceHash = "a".repeat(64);
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
const measurements = ["cold", "warm", "sustained"].map((phase) => ({
  evidenceType: "performance-measurement-metrics",
  kind: "interaction",
  metrics,
  pathId: "control-drag:composite",
  phase,
  profile: "interactive-discrete",
  profileCatalogVersion: 1,
  version: 1,
}));
const value = {
  fixtureResolutionMode: "strict-development",
  fixtureSelector: "development",
  nonce: "runner-nonce",
  measurements,
  performancePassIds: ["composite"],
  performancePathIds: ["control-drag:composite"],
  requestAuthorityHash: "b".repeat(64),
  sourceHash,
  testNames: ["browser perf: control-drag composite"],
};

test("normalizes and validates exact targeted evidence", () => {
  assert.deepEqual(createToolcraftTargetedPerformanceReport(value), {
    ...value,
    version: 3,
  });
});

test("keeps evidence and comparison hashes exact and non-interchangeable", () => {
  const report = createToolcraftTargetedPerformanceReport(value);
  const testEvidence = [
    {
      fullTitle: "app-controls.spec.ts › browser perf: control-drag composite",
      leafTitle: "browser perf: control-drag composite",
    },
  ];
  const evidenceHash = createToolcraftTargetedPerformanceEvidenceHash({
    report,
    testEvidence,
  });
  const comparisonHash =
    createToolcraftTargetedPerformanceComparisonHash(report);

  assert.match(evidenceHash, /^[a-f0-9]{64}$/u);
  assert.match(comparisonHash, /^[a-f0-9]{64}$/u);
  assert.notEqual(comparisonHash, evidenceHash);
  assert.equal(
    createToolcraftTargetedPerformanceComparisonHash(
      createToolcraftTargetedPerformanceReport(value),
    ),
    comparisonHash,
  );
  assert.throws(
    () =>
      createToolcraftTargetedPerformanceEvidenceHash({
        report: {
          ...report,
          fixtureResolutionMode: "default",
          requestAuthorityHash: null,
        },
        testEvidence,
      }),
    /malformed/iu,
  );
  assert.throws(
    () =>
      createToolcraftTargetedPerformanceEvidenceHash({
        report: { ...report, fixtureSelector: "maximum" },
        testEvidence,
      }),
    /malformed/iu,
  );
  assert.notEqual(
    createToolcraftTargetedPerformanceEvidenceHash({
      report,
      testEvidence: [
        {
          fullTitle: "other.spec.ts › browser perf: control-drag composite",
          leafTitle: "browser perf: control-drag composite",
        },
      ],
    }),
    evidenceHash,
  );
  assert.throws(
    () =>
      createToolcraftTargetedPerformanceEvidenceHash({
        report,
        testTitles: report.testNames,
      }),
    /test evidence|malformed/iu,
  );
  assert.throws(
    () =>
      createToolcraftTargetedPerformanceEvidenceHash({
        report,
        testEvidence,
        testTitles: report.testNames,
      }),
    /test evidence|malformed/iu,
  );
});

test("rejects malformed or mismatched targeted evidence", async () => {
  assert.throws(
    () =>
      createToolcraftTargetedPerformanceReport({
        ...value,
        performancePathIds: [],
      }),
    /malformed/iu,
  );

  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-targeted-report-"),
  );
  const reportPath = path.join(rootDir, "report.json");
  await writeToolcraftTargetedPerformanceReport(reportPath, value);
  await assert.rejects(
    readToolcraftTargetedPerformanceReport(reportPath, {
      fixtureResolutionMode: "default",
    }),
    /fixtureResolutionMode does not match/iu,
  );
  await fs.writeFile(
    reportPath,
    JSON.stringify({
      ...createToolcraftTargetedPerformanceReport(value),
      fixtureResolutionMode: "default",
      requestAuthorityHash: null,
    }),
  );
  await assert.rejects(
    readToolcraftTargetedPerformanceReport(reportPath),
    /malformed/iu,
  );
  await fs.rm(rootDir, { force: true, recursive: true });
});

test("rejects obsolete version 1 and 2 reports", () => {
  const versionOne = {
    nonce: value.nonce,
    performancePassIds: value.performancePassIds,
    performancePathIds: value.performancePathIds,
    sourceHash: value.sourceHash,
    testNames: value.testNames,
    version: 1,
  };

  assert.match(
    getToolcraftTargetedPerformanceReportError(versionOne),
    /malformed|unsupported/iu,
  );
  const versionTwo = {
    fixtureResolutionMode: value.fixtureResolutionMode,
    fixtureSelector: value.fixtureSelector,
    ...versionOne,
    version: 2,
  };
  assert.match(
    getToolcraftTargetedPerformanceReportError(versionTwo),
    /malformed|unsupported/iu,
  );
});

test("requires strict development mode and request authority for every report", () => {
  assert.match(
    getToolcraftTargetedPerformanceReportError({
      ...createToolcraftTargetedPerformanceReport(value),
      measurements: [],
    }),
    /malformed/iu,
  );
  assert.match(
    getToolcraftTargetedPerformanceReportError({
      ...createToolcraftTargetedPerformanceReport(value),
      requestAuthorityHash: null,
    }),
    /malformed/iu,
  );
  assert.match(
    getToolcraftTargetedPerformanceReportError({
      ...createToolcraftTargetedPerformanceReport(value),
      fixtureResolutionMode: "default",
    }),
    /malformed/iu,
  );
  assert.throws(
    () =>
      createToolcraftTargetedPerformanceReport({
        ...value,
        requestAuthorityHash: null,
      }),
    /malformed/iu,
  );
});
