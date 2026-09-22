import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { FullConfig, TestCase } from "@playwright/test/reporter";

import {
  TOOLCRAFT_BROWSER_ACCEPTANCE_MARKER_TEST_NAME,
  TOOLCRAFT_BROWSER_PERFORMANCE_MARKER_TEST_NAME,
  type ToolcraftBrowserRuntimeRequirement,
} from "../src/app/test-evidence/browser-runtime-contract";
import {
  fakeSuite,
  fakeTestCase,
  passedResultWithEvidence,
} from "./browser-runtime-evidence-reporter-test-fixtures";
import ToolcraftBrowserRuntimeEvidenceReporter from "./browser-runtime-evidence-reporter";

const fakeRequirement: ToolcraftBrowserRuntimeRequirement = {
  evidenceType: "product-observable-change",
  requirementId: "appearance.opacity",
  testName: "browser: opacity changes product output",
};

const focusedPersistenceTestName =
  "browser: app restores exact canvas, values, and panel workspace slices after reload";
const focusedPersistencePlanSource = JSON.stringify({
  acceptanceIds: ["persistence.reload"],
  scenarios: [
    {
      acceptanceIds: ["persistence.reload"],
      budget: "extended-io",
      file: "e2e/app-controls.spec.ts",
      testName: focusedPersistenceTestName,
    },
  ],
  version: 2,
});

test("runtime evidence reporter fails full runs with a missing required test", async () => {
  const errors: string[] = [];
  const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
    acceptanceRequirements: [fakeRequirement],
    reportError: (error) => errors.push(error),
  });
  const marker = fakeTestCase({
    file: "/product/e2e/app-browser-runtime-evidence.spec.ts",
    title: TOOLCRAFT_BROWSER_ACCEPTANCE_MARKER_TEST_NAME,
  });

  reporter.onBegin?.({} as never, fakeSuite([marker]));
  const status = await reporter.onEnd?.({ status: "passed" } as never);

  expect(status).toEqual({ status: "failed" });
  expect(errors).toContainEqual(
    expect.stringContaining(
      `Missing required browser test "${fakeRequirement.testName}"`,
    ),
  );
});

test("runtime evidence reporter limits marker-free runs to selected declared tests", async () => {
  const secondRequirement: ToolcraftBrowserRuntimeRequirement = {
    ...fakeRequirement,
    requirementId: "appearance.color",
    testName: "browser: color changes product output",
  };
  const selectedTest = fakeTestCase({
    results: [passedResultWithEvidence(fakeRequirement)],
    title: fakeRequirement.testName,
  });
  const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
    acceptanceRequirements: [fakeRequirement, secondRequirement],
    reportError: () => undefined,
  });
  const unprotectedMarkerTitle = fakeTestCase({
    title: TOOLCRAFT_BROWSER_ACCEPTANCE_MARKER_TEST_NAME,
  });

  reporter.onBegin?.(
    {} as never,
    fakeSuite([unprotectedMarkerTitle, selectedTest]),
  );
  const status = await reporter.onEnd?.({ status: "passed" } as never);

  expect(status).toBeUndefined();
});

test("focused runtime evidence ignores unrelated requirements and performance configuration", async () => {
  const selectedRequirement: ToolcraftBrowserRuntimeRequirement = {
    evidenceType: "persistence-state",
    requirementId: "persistence.reload",
    testName: focusedPersistenceTestName,
  };
  const inaccessiblePerformanceConfig = new Proxy({} as never, {
    get() {
      throw new Error("focused run accessed unrelated performance config");
    },
  });
  const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
    acceptanceRequirements: [
      selectedRequirement,
      {
        evidenceType: "product-observable-change",
        requirementId: "unrelated.conflicting-descriptor",
        testName: "browser: unrelated conflicting descriptor",
      },
    ],
    featureVerificationPlanSource: focusedPersistencePlanSource,
    performanceConfig: inaccessiblePerformanceConfig,
    performanceSchema: new Proxy({} as never, {
      get() {
        throw new Error("focused run accessed unrelated performance schema");
      },
    }),
    reportError: () => undefined,
  });
  const selectedTest = fakeTestCase({
    results: [passedResultWithEvidence(selectedRequirement)],
    title: focusedPersistenceTestName,
  });

  expect(() =>
    reporter.onBegin?.({} as never, fakeSuite([selectedTest])),
  ).not.toThrow();
  expect(await reporter.onEnd?.({ status: "passed" } as never)).toBeUndefined();
});

test("focused canvas-handle scenario cannot pass without its export-clean evidence", async () => {
  const interactionRequirement: ToolcraftBrowserRuntimeRequirement = {
    evidenceType: "canvas-handle-interaction",
    requirementId: "persistence.reload",
    testName: focusedPersistenceTestName,
  };
  const exportCleanRequirement: ToolcraftBrowserRuntimeRequirement = {
    evidenceType: "canvas-export-clean",
    requirementId: "persistence.reload",
    testName: focusedPersistenceTestName,
  };
  const errors: string[] = [];
  const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
    acceptanceRequirements: [interactionRequirement, exportCleanRequirement],
    featureVerificationPlanSource: focusedPersistencePlanSource,
    reportError: (error) => errors.push(error),
  });
  const selectedTest = fakeTestCase({
    results: [passedResultWithEvidence(interactionRequirement)],
    title: focusedPersistenceTestName,
  });

  reporter.onBegin?.({} as never, fakeSuite([selectedTest]));
  expect(await reporter.onEnd?.({ status: "passed" } as never)).toEqual({
    status: "failed",
  });
  expect(errors.join("\n")).toMatch(/canvas-export-clean/iu);
});

test("runtime evidence reporter rejects unreachable evidence and runtime skips", async () => {
  const candidates = [
    fakeTestCase({
      results: [
        {
          attachments: [],
          retry: 0,
          status: "passed",
        } as TestCase["results"][number],
      ],
      title: fakeRequirement.testName,
    }),
    fakeTestCase({
      expectedStatus: "skipped",
      results: [
        {
          ...passedResultWithEvidence(fakeRequirement),
          status: "skipped",
        } as TestCase["results"][number],
      ],
      title: fakeRequirement.testName,
    }),
  ];

  for (const candidate of candidates) {
    const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
      acceptanceRequirements: [fakeRequirement],
      reportError: () => undefined,
    });

    reporter.onBegin?.({} as never, fakeSuite([candidate]));
    await expect(
      reporter.onEnd?.({ status: "passed" } as never),
    ).resolves.toEqual({ status: "failed" });
  }
});

test("performance marker requires every derived scenario evidence type", async () => {
  const performanceRequirements: ToolcraftBrowserRuntimeRequirement[] = [
    {
      evidenceType: "performance-measurement",
      requirementId: "preview-heavy",
      testName: "browser perf: preview heavy",
    },
    {
      evidenceType: "performance-budget",
      requirementId: "preview-heavy",
      testName: "browser perf: preview heavy",
    },
  ];
  const marker = fakeTestCase({
    file: "/product/e2e/app-browser-runtime-evidence.spec.ts",
    title: TOOLCRAFT_BROWSER_PERFORMANCE_MARKER_TEST_NAME,
  });
  const scenarioTest = fakeTestCase({
    results: [passedResultWithEvidence(performanceRequirements[0]!)],
    title: "browser perf: preview heavy",
  });
  const errors: string[] = [];
  const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
    acceptanceRequirements: [],
    performanceRequirements,
    reportError: (error) => errors.push(error),
  });

  reporter.onBegin?.({} as never, fakeSuite([marker, scenarioTest]));
  await expect(
    reporter.onEnd?.({ status: "passed" } as never),
  ).resolves.toEqual({ status: "failed" });
  expect(errors).toContainEqual(expect.stringContaining("performance-budget"));
});

test("performance reporter rejects missing warm and sustained raster quality evidence", async () => {
  const testName = "browser perf: toolcraft path performance-path:color";
  const requirements: ToolcraftBrowserRuntimeRequirement[] = [
    "cold",
    "warm",
    "sustained",
  ].map((phase) => ({
    evidenceType: "performance-render-scale",
    requirementId: `performance-path:color#${phase}`,
    target: "appearance.color",
    testName,
  }));
  const marker = fakeTestCase({
    file: "/product/e2e/app-browser-runtime-evidence.spec.ts",
    title: TOOLCRAFT_BROWSER_PERFORMANCE_MARKER_TEST_NAME,
  });
  const scenarioTest = fakeTestCase({
    results: [passedResultWithEvidence(requirements[0]!)],
    title: testName,
  });
  const errors: string[] = [];
  const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
    acceptanceRequirements: [],
    performanceRequirements: requirements,
    reportError: (error) => errors.push(error),
  });

  reporter.onBegin?.({} as never, fakeSuite([marker, scenarioTest]));
  await expect(
    reporter.onEnd?.({ status: "passed" } as never),
  ).resolves.toEqual({ status: "failed" });
  expect(errors).toContainEqual(expect.stringContaining("#warm"));
  expect(errors).toContainEqual(expect.stringContaining("#sustained"));
});

test("runtime evidence reporter requires render-scale proof for every covered state", async () => {
  const testName = "browser: canvas render scale backing pixels";
  const requirements: ToolcraftBrowserRuntimeRequirement[] = [
    "interaction",
    "playback",
    "steady",
  ].map((state) => ({
    evidenceType: "canvas-render-scale-backing",
    requirementId: `canvas.render-scale#${state}`,
    target: "canvas.renderScale",
    testName,
  }));
  const interaction = passedResultWithEvidence(requirements[0]!);
  const steady = passedResultWithEvidence(requirements[2]!);
  const result = {
    ...interaction,
    attachments: [...interaction.attachments, ...steady.attachments],
  } as TestCase["results"][number];
  const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
    acceptanceRequirements: requirements,
    reportError: () => undefined,
  });

  reporter.onBegin?.(
    {} as never,
    fakeSuite([fakeTestCase({ results: [result], title: testName })]),
  );

  await expect(
    reporter.onEnd?.({ status: "passed" } as never),
  ).resolves.toEqual({ status: "failed" });
});

test("runtime evidence reporter requires exact targets for layer base and specialized proof", async () => {
  const testName = "browser: layer order changes output";
  const requirements: ToolcraftBrowserRuntimeRequirement[] = [
    {
      evidenceType: "product-observable-change",
      requirementId: "layers.order",
      target: "layers.order",
      testName,
    },
    {
      evidenceType: "layer-reorder",
      requirementId: "layers.order",
      target: "layers.order",
      testName,
    },
  ];
  const resultFor = (
    evidence: readonly ToolcraftBrowserRuntimeRequirement[],
  ): TestCase["results"][number] => {
    const first = passedResultWithEvidence(evidence[0]!);
    return {
      ...first,
      attachments: evidence.flatMap(
        (requirement) => passedResultWithEvidence(requirement).attachments,
      ),
    } as TestCase["results"][number];
  };
  const evaluate = async (
    evidence: readonly ToolcraftBrowserRuntimeRequirement[],
  ) => {
    const errors: string[] = [];
    const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
      acceptanceRequirements: requirements,
      reportError: (error) => errors.push(error),
    });
    reporter.onBegin?.(
      {} as never,
      fakeSuite([
        fakeTestCase({
          results: [resultFor(evidence)],
          title: testName,
        }),
      ]),
    );
    return {
      errors,
      status: await reporter.onEnd?.({ status: "passed" } as never),
    };
  };

  const missingTarget = requirements.map(
    ({ target: _target, ...requirement }) => ({
      ...requirement,
    }),
  );
  const wrongTarget = requirements.map((requirement) => ({
    ...requirement,
    target: "layers.visibility",
  }));

  expect((await evaluate(missingTarget)).status).toEqual({ status: "failed" });
  expect((await evaluate(wrongTarget)).status).toEqual({ status: "failed" });
  expect(await evaluate(requirements)).toEqual({
    errors: [],
    status: undefined,
  });
});

test("browser execution ledger emits app-root canonical nested spec paths", async () => {
  const ledgerDirectory = mkdtempSync(
    path.join(tmpdir(), "toolcraft-browser-ledger-root-"),
  );
  const result = passedResultWithEvidence(fakeRequirement);
  const fileSuite = {
    location: {
      file: "/product/e2e/nested/product.spec.ts",
    },
    parent: undefined,
    type: "file",
  };
  const selectedTest = {
    expectedStatus: "passed",
    location: {
      column: 1,
      file: "/product/e2e/nested/product.spec.ts",
      line: 1,
    },
    outcome: () => "expected",
    parent: fileSuite,
    results: [result],
    title: fakeRequirement.testName,
    titlePath: () => [
      "",
      "e2e/nested/product.spec.ts",
      fakeRequirement.testName,
    ],
  } as unknown as TestCase;
  const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
    acceptanceRequirements: [fakeRequirement],
    browserExecutionLedger: {
      directory: ledgerDirectory,
      nonce: "ledger-nonce",
    },
    reportError: () => undefined,
  });

  try {
    reporter.onBegin?.(
      {
        configFile: "/product/playwright.config.ts",
        rootDir: "/product/e2e",
      } as FullConfig,
      fakeSuite([selectedTest]),
    );
    expect(await reporter.onEnd?.({ status: "passed" } as never)).toBeUndefined();
    const [ledgerFile] = readdirSync(ledgerDirectory);
    const ledger = JSON.parse(
      readFileSync(path.join(ledgerDirectory, ledgerFile!), "utf8"),
    );
    expect(ledger.tests[0].file).toBe("e2e/nested/product.spec.ts");
  } finally {
    rmSync(ledgerDirectory, { force: true, recursive: true });
  }
});

test("browser execution ledger rejects invalid project-root config through the shared invariant", () => {
  const reporter = new ToolcraftBrowserRuntimeEvidenceReporter({
    acceptanceRequirements: [],
    browserExecutionLedger: {
      directory: "/tmp/toolcraft-browser-ledger-invalid-root",
      nonce: "ledger-nonce",
    },
    reportError: () => undefined,
  });

  expect(() =>
    reporter.onBegin?.(
      {
        configFile: "playwright.config.ts",
        rootDir: "/app/e2e",
      } as FullConfig,
      fakeSuite([]),
    ),
  ).toThrow(
    "Toolcraft Playwright project root requires an absolute configFile.",
  );
});
