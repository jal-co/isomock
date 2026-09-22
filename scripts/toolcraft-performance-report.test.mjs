import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { TOOLCRAFT_PERFORMANCE_PROFILE_MANIFEST } from "../src/toolcraft/runtime/performance/profile-catalog-manifest.mjs";

import {
  createToolcraftPerformanceReportHash,
  getToolcraftPerformanceReportPath,
  readAndValidateToolcraftPerformanceReport,
} from "./toolcraft-performance-report.mjs";

function createReport({ nonce = "nonce", sourceHash = "a".repeat(64) } = {}) {
  const paths = [
    { id: "initial", interaction: "initial-render", profile: "initial-render" },
  ];
  const metrics = {
    droppedFrameCount: 0,
    droppedFrameRatio: 0,
    durationMs: 20,
    frameGapP50Ms: 16,
    frameGapP95Ms: 18,
    frameGapP99Ms: 20,
    longTaskCount: 0,
    longTaskMaxMs: 0,
    maxFrameGapMs: 20,
    sampleCount: 4,
  };
  return {
    environment: {
      browser: { name: "chromium", version: "test" },
      calibration: { durationMs: 1, iterations: 10 },
      cpuThrottling: { mode: "none", rate: 1 },
      evidenceType: "performance-environment",
      hardwareConcurrency: 4,
      version: 1,
      viewport: { height: 720, width: 1280 },
    },
    generatedAt: new Date().toISOString(),
    matrixHash: createToolcraftPerformanceReportHash(paths),
    measurements: ["cold", "warm", "sustained"].map((phase) => ({
      evidenceType: "performance-measurement-metrics",
      kind: "interaction",
      metrics,
      pathId: "initial",
      phase,
      profile: "initial-render",
      profileCatalogVersion: TOOLCRAFT_PERFORMANCE_PROFILE_MANIFEST.version,
      version: 1,
    })),
    nonce,
    paths,
    pipelineSummaries: [],
    profileCatalogVersion: TOOLCRAFT_PERFORMANCE_PROFILE_MANIFEST.version,
    sourceHash,
    status: "passed",
    version: 1,
  };
}

async function writeReport(report) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "toolcraft-report-"));
  const reportPath = getToolcraftPerformanceReportPath(rootDir);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report));
  return { reportPath, rootDir };
}

test("protected report validates nonce, source, matrix, environment, and all phases", async () => {
  const report = createReport();
  const { reportPath } = await writeReport(report);
  const result = await readAndValidateToolcraftPerformanceReport({
    nonce: "nonce",
    notBeforeMs: Date.now() - 1_000,
    reportPath,
    sourceHash: "a".repeat(64),
  });

  assert.equal(result.reportHash, createToolcraftPerformanceReportHash(report));
  assert.equal(result.evidence.measurements.length, 3);
  assert.equal(
    result.evidence.profileCatalogVersion,
    TOOLCRAFT_PERFORMANCE_PROFILE_MANIFEST.version,
  );
});

test("protected report rejects wrong nonce and stale generation", async () => {
  const report = createReport();
  const { reportPath } = await writeReport(report);
  await assert.rejects(
    readAndValidateToolcraftPerformanceReport({
      nonce: "wrong",
      notBeforeMs: Date.now() - 1_000,
      reportPath,
      sourceHash: "a".repeat(64),
    }),
    /missing, stale, failed, or malformed/u,
  );
  await assert.rejects(
    readAndValidateToolcraftPerformanceReport({
      nonce: "nonce",
      notBeforeMs: Date.now() + 1_000,
      reportPath,
      sourceHash: "a".repeat(64),
    }),
    /predates/u,
  );
});

test("protected report rejects matrix tampering and incomplete measurements", async () => {
  const tamperedMatrix = createReport();
  tamperedMatrix.paths[0].id = "changed";
  const first = await writeReport(tamperedMatrix);
  await assert.rejects(
    readAndValidateToolcraftPerformanceReport({
      nonce: "nonce",
      notBeforeMs: Date.now() - 1_000,
      reportPath: first.reportPath,
      sourceHash: "a".repeat(64),
    }),
    /matrix hash/u,
  );

  const incomplete = createReport();
  incomplete.measurements.pop();
  const second = await writeReport(incomplete);
  await assert.rejects(
    readAndValidateToolcraftPerformanceReport({
      nonce: "nonce",
      notBeforeMs: Date.now() - 1_000,
      reportPath: second.reportPath,
      sourceHash: "a".repeat(64),
    }),
    /incomplete/u,
  );
});
