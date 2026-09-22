import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";

import {
  decodeToolcraftPerformancePathId,
} from "../src/toolcraft/runtime/testing/performance-path-codec.mjs";
import {
  getToolcraftPlaywrightExactGrepPattern,
} from "./playwright-test-title-selection.mjs";
import {
  createToolcraftPerformanceIterationComparison,
} from "./toolcraft-performance-iteration-comparison.mjs";
import {
  createToolcraftTargetedPerformanceEvidenceHash,
  readToolcraftTargetedPerformanceReport,
} from "./toolcraft-targeted-performance-report.mjs";
import {
  combineToolcraftTargetedPerformanceReports,
} from "./toolcraft-targeted-performance-report-combination.mjs";
import {
  runToolcraftProofProcess,
} from "./toolcraft-proof-process.mjs";

function getPathPassIds(pathId) {
  const signature = decodeToolcraftPerformancePathId(pathId);
  return signature ? [...signature.invalidates] : undefined;
}

function isCanonicalTargets(value, { allowEmpty = false } = {}) {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every(
      (item) =>
        typeof item === "string" &&
        item.length > 0 &&
        item.trim() === item,
    ) &&
    value.every(
      (item, index) => index === 0 || value[index - 1] < item,
    )
  );
}

function assertInputs(options) {
  if (
    options.fixtureResolutionMode !== "strict-development" ||
    !/^[a-f0-9]{64}$/u.test(options.requestAuthorityHash ?? "") ||
    !isCanonicalTargets(options.performancePassIds, { allowEmpty: true }) ||
    !isCanonicalTargets(options.performancePathIds) ||
    !isCanonicalTargets(options.performanceTestNames) ||
    options.performancePathIds.length !==
      options.performanceTestNames.length ||
    !Array.isArray(options.performanceSelections) ||
    options.performanceSelections.length !==
      options.performanceTestNames.length ||
    !options.performanceTestNames.every(
      (testName) =>
        options.performanceSelections.filter(
          ({ leafTitle }) => leafTitle === testName,
        ).length === 1,
    ) ||
    options.performancePathIds.some(
      (pathId) => getPathPassIds(pathId) === undefined,
    ) ||
    JSON.stringify(
      [...new Set(
        options.performancePathIds.flatMap(
          (pathId) => getPathPassIds(pathId) ?? [],
        ),
      )].sort(),
    ) !== JSON.stringify(options.performancePassIds) ||
    !(
      options.performanceComparison?.kind === "none" ||
      (options.performanceComparison?.kind ===
        "compatible-targeted-report" &&
        typeof options.performanceComparison.report === "object" &&
        /^[a-f0-9]{64}$/u.test(
          options.performanceComparison.comparisonHash ?? "",
        ))
    )
  ) {
    throw new Error(
      "Toolcraft planned targeted performance execution input is malformed.",
    );
  }
}

function assertOperations(operations) {
  if (
    typeof operations !== "object" ||
    operations === null ||
    !Object.isFrozen(operations) ||
    ![
      "createNonce",
      "readReport",
      "removeReport",
      "runPlaywright",
    ].every((name) => typeof operations[name] === "function")
  ) {
    throw new Error(
      "Toolcraft targeted performance execution requires explicit frozen operations.",
    );
  }
}

function createTestEvidence(selections) {
  return selections
    .map(({ fullTitle, leafTitle }) => ({ fullTitle, leafTitle }))
    .sort((left, right) =>
      left.fullTitle < right.fullTitle
        ? -1
        : left.fullTitle > right.fullTitle
          ? 1
          : 0,
    );
}

export async function executeToolcraftTargetedPerformanceVerificationCore(
  options,
) {
  assertInputs(options);
  assertOperations(options.operations);
  const {
    fixtureResolutionMode,
    operations,
    performanceComparison,
    performancePassIds,
    performancePathIds,
    performanceSelections,
    performanceTestNames,
    playwrightBin,
    projectDir,
    requestAuthorityHash,
    sourceHash,
  } = options;
  const reports = [];
  const combinedNonce = operations.createNonce();
  for (const [index, pathId] of performancePathIds.entries()) {
    const testName = performanceTestNames[index];
    const pathPassIds = getPathPassIds(pathId);
    const selection = performanceSelections.find(
      ({ leafTitle }) => leafTitle === testName,
    );
    const nonce = operations.createNonce();
    const reportPath = path.join(
      projectDir,
      ".toolcraft",
      "verification",
      `targeted-performance-${nonce}.json`,
    );
    await operations.removeReport(reportPath);
    try {
      await operations.runPlaywright({
        fixtureResolutionMode,
        nonce,
        pathId,
        performancePassIds: pathPassIds,
        playwrightBin,
        projectDir,
        reportPath,
        requestAuthorityHash,
        selection,
        sourceHash,
        testName,
      });
      reports.push(
        await operations.readReport(reportPath, {
          fixtureResolutionMode,
          fixtureSelector: "development",
          nonce,
          performancePassIds: pathPassIds,
          performancePathIds: [pathId],
          requestAuthorityHash,
          sourceHash,
          testNames: [testName],
          version: 3,
        }),
      );
    } finally {
      await operations.removeReport(reportPath);
    }
  }
  const report = combineToolcraftTargetedPerformanceReports({
    nonce: combinedNonce,
    performancePassIds,
    reports,
    requestAuthorityHash,
    sourceHash,
  });
  const testEvidence = createTestEvidence(performanceSelections);
  const evidenceHash = createToolcraftTargetedPerformanceEvidenceHash({
    report,
    testEvidence,
  });
  const comparison =
    performanceComparison.kind === "compatible-targeted-report"
      ? createToolcraftPerformanceIterationComparison({
          currentReport: report,
          previousReport: performanceComparison.report,
          comparisonHash: performanceComparison.comparisonHash,
        })
      : null;
  if (
    performanceComparison.kind === "compatible-targeted-report" &&
    comparison.status !== "compared"
  ) {
    throw new Error(
      "Toolcraft targeted performance comparison is no longer compatible.",
    );
  }
  return Object.freeze({
    comparison,
    evidenceHash,
    report,
    testEvidence: Object.freeze(testEvidence.map(Object.freeze)),
  });
}

function createProductionOperations() {
  return Object.freeze({
    createNonce: randomUUID,
    readReport: readToolcraftTargetedPerformanceReport,
    removeReport: (reportPath) => rm(reportPath, { force: true }),
    runPlaywright: ({
      fixtureResolutionMode,
      nonce,
      pathId,
      performancePassIds,
      playwrightBin,
      projectDir,
      reportPath,
      requestAuthorityHash,
      selection,
      sourceHash,
    }) =>
      runToolcraftProofProcess(
        playwrightBin,
        [
          "test",
          "--grep",
          getToolcraftPlaywrightExactGrepPattern([selection]),
          "--workers=1",
        ],
        {
          cwd: projectDir,
          env: {
            ...process.env,
            TOOLCRAFT_BROWSER_SERVER_MODE: "preview",
            TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE:
              fixtureResolutionMode,
            TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR: "development",
            TOOLCRAFT_TARGETED_PERFORMANCE_PASS_IDS:
              JSON.stringify(performancePassIds),
            TOOLCRAFT_TARGETED_PERFORMANCE_PATH_IDS:
              JSON.stringify([pathId]),
            TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_NONCE: nonce,
            TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_PATH: reportPath,
            TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_SOURCE_HASH: sourceHash,
            TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH:
              requestAuthorityHash,
          },
        },
      ),
  });
}

export function executeToolcraftTargetedPerformanceVerification(options) {
  return executeToolcraftTargetedPerformanceVerificationCore({
    ...options,
    operations: createProductionOperations(),
  });
}
