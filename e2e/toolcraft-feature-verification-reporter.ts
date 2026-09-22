import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

import {
  getToolcraftPlaywrightContainingFile,
  getToolcraftPlaywrightProjectRoot,
} from "../scripts/playwright-containing-file.mjs";
import {
  parseToolcraftFeatureVerificationPlanSource,
  type ToolcraftFeatureVerificationPlan,
} from "../scripts/toolcraft-feature-verification-plan.mjs";
import { TOOLCRAFT_BROWSER_PROOF_TIMEOUT_MS } from "../src/app/acceptance/browser-proof-policy.mjs";

export const TOOLCRAFT_FEATURE_VERIFICATION_PLAN_ENV =
  "TOOLCRAFT_FEATURE_VERIFICATION_PLAN";

type ToolcraftFeatureVerificationReporterState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ error: unknown; kind: "preparation-failed" }>
  | Readonly<{
      completed: Set<string>;
      expected: ReadonlyMap<
        string,
        ToolcraftFeatureVerificationPlan["scenarios"][number]
      >;
      kind: "running";
      projectRoot: string;
    }>
  | Readonly<{ kind: "finished" }>;

type ToolcraftFeatureVerificationReporterOptions = Readonly<{
  planSource?: string;
  writeError?: (source: string) => void;
}>;

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause =
    error.cause === undefined ? "" : `\nCaused by: ${describeError(error.cause)}`;
  return `${error.stack ?? `${error.name}: ${error.message}`}${cause}`;
}

function getIdentity(file: string, testName: string): string {
  return `${file}\u0000${testName}`;
}

function getActualIdentity(testCase: TestCase, projectRoot: string): string {
  return getIdentity(
    getToolcraftPlaywrightContainingFile(testCase, projectRoot),
    testCase.title,
  );
}

function requireExactSelectedSuite(
  plan: ToolcraftFeatureVerificationPlan,
  suite: Suite,
  projectRoot: string,
): ReadonlyMap<string, ToolcraftFeatureVerificationPlan["scenarios"][number]> {
  const expected = new Map(
    plan.scenarios.map((scenario) => [
      getIdentity(scenario.file, scenario.testName),
      scenario,
    ]),
  );
  const actualIdentities = suite
    .allTests()
    .map((testCase) => getActualIdentity(testCase, projectRoot));
  const actual = new Set(actualIdentities);
  const missing = [...expected.keys()].filter(
    (identity) => !actual.has(identity),
  );
  const extra = [...actual].filter((identity) => !expected.has(identity));
  const hasDuplicates = actual.size !== actualIdentities.length;
  if (missing.length > 0 || extra.length > 0 || hasDuplicates) {
    throw new Error(
      "Playwright suite must equal the exact selected browser scenario set with each identity present once.",
    );
  }
  return expected;
}

export default class ToolcraftFeatureVerificationReporter implements Reporter {
  private readonly planSource: string | undefined;
  private state: ToolcraftFeatureVerificationReporterState = { kind: "idle" };
  private readonly writeError: (source: string) => void;

  constructor(options: ToolcraftFeatureVerificationReporterOptions = {}) {
    this.planSource =
      options.planSource !== undefined
        ? options.planSource
        : process.env[TOOLCRAFT_FEATURE_VERIFICATION_PLAN_ENV];
    this.writeError =
      options.writeError ?? ((source) => process.stderr.write(source));
  }

  onBegin(config: FullConfig, suite: Suite): void {
    if (this.state.kind !== "idle") {
      this.fail(
        new Error("Toolcraft feature verification received duplicate onBegin."),
      );
      return;
    }
    try {
      const plan = parseToolcraftFeatureVerificationPlanSource(this.planSource);
      const projectRoot = getToolcraftPlaywrightProjectRoot(config);
      this.state = {
        completed: new Set(),
        expected: requireExactSelectedSuite(plan, suite, projectRoot),
        kind: "running",
        projectRoot,
      };
    } catch (error) {
      this.fail(error);
    }
  }

  onTestEnd(testCase: TestCase, result: TestResult): void {
    if (this.state.kind === "idle") {
      this.fail(
        new Error(
          "Toolcraft feature verification reporter did not receive a complete onBegin lifecycle before onTestEnd.",
        ),
      );
      return;
    }
    if (this.state.kind !== "running") {
      if (this.state.kind === "finished") {
        this.fail(
          new Error(
            "Toolcraft feature verification received a callback after finish.",
          ),
        );
      }
      return;
    }

    try {
      const identity = getActualIdentity(testCase, this.state.projectRoot);
      const scenario = this.state.expected.get(identity);
      if (!scenario) {
        throw new Error(
          `Toolcraft feature verification received an unselected scenario callback: ${testCase.title}.`,
        );
      }
      if (this.state.completed.has(identity)) {
        throw new Error(
          `Toolcraft feature verification scenario must complete exactly once: ${testCase.title}.`,
        );
      }
      this.state.completed.add(identity);
      if (result.status !== "passed") {
        throw new Error(
          `Toolcraft feature verification scenario "${testCase.title}" ended with status ${result.status}.`,
        );
      }
      const timeoutMs = TOOLCRAFT_BROWSER_PROOF_TIMEOUT_MS[scenario.budget];
      if (result.duration > timeoutMs) {
        throw new Error(
          `Toolcraft feature verification scenario "${testCase.title}" duration ${result.duration}ms exceeded its ${scenario.budget} budget of ${timeoutMs}ms.`,
        );
      }
    } catch (error) {
      this.fail(error);
    }
  }

  async onEnd(result: FullResult): Promise<{ status: "failed" } | void> {
    const state = this.state;
    if (state.kind === "idle") {
      return this.finishWithFailure(
        new Error(
          "Toolcraft feature verification reporter did not receive a complete onBegin lifecycle.",
        ),
      );
    }
    if (state.kind === "preparation-failed") {
      return this.finishWithFailure(state.error);
    }
    if (state.kind === "finished") {
      return this.finishWithFailure(
        new Error("Toolcraft feature verification received duplicate onEnd."),
      );
    }
    const missingCount = state.expected.size - state.completed.size;
    if (missingCount !== 0) {
      return this.finishWithFailure(
        new Error(
          `Toolcraft feature verification ended before ${missingCount} selected scenario callback(s) completed.`,
        ),
      );
    }
    if (result.status !== "passed") {
      return this.finishWithFailure(
        new Error(
          `Toolcraft feature verification run ended with status ${result.status}.`,
        ),
      );
    }
    this.state = { kind: "finished" };
  }

  private fail(error: unknown): void {
    this.state = { error, kind: "preparation-failed" };
  }

  private finishWithFailure(error: unknown): { status: "failed" } {
    this.state = { kind: "finished" };
    this.writeError(
      `Toolcraft feature verification execution failed:\n${describeError(error)}\n`,
    );
    return { status: "failed" };
  }

  printsToStdio(): boolean {
    return true;
  }
}
