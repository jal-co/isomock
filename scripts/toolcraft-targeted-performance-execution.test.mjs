import assert from "node:assert/strict";
import test from "node:test";

import {
  executeToolcraftTargetedPerformanceVerificationCore,
} from "./toolcraft-targeted-performance-execution.mjs";
import {
  createToolcraftTargetedPerformanceReport,
} from "./toolcraft-targeted-performance-report.mjs";

const hash = (character) => character.repeat(64);
const performancePathId = (invalidates) =>
  `performance-path:${encodeURIComponent(
    JSON.stringify([
      "interactive-discrete",
      "control-change",
      invalidates,
      [],
      [],
      ["main"],
      ["control-count"],
    ]),
  )}`;

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test("runs planned performance paths serially with exact per-path pass ids", async () => {
  const sourceHash = hash("a");
  const requestAuthorityHash = hash("b");
  const pathIds = [
    performancePathId([]),
    performancePathId(["composite"]),
  ].sort();
  const testNames = pathIds.map(
    (pathId) => `browser perf: toolcraft path ${pathId}`,
  );
  const selections = testNames.map((leafTitle) => ({
    fullTitle: `app-performance.spec.ts › ${leafTitle}`,
    grepTitle: `app-performance.spec.ts ${leafTitle}`,
    leafTitle,
  }));
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
  const calls = [];
  let active = 0;
  let maximumActive = 0;
  const operations = freeze({
    createNonce: (() => {
      let index = 0;
      return () => `nonce-${index += 1}`;
    })(),
    readReport: async (_reportPath, expected) =>
      createToolcraftTargetedPerformanceReport({
        fixtureResolutionMode: expected.fixtureResolutionMode,
        fixtureSelector: "development",
        measurements: ["cold", "warm", "sustained"].map((phase) => ({
          evidenceType: "performance-measurement-metrics",
          kind: "interaction",
          metrics,
          pathId: expected.performancePathIds[0],
          phase,
          profile: "interactive-discrete",
          profileCatalogVersion: 1,
          version: 1,
        })),
        nonce: expected.nonce,
        performancePassIds: expected.performancePassIds,
        performancePathIds: expected.performancePathIds,
        requestAuthorityHash,
        sourceHash,
        testNames: expected.testNames,
      }),
    removeReport: async () => {},
    runPlaywright: async ({ pathId, performancePassIds }) => {
      calls.push({ pathId, performancePassIds });
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
    },
  });
  const result = await executeToolcraftTargetedPerformanceVerificationCore({
    fixtureResolutionMode: "strict-development",
    operations,
    performanceComparison: { kind: "none" },
    performancePassIds: ["composite"],
    performancePathIds: pathIds,
    performanceSelections: selections,
    performanceTestNames: testNames,
    playwrightBin: "/workspace/node_modules/.bin/playwright",
    projectDir: "/workspace",
    requestAuthorityHash,
    sourceHash,
  });

  assert.deepEqual(
    calls,
    pathIds.map((pathId) => ({
      pathId,
      performancePassIds: pathId.includes(
        encodeURIComponent(JSON.stringify(["composite"])),
      )
        ? ["composite"]
        : [],
    })),
  );
  assert.equal(maximumActive, 1);
  assert.deepEqual(result.report.performancePathIds, pathIds);
  assert.deepEqual(
    result.report.measurements.map(({ pathId }) => pathId),
    pathIds.flatMap((pathId) => [pathId, pathId, pathId]),
  );
  assert.deepEqual(
    result.testEvidence,
    selections.map(({ fullTitle, leafTitle }) => ({ fullTitle, leafTitle })),
  );
  assert.match(result.evidenceHash, /^[a-f0-9]{64}$/u);
  assert.equal(Object.hasOwn(result, "reportHash"), false);
});

test("rejects a performance path outside the canonical runtime codec", async () => {
  const pathId =
    "performance-path:%5B%22unknown-profile%22%2C%22control-change%22%2C%5B%5D%2C%5B%5D%2C%5B%5D%2C%5B%22main%22%5D%2C%5B%5D%5D";
  const testName = `browser perf: toolcraft path ${pathId}`;
  const operations = freeze({
    createNonce: () => "unused",
    readReport: async () => {},
    removeReport: async () => {},
    runPlaywright: async () => {},
  });

  await assert.rejects(
    executeToolcraftTargetedPerformanceVerificationCore({
      fixtureResolutionMode: "strict-development",
      operations,
      performanceComparison: { kind: "none" },
      performancePassIds: [],
      performancePathIds: [pathId],
      performanceSelections: [{
        fullTitle: `app-performance.spec.ts › ${testName}`,
        grepTitle: `app-performance.spec.ts ${testName}`,
        leafTitle: testName,
      }],
      performanceTestNames: [testName],
      playwrightBin: "/workspace/node_modules/.bin/playwright",
      projectDir: "/workspace",
      requestAuthorityHash: hash("b"),
      sourceHash: hash("a"),
    }),
    /planned targeted performance execution input is malformed/iu,
  );
});

test("rejects requestless targeted execution before invoking operations", async () => {
  const pathId = performancePathId([]);
  const testName = `browser perf: toolcraft path ${pathId}`;
  const calls = [];
  const operations = freeze({
    createNonce: () => {
      calls.push("createNonce");
      return "unused";
    },
    readReport: async () => {
      calls.push("readReport");
    },
    removeReport: async () => {
      calls.push("removeReport");
    },
    runPlaywright: async () => {
      calls.push("runPlaywright");
    },
  });
  const base = {
    operations,
    performanceComparison: { kind: "none" },
    performancePassIds: [],
    performancePathIds: [pathId],
    performanceSelections: [
      {
        fullTitle: `app-performance.spec.ts › ${testName}`,
        grepTitle: `app-performance.spec.ts ${testName}`,
        leafTitle: testName,
      },
    ],
    performanceTestNames: [testName],
    playwrightBin: "/workspace/node_modules/.bin/playwright",
    projectDir: "/workspace",
    sourceHash: hash("a"),
  };

  for (const invalid of [
    { fixtureResolutionMode: "strict-development" },
    {
      fixtureResolutionMode: "strict-development",
      requestAuthorityHash: null,
    },
    {
      fixtureResolutionMode: "default",
      requestAuthorityHash: hash("b"),
    },
  ]) {
    await assert.rejects(
      executeToolcraftTargetedPerformanceVerificationCore({
        ...base,
        ...invalid,
      }),
      /planned targeted performance execution input is malformed/iu,
    );
  }
  assert.deepEqual(calls, []);
});
