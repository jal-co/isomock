import type { FullResult, TestCase } from "@playwright/test/reporter";
import type {
  ResolvedToolcraftAppSchema,
  ToolcraftPerformanceConfig,
  ToolcraftPerformancePath,
} from "@/toolcraft/runtime";

import type { ToolcraftBrowserPerformanceAttachment } from "../src/app/test-evidence/browser-performance-contract";
import type { ToolcraftBrowserRuntimeRequirement } from "../src/app/test-evidence/browser-runtime-contract";
import {
  evaluateToolcraftBrowserPerformanceEvidence,
  requiresToolcraftPerformancePipelineEvidence,
  type ToolcraftBrowserPerformanceReport,
} from "./browser-performance-report";
import {
  evaluateToolcraftPerformanceMeasurements,
  type ToolcraftPerformanceMeasurementReport,
} from "./browser-performance-measurement-report";
import { TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR_ENV } from "./performance-fixture-selection";
import {
  createToolcraftPerformanceCheckpointReport,
  type ToolcraftPerformanceCheckpointReport,
} from "./performance-checkpoint-report";
import {
  TOOLCRAFT_PERFORMANCE_ENVIRONMENT_ATTACHMENT_NAME,
  TOOLCRAFT_PERFORMANCE_ENVIRONMENT_CONTENT_TYPE,
  decodeToolcraftPerformanceEnvironment,
  type ToolcraftPerformanceEnvironmentEvidence,
} from "./performance-environment-evidence";
import { getToolcraftPerformancePathTestName } from "./performance-path-adapter-matrix";

export type ToolcraftCheckpointReportTarget = Readonly<{
  nonce: string;
  path: string;
  sourceHash: string;
}>;

export type ToolcraftTargetedPerformanceReportTarget = Readonly<{
  fixtureResolutionMode: "strict-development";
  fixtureSelector: "development";
  nonce: string;
  passIds: readonly string[];
  path: string;
  pathIds: readonly string[];
  requestAuthorityHash: string;
  sourceHash: string;
}>;

type ToolcraftBrowserPerformanceRunEvaluation = {
  checkpoint?: ToolcraftPerformanceCheckpointReport;
  errors: string[];
  measurements?: ToolcraftPerformanceMeasurementReport;
  performance?: ToolcraftBrowserPerformanceReport;
  targetedPaths?: readonly ToolcraftPerformancePath[];
};

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function collectEnvironmentEvidence(
  selectedTests: readonly TestCase[],
  errors: string[],
): ToolcraftPerformanceEnvironmentEvidence | undefined {
  const attachments = selectedTests
    .flatMap((test) => test.results.at(-1)?.attachments ?? [])
    .filter(
      (attachment) =>
        attachment.name === TOOLCRAFT_PERFORMANCE_ENVIRONMENT_ATTACHMENT_NAME ||
        attachment.contentType === TOOLCRAFT_PERFORMANCE_ENVIRONMENT_CONTENT_TYPE,
    );
  if (attachments.length !== 1) {
    errors.push(
      `Protected performance checkpoint requires exactly one environment attachment; found ${attachments.length}.`,
    );
    return undefined;
  }

  const attachment = attachments[0] as ToolcraftBrowserPerformanceAttachment;
  if (
    attachment.name !== TOOLCRAFT_PERFORMANCE_ENVIRONMENT_ATTACHMENT_NAME ||
    attachment.contentType !== TOOLCRAFT_PERFORMANCE_ENVIRONMENT_CONTENT_TYPE
  ) {
    errors.push(
      "Protected performance environment attachment has a mismatched name or content type.",
    );
    return undefined;
  }
  const decoded = decodeToolcraftPerformanceEnvironment(attachment.body);
  if (!decoded.ok) {
    errors.push(`Malformed performance environment: ${decoded.error}`);
    return undefined;
  }
  return decoded.evidence;
}

export function evaluateToolcraftTargetedPerformanceSelection({
  canonicalPaths,
  expectedPaths,
  selectedTests,
  target,
}: {
  canonicalPaths: readonly ToolcraftPerformancePath[];
  expectedPaths: readonly ToolcraftPerformancePath[];
  selectedTests: readonly TestCase[];
  target: ToolcraftTargetedPerformanceReportTarget;
}): { errors: string[]; paths: readonly ToolcraftPerformancePath[] } {
  const errors: string[] = [];
  if (
    target.fixtureResolutionMode !== "strict-development" ||
    target.fixtureSelector !== "development" ||
    !/^[a-f0-9]{64}$/u.test(target.requestAuthorityHash)
  ) {
    errors.push(
      "Targeted performance reporting requires strict development fixtures and canonical request authority.",
    );
  }
  const requestedPassIds = uniqueSorted(target.passIds);
  const requestedPathIds = uniqueSorted(target.pathIds);
  if (requestedPassIds.length !== target.passIds.length) {
    errors.push(
      "Targeted performance reporting requires unique renderer pass ids.",
    );
  }
  if (
    requestedPathIds.length === 0 ||
    requestedPathIds.length !== target.pathIds.length
  ) {
    errors.push(
      "Targeted performance reporting requires non-empty unique canonical path ids.",
    );
  }
  const knownPassIds = new Set(canonicalPaths.flatMap((path) => path.invalidates));
  const unknownPassIds = requestedPassIds.filter((passId) => !knownPassIds.has(passId));
  if (unknownPassIds.length > 0) {
    errors.push(
      `Targeted performance reporting references renderer passes without canonical paths: ${unknownPassIds.join(", ")}.`,
    );
  }
  const canonicalPathsById = new Map(
    canonicalPaths.map((path) => [path.id, path] as const),
  );
  const unknownPathIds = requestedPathIds.filter(
    (pathId) => !canonicalPathsById.has(pathId),
  );
  if (unknownPathIds.length > 0) {
    errors.push(
      `Targeted performance reporting references unknown canonical paths: ${unknownPathIds.join(", ")}.`,
    );
  }
  const paths = requestedPathIds.flatMap((pathId) => {
    const canonicalPath = canonicalPathsById.get(pathId);
    return canonicalPath ? [canonicalPath] : [];
  });
  const expectedPassIds = uniqueSorted(
    paths.flatMap((path) => path.invalidates),
  );
  if (!arraysEqual(requestedPassIds, expectedPassIds)) {
    errors.push(
      `Targeted performance renderer pass ids must exactly match selected path invalidations. Expected ${expectedPassIds.join(", ") || "none"}; received ${requestedPassIds.join(", ") || "none"}.`,
    );
  }
  const selectedPathIds = uniqueSorted(expectedPaths.map((path) => path.id));
  const targetedPathIds = uniqueSorted(paths.map((path) => path.id));
  if (!arraysEqual(selectedPathIds, targetedPathIds)) {
    errors.push(
      `Targeted performance tests must prove exactly the impacted canonical paths. Expected ${targetedPathIds.join(", ") || "none"}; selected ${selectedPathIds.join(", ") || "none"}.`,
    );
  }
  const selectedTestNames = uniqueSorted(
    selectedTests
      .map((test) => test.title)
      .filter((title) => title.startsWith("browser perf:")),
  );
  const targetedTestNames = uniqueSorted(paths.map(getToolcraftPerformancePathTestName));
  if (!arraysEqual(selectedTestNames, targetedTestNames)) {
    errors.push(
      `Targeted performance selection must contain only canonical impacted path tests. Expected ${targetedTestNames.join(", ") || "none"}; selected ${selectedTestNames.join(", ") || "none"}.`,
    );
  }
  return { errors, paths };
}

export function evaluateToolcraftBrowserPerformanceRun({
  canonicalPaths,
  checkpointReport,
  performanceConfig,
  performanceRequirements,
  performanceSchema,
  resultStatus,
  selectedTests,
  targetedPerformanceReport,
  validateFullPerformance,
}: {
  canonicalPaths: readonly ToolcraftPerformancePath[];
  checkpointReport?: ToolcraftCheckpointReportTarget;
  performanceConfig: ToolcraftPerformanceConfig;
  performanceRequirements: readonly ToolcraftBrowserRuntimeRequirement[];
  performanceSchema: ResolvedToolcraftAppSchema;
  resultStatus: FullResult["status"];
  selectedTests: readonly TestCase[];
  targetedPerformanceReport?: ToolcraftTargetedPerformanceReportTarget;
  validateFullPerformance: boolean;
}): ToolcraftBrowserPerformanceRunEvaluation {
  const errors: string[] = [];
  const selectedTitles = new Set(selectedTests.map((test) => test.title));
  const canonicalTestNames = new Set(
    performanceRequirements.map((requirement) => requirement.testName),
  );
  const attachments = selectedTests
    .filter((test) => canonicalTestNames.has(test.title))
    .flatMap((test) => test.results.at(-1)?.attachments ?? []);
  const expectedPaths = validateFullPerformance
    ? canonicalPaths
    : canonicalPaths.filter((path) =>
        selectedTitles.has(getToolcraftPerformancePathTestName(path)),
      );

  let targetedPaths: readonly ToolcraftPerformancePath[] | undefined;
  if (targetedPerformanceReport) {
    const targeted = evaluateToolcraftTargetedPerformanceSelection({
      canonicalPaths,
      expectedPaths,
      selectedTests,
      target: targetedPerformanceReport,
    });
    errors.push(...targeted.errors);
    targetedPaths = targeted.paths;
    if (resultStatus !== "passed") {
      errors.push(
        `Targeted performance reporting cannot record Playwright status ${resultStatus}.`,
      );
    }
  }

  let measurementReport: ToolcraftPerformanceMeasurementReport | undefined;
  if (expectedPaths.length > 0) {
    const evaluation = evaluateToolcraftPerformanceMeasurements({
      attachments,
      expectedPaths,
      scenarios: performanceConfig.scenarios,
    });
    errors.push(...evaluation.errors);
    measurementReport = evaluation.report;
  }

  let performanceReport: ToolcraftBrowserPerformanceReport | undefined;
  if (requiresToolcraftPerformancePipelineEvidence(performanceConfig)) {
    const evaluation = evaluateToolcraftBrowserPerformanceEvidence({
      attachments,
      expectedPathIds: expectedPaths.map((path) => path.id),
      performanceConfig,
      schema: performanceSchema,
    });
    errors.push(...evaluation.errors);
    performanceReport = evaluation.report;
  }

  let checkpoint: ToolcraftPerformanceCheckpointReport | undefined;
  if (checkpointReport) {
    if (process.env[TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR_ENV] !== "maximum") {
      errors.push(
        "Protected performance checkpoint reporting requires maximum compiled fixtures.",
      );
    }
    if (!validateFullPerformance) {
      errors.push(
        "Protected performance checkpoint reporting requires the full performance marker.",
      );
    }
    if (resultStatus !== "passed") {
      errors.push(
        `Protected performance checkpoint cannot report Playwright status ${resultStatus}.`,
      );
    }
    const environment = collectEnvironmentEvidence(selectedTests, errors);
    if (!measurementReport) {
      errors.push(
        "Protected performance checkpoint is missing independently validated measurement evidence.",
      );
    }
    if (!performanceReport) {
      const evaluation = evaluateToolcraftBrowserPerformanceEvidence({
        attachments,
        expectedPathIds: expectedPaths.map((path) => path.id),
        performanceConfig,
        schema: performanceSchema,
      });
      errors.push(...evaluation.errors);
      performanceReport = evaluation.report;
    }
    if (environment && measurementReport && performanceReport) {
      checkpoint = createToolcraftPerformanceCheckpointReport({
        environment,
        measurements: measurementReport.observations,
        nonce: checkpointReport.nonce,
        paths: expectedPaths,
        pipelineSummaries: performanceReport.observations,
        sourceHash: checkpointReport.sourceHash,
      });
    }
  }

  return {
    checkpoint,
    errors,
    measurements: measurementReport,
    performance: performanceReport,
    targetedPaths,
  };
}
