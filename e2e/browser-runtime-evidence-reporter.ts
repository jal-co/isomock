import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
} from "@playwright/test/reporter";
import {
  deriveToolcraftPerformancePaths,
  type ResolvedToolcraftAppSchema,
  type ToolcraftPerformanceConfig,
  type ToolcraftPerformancePath,
} from "@/toolcraft/runtime";
import {
  TOOLCRAFT_BROWSER_ACCEPTANCE_MARKER_FILE_NAME,
  TOOLCRAFT_BROWSER_ACCEPTANCE_MARKER_TEST_NAME,
  TOOLCRAFT_BROWSER_PERFORMANCE_MARKER_TEST_NAME,
  evaluateToolcraftBrowserRuntimeEvidence,
  type ToolcraftBrowserRuntimeRequirement,
  type ToolcraftBrowserRuntimeTest,
} from "../src/app/test-evidence/browser-runtime-contract";
import {
  appAcceptance,
  appControlSectionInventory,
} from "../src/app/app-acceptance";
import { appSchema } from "../src/app/app-schema";
import {
  parseToolcraftFeatureVerificationPlanSource,
  type ToolcraftFeatureVerificationPlan,
} from "../scripts/toolcraft-feature-verification-plan.mjs";
import {
  deriveToolcraftBrowserRuntimeRequirements,
  deriveToolcraftPerformancePathRuntimeRequirements,
} from "./browser-runtime-evidence-requirements";
import {
  createToolcraftBrowserExecutionLedger,
  createToolcraftBrowserExecutionLedgerTest,
  writeToolcraftBrowserExecutionLedgerSync,
  type ToolcraftBrowserExecutionLedgerTarget,
} from "./browser-execution-ledger";
import {
  type ToolcraftBrowserPerformanceReport,
} from "./browser-performance-report";
import {
  evaluateToolcraftBrowserPerformanceRun,
  type ToolcraftCheckpointReportTarget,
  type ToolcraftTargetedPerformanceReportTarget,
} from "./browser-performance-reporter-evaluation";
import {
  writeToolcraftPerformanceCheckpointReport,
  type ToolcraftPerformanceCheckpointReport,
} from "./performance-checkpoint-report";
import { getToolcraftPerformancePathTestName } from "./performance-path-adapter-matrix";
import { writeToolcraftTargetedPerformanceReportSync } from "../scripts/toolcraft-targeted-performance-report.mjs";
import { getToolcraftPlaywrightProjectRoot } from "../scripts/playwright-containing-file.mjs";

type ToolcraftBrowserRuntimeEvidenceReporterOptions = {
  acceptanceRequirements?: readonly ToolcraftBrowserRuntimeRequirement[];
  browserExecutionLedger?: ToolcraftBrowserExecutionLedgerTarget;
  checkpointReport?: ToolcraftCheckpointReportTarget;
  featureVerificationPlanSource?: string;
  performanceConfig?: ToolcraftPerformanceConfig;
  performanceRequirements?: readonly ToolcraftBrowserRuntimeRequirement[];
  performanceSchema?: ResolvedToolcraftAppSchema;
  reportError?: (error: string) => void;
  reportPerformance?: (report: ToolcraftBrowserPerformanceReport) => void;
  reportCheckpoint?: (report: ToolcraftPerformanceCheckpointReport) => void;
  targetedPerformanceReport?: ToolcraftTargetedPerformanceReportTarget;
};

const environmentFeatureVerificationPlanSource =
  process.env.TOOLCRAFT_FEATURE_VERIFICATION_PLAN;
const environmentFeatureVerificationPlan =
  environmentFeatureVerificationPlanSource === undefined
    ? undefined
    : parseToolcraftFeatureVerificationPlanSource(
        environmentFeatureVerificationPlanSource,
      );
const appPerformance =
  environmentFeatureVerificationPlan === undefined
    ? (await import("../src/app/app-performance")).appPerformance
    : undefined;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

function isProtectedAcceptanceMarker(test: TestCase): boolean {
  const normalizedFile = test.location.file.replaceAll("\\", "/");

  return (
    test.title === TOOLCRAFT_BROWSER_ACCEPTANCE_MARKER_TEST_NAME &&
    normalizedFile.endsWith(
      `/e2e/${TOOLCRAFT_BROWSER_ACCEPTANCE_MARKER_FILE_NAME}`,
    )
  );
}

function isProtectedPerformanceMarker(test: TestCase): boolean {
  const normalizedFile = test.location.file.replaceAll("\\", "/");
  return (
    test.title === TOOLCRAFT_BROWSER_PERFORMANCE_MARKER_TEST_NAME &&
    normalizedFile.endsWith(
      `/e2e/${TOOLCRAFT_BROWSER_ACCEPTANCE_MARKER_FILE_NAME}`,
    )
  );
}

function toRuntimeTest(test: TestCase): ToolcraftBrowserRuntimeTest {
  return {
    expectedStatus: test.expectedStatus,
    results: test.results.map((result) => ({
      attachments: result.attachments,
      retry: result.retry,
      status: result.status,
    })),
    title: test.title,
  };
}

export default class ToolcraftBrowserRuntimeEvidenceReporter implements Reporter {
  private readonly acceptanceRequirementsOverride:
    | readonly ToolcraftBrowserRuntimeRequirement[]
    | undefined;
  private readonly browserExecutionLedger:
    | ToolcraftBrowserExecutionLedgerTarget
    | undefined;
  private readonly checkpointReport:
    | ToolcraftBrowserRuntimeEvidenceReporterOptions["checkpointReport"]
    | undefined;
  private readonly featureVerificationPlan:
    | ToolcraftFeatureVerificationPlan
    | undefined;
  private readonly reportError: (error: string) => void;
  private readonly reportPerformance:
    | ((report: ToolcraftBrowserPerformanceReport) => void)
    | undefined;
  private readonly reportCheckpoint:
    | ((report: ToolcraftPerformanceCheckpointReport) => void)
    | undefined;
  private readonly targetedPerformanceReport:
    | ToolcraftBrowserRuntimeEvidenceReporterOptions["targetedPerformanceReport"]
    | undefined;
  private readonly performanceConfigOverride: ToolcraftPerformanceConfig | undefined;
  private readonly performanceRequirementsOverride:
    | readonly ToolcraftBrowserRuntimeRequirement[]
    | undefined;
  private readonly performanceSchemaOverride: ResolvedToolcraftAppSchema | undefined;

  private acceptanceRequirements: readonly ToolcraftBrowserRuntimeRequirement[] = [];
  private canonicalPaths: readonly ToolcraftPerformancePath[] = [];

  private performanceConfig: ToolcraftPerformanceConfig | undefined;
  private selectedTests: TestCase[] = [];
  private performanceRequirements: readonly ToolcraftBrowserRuntimeRequirement[] = [];
  private performanceSchema: ResolvedToolcraftAppSchema = appSchema;

  private validateFullAcceptance = false;
  private validateFullPerformance = false;
  private browserExecutionProjectRoot = "";

  constructor(options: ToolcraftBrowserRuntimeEvidenceReporterOptions = {}) {
    this.acceptanceRequirementsOverride = options.acceptanceRequirements;
    this.browserExecutionLedger = options.browserExecutionLedger;
    this.checkpointReport = options.checkpointReport;
    this.featureVerificationPlan =
      options.featureVerificationPlanSource === undefined
        ? environmentFeatureVerificationPlan
        : parseToolcraftFeatureVerificationPlanSource(
            options.featureVerificationPlanSource,
          );
    this.performanceConfigOverride = options.performanceConfig;
    this.performanceRequirementsOverride = options.performanceRequirements;
    this.performanceSchemaOverride = options.performanceSchema;
    this.reportError =
      options.reportError ??
      ((error) => console.error(`[toolcraft browser evidence] ${error}`));
    this.reportPerformance = options.reportPerformance;
    this.reportCheckpoint = options.reportCheckpoint;
    this.targetedPerformanceReport = options.targetedPerformanceReport;
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.browserExecutionProjectRoot = this.browserExecutionLedger
      ? getToolcraftPlaywrightProjectRoot(config)
      : "";
    this.selectedTests = suite.allTests();
    this.validateFullAcceptance = this.selectedTests.some(
      isProtectedAcceptanceMarker,
    );
    this.validateFullPerformance = this.selectedTests.some(
      isProtectedPerformanceMarker,
    );
    this.performanceSchema = this.performanceSchemaOverride ?? appSchema;
    const focusedScenariosByAcceptanceId = this.featureVerificationPlan
      ? new Map(
          this.featureVerificationPlan.scenarios.flatMap((scenario) =>
            scenario.acceptanceIds.map((acceptanceId) => [
              acceptanceId,
              scenario,
            ] as const),
          ),
        )
      : undefined;
    const acceptanceSource = focusedScenariosByAcceptanceId
      ? appAcceptance.flatMap((entry) => {
          const scenario = focusedScenariosByAcceptanceId.get(entry.id);
          return scenario
            ? [{
                ...entry,
                browser: {
                  budget: scenario.budget,
                  file: scenario.file,
                  testName: scenario.testName,
                },
              }]
            : [];
        })
      : appAcceptance;
    if (
      focusedScenariosByAcceptanceId &&
      (acceptanceSource.length !== focusedScenariosByAcceptanceId.size ||
        new Set(acceptanceSource.map(({ id }) => id)).size !==
          focusedScenariosByAcceptanceId.size)
    ) {
      throw new Error(
        "Toolcraft focused runtime evidence requires every selected acceptance id exactly once in current app source.",
      );
    }
    const acceptanceRequirements =
      this.acceptanceRequirementsOverride ??
      deriveToolcraftBrowserRuntimeRequirements(
        acceptanceSource,
        appSchema,
        appControlSectionInventory,
      );
    const focusedTestNames = this.featureVerificationPlan
      ? new Set(
          this.featureVerificationPlan.scenarios.map(({ testName }) => testName),
        )
      : undefined;
    this.acceptanceRequirements = focusedTestNames
      ? acceptanceRequirements.filter(({ testName }) =>
          focusedTestNames.has(testName),
        )
      : acceptanceRequirements;
    if (this.featureVerificationPlan === undefined) {
      const performanceConfig =
        this.performanceConfigOverride ?? appPerformance;
      if (performanceConfig === undefined) {
        throw new Error(
          "Toolcraft full browser evidence requires the current app performance config.",
        );
      }
      this.performanceConfig = performanceConfig;
      this.canonicalPaths = deriveToolcraftPerformancePaths(
        this.performanceSchema,
        this.performanceConfig,
      );
      this.performanceRequirements =
        this.performanceRequirementsOverride ??
        deriveToolcraftPerformancePathRuntimeRequirements(
          this.canonicalPaths,
          this.performanceSchema,
        );
    } else {
      this.performanceConfig = undefined;
      this.canonicalPaths = [];
      this.performanceRequirements = [];
    }
  }

  async onEnd(
    _result: FullResult,
  ): Promise<void | { status: "failed" }> {
    const selectedTitles = new Set(this.selectedTests.map((test) => test.title));
    const acceptanceRequirements = this.validateFullAcceptance
      ? this.acceptanceRequirements
      : this.acceptanceRequirements.filter((requirement) =>
          selectedTitles.has(requirement.testName),
        );
    const performanceRequirements = this.validateFullPerformance
      ? this.performanceRequirements
      : this.performanceRequirements.filter((requirement) =>
          selectedTitles.has(requirement.testName),
        );
    const errors = evaluateToolcraftBrowserRuntimeEvidence({
      requirements: [...acceptanceRequirements, ...performanceRequirements],
      tests: this.selectedTests.map(toRuntimeTest),
    });
    const performanceEvaluation = this.performanceConfig
      ? evaluateToolcraftBrowserPerformanceRun({
          canonicalPaths: this.canonicalPaths,
          checkpointReport: this.checkpointReport,
          performanceConfig: this.performanceConfig,
          performanceRequirements,
          performanceSchema: this.performanceSchema,
          resultStatus: _result.status,
          selectedTests: this.selectedTests,
          targetedPerformanceReport: this.targetedPerformanceReport,
          validateFullPerformance: this.validateFullPerformance,
        })
      : undefined;
    errors.push(...(performanceEvaluation?.errors ?? []));

    if (errors.length === 0) {
      if (performanceEvaluation?.performance) {
        this.reportPerformance?.(performanceEvaluation.performance);
      }
      if (this.checkpointReport && performanceEvaluation?.checkpoint) {
        writeToolcraftPerformanceCheckpointReport(
          this.checkpointReport.path,
          performanceEvaluation.checkpoint,
        );
        this.reportCheckpoint?.(performanceEvaluation.checkpoint);
      }
      if (
        this.targetedPerformanceReport &&
        performanceEvaluation?.measurements &&
        performanceEvaluation.targetedPaths
      ) {
        writeToolcraftTargetedPerformanceReportSync(
          this.targetedPerformanceReport.path,
          {
            fixtureResolutionMode:
              this.targetedPerformanceReport.fixtureResolutionMode,
            fixtureSelector: this.targetedPerformanceReport.fixtureSelector,
            nonce: this.targetedPerformanceReport.nonce,
            measurements: performanceEvaluation.measurements.observations,
            performancePassIds: uniqueSorted(
              this.targetedPerformanceReport.passIds,
            ),
            performancePathIds: uniqueSorted(
              performanceEvaluation.targetedPaths.map((path) => path.id),
            ),
            requestAuthorityHash:
              this.targetedPerformanceReport.requestAuthorityHash,
            sourceHash: this.targetedPerformanceReport.sourceHash,
            testNames: uniqueSorted(
              performanceEvaluation.targetedPaths.map(
                getToolcraftPerformancePathTestName,
              ),
            ),
          },
        );
      }
      if (this.browserExecutionLedger) {
        const ledger = createToolcraftBrowserExecutionLedger({
          nonce: this.browserExecutionLedger.nonce,
          resultStatus: _result.status,
          tests: this.selectedTests.map((test) =>
            createToolcraftBrowserExecutionLedgerTest(
              test,
              this.browserExecutionProjectRoot,
            ),
          ),
        });
        writeToolcraftBrowserExecutionLedgerSync(
          this.browserExecutionLedger,
          ledger,
        );
      }
      return undefined;
    }

    for (const error of errors) {
      this.reportError(error);
    }

    return { status: "failed" };
  }

  printsToStdio(): boolean {
    return false;
  }
}
