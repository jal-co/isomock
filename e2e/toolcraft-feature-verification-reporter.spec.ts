import { expect, test } from "@playwright/test";
import type {
  FullConfig,
  FullResult,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

import ToolcraftFeatureVerificationReporter from "./toolcraft-feature-verification-reporter";

const standardScenario = Object.freeze({
  acceptanceIds: Object.freeze(["material.layer"]),
  budget: "standard" as const,
  file: "e2e/app-controls.spec.ts",
  testName: "browser: material.layer",
});
const extendedScenario = Object.freeze({
  acceptanceIds: Object.freeze(["persistence.reload"]),
  budget: "extended-io" as const,
  file: "e2e/app-persistence.spec.ts",
  testName: "browser: persistence reload",
});

function createPlan(
  scenarios: readonly (typeof standardScenario | typeof extendedScenario)[] = [
    standardScenario,
  ],
) {
  return Object.freeze({
    acceptanceIds: Object.freeze(
      scenarios.flatMap(({ acceptanceIds }) => acceptanceIds).sort(),
    ),
    scenarios: Object.freeze([...scenarios]),
    version: 2 as const,
  });
}

function createTestCase(file: string, title: string): TestCase {
  const fileSuite = {
    location: { column: 1, file: `/app/${file}`, line: 1 },
    parent: undefined,
    type: "file",
  };
  return { parent: fileSuite, title } as unknown as TestCase;
}

function createSuite(
  entries: readonly Readonly<{ file: string; title: string }>[],
): Suite {
  return {
    allTests: () =>
      entries.map(({ file, title }) => createTestCase(file, title)),
  } as unknown as Suite;
}

function createReporter(planSource = JSON.stringify(createPlan())) {
  const errors: string[] = [];
  const reporter = new ToolcraftFeatureVerificationReporter({
    planSource,
    writeError: (source) => errors.push(source),
  });
  return { errors, reporter };
}

const config = {
  configFile: "/app/playwright.config.ts",
  rootDir: "/app/e2e",
} as FullConfig;
const fullResult = { status: "passed" } as FullResult;

function testResult(
  status: TestResult["status"] = "passed",
  duration = 1,
): TestResult {
  return { duration, status } as TestResult;
}

test("passes only after every exact selected identity passes once", async () => {
  const plan = createPlan([standardScenario, extendedScenario]);
  const { errors, reporter } = createReporter(JSON.stringify(plan));
  const suite = createSuite(
    plan.scenarios.map(({ file, testName }) => ({ file, title: testName })),
  );

  reporter.onBegin(config, suite);
  reporter.onTestEnd(
    createTestCase(standardScenario.file, standardScenario.testName),
    testResult("passed", 30_000),
  );
  reporter.onTestEnd(
    createTestCase(extendedScenario.file, extendedScenario.testName),
    testResult("passed", 120_000),
  );

  await expect(reporter.onEnd(fullResult)).resolves.toBeUndefined();
  expect(errors).toEqual([]);
});

test("fails exact suite equality for missing, duplicate, and extra identities", async () => {
  const fixtures = [
    [],
    [
      { file: standardScenario.file, title: standardScenario.testName },
      { file: standardScenario.file, title: standardScenario.testName },
    ],
    [
      { file: standardScenario.file, title: standardScenario.testName },
      { file: "e2e/extra.spec.ts", title: "browser: extra" },
    ],
  ];

  for (const entries of fixtures) {
    const { errors, reporter } = createReporter();
    reporter.onBegin(config, createSuite(entries));
    await expect(reporter.onEnd(fullResult)).resolves.toEqual({
      status: "failed",
    });
    expect(errors.join("\n")).toMatch(/exact selected browser scenario set/iu);
  }
});

test("fails skipped, interrupted, and failed selected scenarios", async () => {
  for (const status of ["skipped", "interrupted", "failed"] as const) {
    const { errors, reporter } = createReporter();
    const selectedTest = createTestCase(
      standardScenario.file,
      standardScenario.testName,
    );
    reporter.onBegin(
      config,
      createSuite([
        { file: standardScenario.file, title: standardScenario.testName },
      ]),
    );
    reporter.onTestEnd(selectedTest, testResult(status));
    await expect(reporter.onEnd(fullResult)).resolves.toEqual({
      status: "failed",
    });
    expect(errors.join("\n")).toContain(status);
  }
});

test("enforces each scenario named budget duration", async () => {
  for (const fixture of [
    { duration: 30_001, scenario: standardScenario },
    { duration: 120_001, scenario: extendedScenario },
  ]) {
    const plan = createPlan([fixture.scenario]);
    const { errors, reporter } = createReporter(JSON.stringify(plan));
    const selectedTest = createTestCase(
      fixture.scenario.file,
      fixture.scenario.testName,
    );
    reporter.onBegin(
      config,
      createSuite([
        { file: fixture.scenario.file, title: fixture.scenario.testName },
      ]),
    );
    reporter.onTestEnd(selectedTest, testResult("passed", fixture.duration));
    await expect(reporter.onEnd(fullResult)).resolves.toEqual({
      status: "failed",
    });
    expect(errors.join("\n")).toMatch(/duration.*budget/iu);
  }
});

test("fails malformed plan and containing-file preparation errors", async () => {
  for (const fixture of [
    {
      planSource: "not-json",
      suite: createSuite([
        { file: standardScenario.file, title: standardScenario.testName },
      ]),
    },
    {
      planSource: JSON.stringify(createPlan()),
      suite: {
        allTests: () => [{ title: standardScenario.testName }],
      } as unknown as Suite,
    },
  ]) {
    const { errors, reporter } = createReporter(fixture.planSource);
    reporter.onBegin(config, fixture.suite);
    await expect(reporter.onEnd(fullResult)).resolves.toEqual({
      status: "failed",
    });
    expect(errors).toHaveLength(1);
  }
});

test("fails invalid project-root config through the shared invariant", async () => {
  const { errors, reporter } = createReporter();
  reporter.onBegin(
    { configFile: "playwright.config.ts", rootDir: "/app/e2e" } as FullConfig,
    createSuite([
      { file: standardScenario.file, title: standardScenario.testName },
    ]),
  );

  await expect(reporter.onEnd(fullResult)).resolves.toEqual({
    status: "failed",
  });
  expect(errors.join("\n")).toContain(
    "Toolcraft Playwright project root requires an absolute configFile.",
  );
});

test("fails a duplicate onTestEnd callback", async () => {
  const { errors, reporter } = createReporter();
  const selectedTest = createTestCase(
    standardScenario.file,
    standardScenario.testName,
  );
  reporter.onBegin(
    config,
    createSuite([
      { file: standardScenario.file, title: standardScenario.testName },
    ]),
  );
  reporter.onTestEnd(selectedTest, testResult());
  reporter.onTestEnd(selectedTest, testResult());
  await expect(reporter.onEnd(fullResult)).resolves.toEqual({ status: "failed" });
  expect(errors.join("\n")).toMatch(/exactly once|duplicate/iu);
});

test("fails when callbacks end before begin", async () => {
  const selectedTest = createTestCase(
    standardScenario.file,
    standardScenario.testName,
  );
  for (const invoke of [
    (reporter: ToolcraftFeatureVerificationReporter) =>
      reporter.onTestEnd(selectedTest, testResult()),
    (_reporter: ToolcraftFeatureVerificationReporter) => undefined,
  ]) {
    const { errors, reporter } = createReporter();
    invoke(reporter);
    await expect(reporter.onEnd(fullResult)).resolves.toEqual({
      status: "failed",
    });
    expect(errors.join("\n")).toMatch(/onBegin lifecycle/iu);
  }
});
