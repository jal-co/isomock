import { expect, test } from "@playwright/test";
import type { TestCase } from "@playwright/test/reporter";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  defineToolcraft,
  defineToolcraftPerformance,
  deriveToolcraftPerformancePaths,
  registerToolcraftRendererPipeline,
  type ToolcraftRendererPipelinePassContract,
} from "@/toolcraft/runtime";

import {
  TOOLCRAFT_BROWSER_PERFORMANCE_MARKER_TEST_NAME,
  type ToolcraftBrowserRuntimeRequirement,
} from "../src/app/test-evidence/browser-runtime-contract";
import {
  TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME,
  TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_CONTENT_TYPE,
  serializeToolcraftBrowserPerformanceEvidence,
  type ToolcraftPerformancePipelinePhase,
} from "../src/app/test-evidence/browser-performance-contract";
import {
  TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_ATTACHMENT_NAME,
  TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_CONTENT_TYPE,
  serializeToolcraftPerformanceMeasurement,
} from "../src/app/test-evidence/browser-performance-measurement-contract";
import {
  fakeSuite,
  fakeTestCase,
  passedResultWithEvidence,
} from "./browser-runtime-evidence-reporter-test-fixtures";
import ToolcraftBrowserRuntimeEvidenceReporter from "./browser-runtime-evidence-reporter";
import { getToolcraftPerformancePathTestName } from "./performance-path-adapter-matrix";
import {
  TOOLCRAFT_PERFORMANCE_ENVIRONMENT_ATTACHMENT_NAME,
  TOOLCRAFT_PERFORMANCE_ENVIRONMENT_CONTENT_TYPE,
} from "./performance-environment-evidence";
import { TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR_ENV } from "./performance-fixture-selection";

const originalFixtureSelector =
  process.env[TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR_ENV];

test.beforeEach(() => {
  process.env[TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR_ENV] = "maximum";
});

test.afterEach(() => {
  if (originalFixtureSelector === undefined) {
    delete process.env[TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR_ENV];
  } else {
    process.env[TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR_ENV] =
      originalFixtureSelector;
  }
});

const performanceSchema = defineToolcraft({
  base: {
    identity: { id: "contract-fixture", title: "Contract fixture" },
    canvas: { enabled: true, sizing: { mode: "editable-output" } },
    panels: {
      controls: {
        sections: [
          {
            id: "test-section-1",
            controls: {
              opacity: {
                applicability: { mode: "always" as const },
                defaultValue: 0.5,
                label: "Opacity",
                max: 1,
                min: 0,
                performanceRole: "responsiveness",
                target: "appearance.opacity",
                type: "slider",
              },
            },
            title: "Appearance",
          },
        ],
        title: "Controls",
      },
    },
  },
  modules: [],
});

type ReporterPipelinePasses = {
  composite: ToolcraftRendererPipelinePassContract<void>;
};

const performanceRegistration =
  registerToolcraftRendererPipeline<ReporterPipelinePasses>()({
    interactionInvalidation: [
      {
        interaction: "control-drag",
        invalidates: ["composite"],
        targets: ["appearance.opacity"],
      },
    ],
    passes: [
      {
        cost: {
          dimensions: [],
          frequency: "interaction",
          relationship: "constant",
        },
        id: "composite",
        inputs: ["appearance.opacity"],
        invalidatedBy: ["appearance.opacity"],
        kind: "composite",
        lifecycle: { cache: "none", resourceScope: "call" },
        output: "preview",
        quality: "full",
        runsOn: "main",
      },
    ],
    runtimeId: "reporter-pipeline-v1",
  });

const performanceModel = defineToolcraftPerformance({
  rendererPipeline: performanceRegistration,
  rendererStrategy: "dom",
  scenarios: [],
  usesCustomRenderer: true,
  workloadEnvelope: { dimensions: [] },
});
const [reporterPerformancePath] = deriveToolcraftPerformancePaths(
  performanceSchema,
  performanceModel,
);
const richTestName = "browser perf: reporter pipeline evidence";
const performanceConfig = defineToolcraftPerformance({
  ...performanceModel,
  scenarios: [
    {
      automated: true,
      automatedTestName: "perf: reporter pipeline evidence",
      browser: true,
      browserTestName: richTestName,
      coversTargets: reporterPerformancePath!.targets,
      expectedObservable: "Opacity changes the preview.",
      fixture: "reporter fixture",
      id: "reporter-pipeline",
      interaction: "control-drag",
      pathId: reporterPerformancePath!.id,
      target: "appearance.opacity",
    },
  ],
});

function richPipelineAttachment(phase: ToolcraftPerformancePipelinePhase) {
  const phaseIndex = (["cold", "warm", "sustained"] as const).indexOf(phase);
  const counters = (executions: number) => ({
    activeResources: 0,
    cacheHits: 0,
    cacheMisses: executions,
    durationMax: executions === 0 ? 0 : 1,
    durationTotal: executions,
    executions,
    resourceCreations: 0,
    resourceDisposals: 0,
    transfers: 0,
  });
  return {
    body: Buffer.from(
      serializeToolcraftBrowserPerformanceEvidence({
        after: {
          disposed: false,
          passes: [
            {
              ...counters(phaseIndex + 1),
              passId: "composite",
            },
          ],
          runtimeId: performanceRegistration.runtimeId,
        },
        before: {
          disposed: false,
          passes: [{ ...counters(phaseIndex), passId: "composite" }],
          runtimeId: performanceRegistration.runtimeId,
        },
        evidenceType: "performance-pipeline",
        pathId: reporterPerformancePath!.id,
        phase,
        profile: reporterPerformancePath!.profile,
      }),
    ),
    contentType: TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_CONTENT_TYPE,
    name: TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME,
  };
}

function richMeasurementAttachment(phase: ToolcraftPerformancePipelinePhase) {
  return {
    body: Buffer.from(
      serializeToolcraftPerformanceMeasurement({
        evidenceType: "performance-measurement-metrics",
        kind: "interaction",
        metrics: {
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
        },
        pathId: reporterPerformancePath!.id,
        phase,
        profile: reporterPerformancePath!.profile,
      }),
    ),
    contentType: TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_CONTENT_TYPE,
    name: TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_ATTACHMENT_NAME,
  };
}

function environmentAttachment() {
  return {
    body: Buffer.from(
      JSON.stringify({
        browser: { name: "chromium", version: "test" },
        calibration: { durationMs: 1, iterations: 10 },
        cpuThrottling: { mode: "none", rate: 1 },
        evidenceType: "performance-environment",
        hardwareConcurrency: 4,
        version: 1,
        viewport: { height: 720, width: 1280 },
      }),
    ),
    contentType: TOOLCRAFT_PERFORMANCE_ENVIRONMENT_CONTENT_TYPE,
    name: TOOLCRAFT_PERFORMANCE_ENVIRONMENT_ATTACHMENT_NAME,
  };
}

test("custom renderer reports require rich phases in addition to runtime registration evidence", async () => {
  const booleanRequirement: ToolcraftBrowserRuntimeRequirement = {
    evidenceType: "performance-budget",
    requirementId: "reporter-pipeline",
    testName: richTestName,
  };
  const booleanResult = passedResultWithEvidence(booleanRequirement);
  const marker = fakeTestCase({
    file: "/product/e2e/app-browser-runtime-evidence.spec.ts",
    title: TOOLCRAFT_BROWSER_PERFORMANCE_MARKER_TEST_NAME,
  });
  const reports: unknown[] = [];
  const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
    acceptanceRequirements: [],
    performanceConfig,
    performanceRequirements: [booleanRequirement],
    performanceSchema,
    reportPerformance: (report) => reports.push(report),
  });
  const scenarioTest = fakeTestCase({
    results: [
      {
        ...booleanResult,
        attachments: [
          ...booleanResult.attachments,
          richPipelineAttachment("cold"),
          richPipelineAttachment("warm"),
          richPipelineAttachment("sustained"),
          richMeasurementAttachment("cold"),
          richMeasurementAttachment("warm"),
          richMeasurementAttachment("sustained"),
        ],
      } as TestCase["results"][number],
    ],
    title: richTestName,
  });

  reporter.onBegin?.({} as never, fakeSuite([marker, scenarioTest]));
  await expect(
    reporter.onEnd?.({ status: "passed" } as never),
  ).resolves.toBeUndefined();
  expect(reports).toHaveLength(1);

  const missingPhaseReporter = new ToolcraftBrowserRuntimeEvidenceReporter({
    acceptanceRequirements: [],
    performanceConfig,
    performanceRequirements: [booleanRequirement],
    performanceSchema,
    reportError: () => undefined,
  });
  const missingPhaseTest = fakeTestCase({
    results: [
      {
        ...booleanResult,
        attachments: [
          ...booleanResult.attachments,
          richPipelineAttachment("cold"),
          richPipelineAttachment("warm"),
          richMeasurementAttachment("cold"),
          richMeasurementAttachment("warm"),
          richMeasurementAttachment("sustained"),
        ],
      } as TestCase["results"][number],
    ],
    title: richTestName,
  });
  missingPhaseReporter.onBegin?.(
    {} as never,
    fakeSuite([marker, missingPhaseTest]),
  );
  await expect(
    missingPhaseReporter.onEnd?.({ status: "passed" } as never),
  ).resolves.toEqual({ status: "failed" });
});

test("protected checkpoint reporter writes only a complete independently validated report", async () => {
  const booleanRequirement: ToolcraftBrowserRuntimeRequirement = {
    evidenceType: "performance-budget",
    requirementId: "reporter-pipeline",
    testName: richTestName,
  };
  const booleanResult = passedResultWithEvidence(booleanRequirement);
  const reportPath = path.join(
    mkdtempSync(path.join(tmpdir(), "toolcraft-reporter-")),
    "report.json",
  );
  const marker = fakeTestCase({
    file: "/product/e2e/app-browser-runtime-evidence.spec.ts",
    title: TOOLCRAFT_BROWSER_PERFORMANCE_MARKER_TEST_NAME,
  });
  const environmentTest = fakeTestCase({
    results: [
      {
        ...booleanResult,
        attachments: [environmentAttachment()],
      } as TestCase["results"][number],
    ],
    title: "browser perf: toolcraft environment",
  });
  const scenarioTest = fakeTestCase({
    results: [
      {
        ...booleanResult,
        attachments: [
          ...booleanResult.attachments,
          ...(["cold", "warm", "sustained"] as const).flatMap((phase) => [
            richPipelineAttachment(phase),
            richMeasurementAttachment(phase),
          ]),
        ],
      } as TestCase["results"][number],
    ],
    title: richTestName,
  });
  const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
    acceptanceRequirements: [],
    checkpointReport: {
      nonce: "checkpoint-nonce",
      path: reportPath,
      sourceHash: "a".repeat(64),
    },
    performanceConfig,
    performanceRequirements: [booleanRequirement],
    performanceSchema,
  });

  reporter.onBegin?.(
    {} as never,
    fakeSuite([marker, environmentTest, scenarioTest]),
  );
  await expect(
    reporter.onEnd?.({ status: "passed" } as never),
  ).resolves.toBeUndefined();
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  expect(report.nonce).toBe("checkpoint-nonce");
  expect(report.measurements).toHaveLength(3);
  expect(report.pipelineSummaries).toHaveLength(3);
});

test("targeted reporter writes only exact impacted canonical path evidence", async () => {
  const targetedTestName = getToolcraftPerformancePathTestName(
    reporterPerformancePath!,
  );
  const booleanRequirement: ToolcraftBrowserRuntimeRequirement = {
    evidenceType: "performance-budget",
    requirementId: "reporter-pipeline",
    testName: targetedTestName,
  };
  const booleanResult = passedResultWithEvidence(booleanRequirement);
  const reportPath = path.join(
    mkdtempSync(path.join(tmpdir(), "toolcraft-targeted-reporter-")),
    "report.json",
  );
  const scenarioTest = fakeTestCase({
    results: [
      {
        ...booleanResult,
        attachments: [
          ...booleanResult.attachments,
          ...(["cold", "warm", "sustained"] as const).flatMap((phase) => [
            richPipelineAttachment(phase),
            richMeasurementAttachment(phase),
          ]),
        ],
      } as TestCase["results"][number],
    ],
    title: targetedTestName,
  });
  const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
    acceptanceRequirements: [],
    performanceConfig,
    performanceRequirements: [booleanRequirement],
    performanceSchema,
    targetedPerformanceReport: {
      fixtureResolutionMode: "strict-development",
      fixtureSelector: "development",
      nonce: "targeted-nonce",
      passIds: ["composite"],
      path: reportPath,
      pathIds: [reporterPerformancePath!.id],
      requestAuthorityHash: "b".repeat(64),
      sourceHash: "a".repeat(64),
    },
  });

  reporter.onBegin?.({} as never, fakeSuite([scenarioTest]));
  await expect(
    reporter.onEnd?.({ status: "passed" } as never),
  ).resolves.toBeUndefined();
  expect(JSON.parse(readFileSync(reportPath, "utf8"))).toMatchObject({
    fixtureResolutionMode: "strict-development",
    fixtureSelector: "development",
    nonce: "targeted-nonce",
    performancePassIds: ["composite"],
    performancePathIds: [reporterPerformancePath!.id],
    requestAuthorityHash: "b".repeat(64),
    testNames: [targetedTestName],
    version: 3,
  });

  const unrelatedReportPath = `${reportPath}.unrelated`;
  const unrelatedReporter = new ToolcraftBrowserRuntimeEvidenceReporter({
    acceptanceRequirements: [],
    performanceConfig,
    performanceRequirements: [booleanRequirement],
    performanceSchema,
    reportError: () => undefined,
    targetedPerformanceReport: {
      fixtureResolutionMode: "strict-development",
      fixtureSelector: "development",
      nonce: "targeted-nonce",
      passIds: ["composite"],
      path: unrelatedReportPath,
      pathIds: [reporterPerformancePath!.id],
      requestAuthorityHash: "b".repeat(64),
      sourceHash: "a".repeat(64),
    },
  });
  unrelatedReporter.onBegin?.(
    {} as never,
    fakeSuite([fakeTestCase({ title: "browser perf: unrelated workload" })]),
  );
  await expect(
    unrelatedReporter.onEnd?.({ status: "passed" } as never),
  ).resolves.toEqual({ status: "failed" });
  expect(existsSync(unrelatedReportPath)).toBe(false);
});
