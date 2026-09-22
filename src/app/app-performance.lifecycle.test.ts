import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import {
  TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND,
  TOOLCRAFT_FULL_PERFORMANCE_VERIFICATION_COMMAND,
} from "../../scripts/toolcraft-performance-authority-policy.mjs";
import { requiredPackageScriptNames } from "../../scripts/toolcraft-integrity-policy.mjs";
import { isToolcraftFrameworkOwnedPath } from "../../scripts/toolcraft-source-ownership.mjs";

import { projectDir } from "./app-performance-test-utils";
import {
  createAgentWorklogFixture,
  getAgentWorklogValidationErrors,
} from "./app-acceptance.worklog-test-utils";

const expectedRequiredPackageScriptNames = [
  "ai:check", "build", "dev", "dev:restart", "docs:check", "preview",
  "preview:restart", "reference:study", "test", "test:browser", "test:feature", "typecheck",
  "verify:delivery", "verify:kernel", "verify:perf", "verify:receipt",
] as const;

describe("Toolcraft starter performance lifecycle", () => {
  it("publishes separate functional acceptance and performance gates", () => {
    const packageJson = JSON.parse(readFileSync(join(projectDir, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const generatedAppTestScript =
      packageJson.scripts?.["test:generated"] ?? packageJson.scripts?.test;

    expect(requiredPackageScriptNames).toEqual(expectedRequiredPackageScriptNames);
    for (const scriptName of requiredPackageScriptNames) {
      expect(packageJson.scripts?.[scriptName]).toBeDefined();
    }
    for (const removed of [
      "test:delivery", "verify:final", "verify:perf:record-iteration",
      "verify:quick", "verify:ui",
    ]) {
      expect(packageJson.scripts?.[removed]).toBeUndefined();
    }
    expect(packageJson.scripts?.["ai:check"]).toBe(
      "node scripts/check-toolcraft-code-health.mjs",
    );
    const sourceTestScript =
      "node scripts/check-toolcraft-docs.mjs && node --test scripts/*.test.mjs && vitest run src --passWithNoTests --reporter=default --reporter=./scripts/toolcraft-vitest-runtime-evidence-reporter.mjs";
    const generatedTestScript =
      "node scripts/check-toolcraft-docs.mjs && node scripts/check-toolcraft-integrity.mjs && node --test scripts/*.test.mjs && vitest run src --passWithNoTests --reporter=default --reporter=./scripts/toolcraft-vitest-runtime-evidence-reporter.mjs";
    if (packageJson.scripts?.["test:generated"]) {
      expect(packageJson.scripts.test).toBe(sourceTestScript);
      expect(packageJson.scripts["test:generated"]).toBe(generatedTestScript);
    } else {
      expect(packageJson.scripts?.test).toBe(generatedTestScript);
    }

    expect(
      generatedAppTestScript,
      "Generated app tests must invoke the Toolcraft integrity checker.",
    ).toContain("node scripts/check-toolcraft-integrity.mjs");
    expect(
      packageJson.scripts?.["test:browser"],
      "Generated apps must keep measured performance and kernel benchmark scenarios out of the default browser acceptance gate.",
    ).toBe(
      'playwright install chromium && playwright test --grep-invert "browser perf:|toolcraft kernel:"',
    );
    expect(packageJson.scripts?.["test:browser:perf"]).toBeUndefined();
    expect(packageJson.scripts?.["test:feature"]).toBe(
      "node scripts/run-feature-verification.mjs",
    );
    const featureRunner = readFileSync(
      join(projectDir, "scripts/run-feature-verification.mjs"),
      "utf8",
    );
    const playwrightConfig = readFileSync(
      join(projectDir, "playwright.config.ts"),
      "utf8",
    );
    const productTestFacade = readFileSync(
      join(projectDir, "e2e/toolcraft-product-test.ts"),
      "utf8",
    );
    expect(playwrightConfig).toContain(
      "toolcraft-feature-verification-reporter.ts",
    );
    expect(featureRunner).toContain(
      "loadToolcraftFeatureVerificationPlanInIsolatedProcess",
    );
    expect(featureRunner).toMatch(
      /new Set\(\s*featurePlan\.scenarios\.map\(\(\{ file \}\) => file\)\s*\)/u,
    );
    expect(featureRunner).toMatch(/"test",\s*\.\.\.fileFilters/u);
    expect(featureRunner).toMatch(
      /path\s*\.resolve\(projectDir, file\)[\s\S]*return `\/\^\$\{escapedAbsoluteFile\}\$\/`/u,
    );
    expect(featureRunner).not.toMatch(
      /createToolcraftFeatureBrowserSelection|toolcraft-feature-browser-selection|\.\.\.selection\.files/u,
    );
    expect(featureRunner).not.toContain("grepTitle");
    expect(featureRunner).toContain("--workers=1");
    expect(featureRunner).toContain("TOOLCRAFT_BROWSER_PROOF_TIMEOUT_MS");
    expect(featureRunner.match(/dependencies\.runProcess\(/gu)).toHaveLength(1);
    expect(featureRunner).not.toMatch(
      /Promise\.all|--list|resolveToolcraftPlaywrightTestTitles|captureToolcraftProofProcess|runToolcraftProofPackageScript|verify:delivery|verify:perf|test:browser|run-delivery|run-browser-performance|receipt/iu,
    );
    expect(productTestFacade).toMatch(
      /const selectedProductTestBudgets\s*=[\s\S]*new Map\([\s\S]*\.scenarios\.map\(\(\{ budget, testName \}\)/u,
    );
    expect(productTestFacade).toContain(
      "selectedProductTestBudgets?.get(title)",
    );
    expect(productTestFacade).toContain("TOOLCRAFT_BROWSER_PROOF_TIMEOUT_MS");
    expect(productTestFacade).toContain(
      "testInfo.setTimeout(TOOLCRAFT_BROWSER_PROOF_TIMEOUT_MS[budget])",
    );
    expect(productTestFacade).not.toContain("registerProductTest.setTimeout");
    const performanceRunner = readFileSync(
      join(projectDir, "scripts/run-browser-performance.mjs"),
      "utf8",
    );
    const receiptModule = readFileSync(
      join(projectDir, "scripts/toolcraft-verification-receipt.mjs"),
      "utf8",
    );
    const deliveryRunner = readFileSync(
      join(projectDir, "scripts/run-delivery-verification.mjs"),
      "utf8",
    );
    const deliveryLifecycle = readFileSync(
      join(projectDir, "scripts/toolcraft-delivery-lifecycle.mjs"),
      "utf8",
    );
    const proofProcess = readFileSync(
      join(projectDir, "scripts/toolcraft-proof-process.mjs"),
      "utf8",
    );
    const deliveryReceiptModule = readFileSync(
      join(projectDir, "scripts/toolcraft-delivery-receipt.mjs"),
      "utf8",
    );
    expect(performanceRunner).toContain("runToolcraftFullPerformanceCertification");
    expect(performanceRunner).not.toContain("runToolcraftDeliveryVerification");
    expect(performanceRunner).not.toContain("--reason=");
    expect(performanceRunner).toContain("withToolcraftVerificationLock");
    expect(performanceRunner).toContain("measureToolcraftPerformanceCheckpoint");
    expect(performanceRunner).not.toContain("writeCheckpointFile");
    expect(receiptModule).not.toContain(
      "export async function writeToolcraftPerformanceReceipt",
    );
    expect(deliveryReceiptModule).not.toContain(
      "export async function writeToolcraftDeliveryReceipt",
    );
    expect(packageJson.scripts?.["verify:delivery"]).toBe(
      "node scripts/run-delivery-verification.mjs",
    );
    expect(deliveryRunner).toContain("executeToolcraftDeliveryLifecycle");
    expect(deliveryRunner).toContain("withToolcraftVerificationLock");
    expect(deliveryLifecycle).toContain("executeToolcraftDeliveryLifecycleCore");
    expect(deliveryLifecycle).toContain("executeToolcraftDeliveryPlan");
    expect(deliveryLifecycle).not.toContain("runToolcraftFullPerformanceCertification");
    expect(deliveryLifecycle).not.toContain("measureToolcraftPerformanceCheckpoint");
    expect(proofProcess).toContain('from "cross-spawn"');
    expect(proofProcess).toContain("ensureToolcraftChromium");
    const deliverySources = `${deliveryRunner}\n${deliveryLifecycle}`;
    expect(deliverySources).not.toContain('runPackageScript(projectDir, "verify:quick")');
    expect(deliverySources).not.toContain('runPackageScript(projectDir, "verify:final")');
    expect(deliverySources).not.toContain('runPackageScript(projectDir, "verify:perf")');
    expect(packageJson.scripts?.["verify:perf"]).toBe(
      "node scripts/run-browser-performance.mjs",
    );
    expect(packageJson.scripts?.["verify:perf:playwright"]).toBeUndefined();
    expect(packageJson.scripts?.["verify:perf:refresh"]).toBeUndefined();
    expect(packageJson.scripts?.["verify:perf:record-agent-browser"]).toBeUndefined();
    expect(packageJson.scripts?.["verify:perf:record-iteration"]).toBeUndefined();
    expect(packageJson.scripts?.["verify:kernel"]).toBe(
      "node scripts/run-kernel-benchmarks.mjs",
    );
    const deliveryExecutor = readFileSync(
      join(projectDir, "scripts/toolcraft-delivery-executor.mjs"),
      "utf8",
    );
    const targetedPerformanceExecution = readFileSync(
      join(projectDir, "scripts/toolcraft-targeted-performance-execution.mjs"),
      "utf8",
    );
    expect(
      deliveryExecutor.match(
        /TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR: "development"/g,
      ),
    ).toBeNull();
    expect(
      targetedPerformanceExecution.match(
        /TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR: "development"/g,
      ),
    ).toHaveLength(1);
    expect(packageJson.scripts?.["verify:perf:record-exemption"]).toBeUndefined();
    expect(receiptModule).not.toContain('command === "record-iteration"');
    expect(packageJson.scripts?.["verify:receipt"]).toContain("validate");
  });

  function readDeliveryRoutingDocs() {
    const routedDocs = [
      "AGENTS.md",
      "docs/toolcraft/README.md",
      "docs/toolcraft/acceptance-testing.md",
      "docs/toolcraft/agent-worklog.md",
      "docs/toolcraft/assembly-workflow.md",
      "docs/toolcraft/core/performance.md",
      "docs/toolcraft/performance.md",
      "docs/toolcraft/workflow.md",
    ];
    return routedDocs.map((relativePath) => ({
      relativePath,
      source: readFileSync(join(projectDir, relativePath), "utf8"),
    }));
  }

  function expectDeliveryRoutingDocs(
    sources: readonly { relativePath: string; source: string }[],
  ) {
    const docSources = sources.filter(({ relativePath }) =>
      isToolcraftFrameworkOwnedPath(relativePath),
    );
    for (const { relativePath, source } of docSources) {
      expect(source, relativePath).toMatch(/first (?:product )?delivery/i);
      expect(source, relativePath).toMatch(/later[^\n]{0,60}(?:edits|feature work)/i);
      expect(source, relativePath).toMatch(
        /(?:performance complaint|localized complaint)/i,
      );
      expect(source, relativePath).toMatch(
        /(?:full[- ]audit|complete (?:performance )?(?:audit|review))/i,
      );
      expect(source, relativePath).toContain(
        TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND,
      );
      expect(source, relativePath).toContain(
        TOOLCRAFT_FULL_PERFORMANCE_VERIFICATION_COMMAND,
      );
    }

    const allRoutedDocs = docSources.map(({ source }) => source).join("\n");
    const nonAgentsDocs = docSources
      .filter(({ relativePath }) => relativePath !== "AGENTS.md")
      .map(({ source }) => source)
      .join("\n");
    expect(nonAgentsDocs).not.toMatch(/\bTier (?:N|[0-4])\b/);
    expect(allRoutedDocs).not.toMatch(
      /verify:quick|verify:ui|verify:final|verify:perf:record-iteration|test:delivery/,
    );
    expect(allRoutedDocs).not.toMatch(
      /verify:delivery\s+--|--tier|--unit-test|--browser-test|--performance-test/,
    );
    expect(allRoutedDocs).not.toMatch(
      /performance modules require protected evidence|(?:add|run)[^\n]*affected path performance checks[^\n]*when an edit changes|during development[^\n]*affected performance scenarios|targeted performance scenarios only for touched/i,
    );
    expect(allRoutedDocs).toMatch(
      /only exact request authority[^\n]*measured targeted performance/i,
    );
    expect(allRoutedDocs).not.toMatch(/matching (?:executed )?`?Run\b`?/i);
    expect(allRoutedDocs).not.toContain("app-performance-impact.json");
  }

  it("documents adaptive delivery routing without command-shaped authority", () => {
    expectDeliveryRoutingDocs(readDeliveryRoutingDocs());
  });

  it("allows a valid product worklog to record its required first-delivery tier", () => {
    const source = createAgentWorklogFixture({
      verificationLines: [
        "Verification tier: Tier 4",
        "Reason: First generated product delivery with renderer and image export.",
        "Run: pnpm verify:delivery",
        "Skip: Measured performance; no performance work was requested.",
      ],
    });
    expect(getAgentWorklogValidationErrors(source)).toEqual([]);
    expectDeliveryRoutingDocs(
      readDeliveryRoutingDocs().map((doc) =>
        doc.relativePath === "docs/toolcraft/agent-worklog.md"
          ? { ...doc, source }
          : doc,
      ),
    );
  });

  it("does not treat product workflow observations as framework routing policy", () => {
    expectDeliveryRoutingDocs([
      ...readDeliveryRoutingDocs(),
      {
        relativePath: "docs/toolcraft/workflow-observation.md",
        source: "# Workflow observation\n\nInitial Tier 4 functional proof passed.",
      },
    ]);
  });

  it.each([
    "Run pnpm verify:quick before delivery.",
    "Run pnpm verify:delivery --tier=4.",
    "Verification tier: Tier 4",
  ])("still rejects obsolete framework routing guidance: %s", (obsolete) => {
    const docs = readDeliveryRoutingDocs().map((doc) =>
      doc.relativePath === "docs/toolcraft/workflow.md"
        ? { ...doc, source: `${doc.source}\n${obsolete}` }
        : doc,
    );
    expect(() => expectDeliveryRoutingDocs(docs)).toThrow();
  });

  it("keeps workload guidance structural instead of prescribing domain constants", () => {
    const monorepoRoot = join(projectDir, "..");
    const documentation = [
      join(projectDir, "AGENTS.md"),
      join(projectDir, "docs/toolcraft/core/performance.md"),
      join(projectDir, "docs/toolcraft/performance.md"),
      join(projectDir, "docs/toolcraft/renderer-technique.md"),
      join(projectDir, "docs/toolcraft/assembly-workflow.md"),
      join(projectDir, "docs/toolcraft/workflow.md"),
      join(monorepoRoot, "apps/website/src/content/docs/toolcraft-core-performance.md"),
      join(monorepoRoot, "apps/website/src/content/docs/toolcraft-performance.md"),
      join(monorepoRoot, "apps/website/src/content/docs/toolcraft-renderer-technique.md"),
      join(monorepoRoot, "apps/website/src/content/docs/toolcraft-assembly-workflow.md"),
      join(monorepoRoot, "apps/website/src/content/docs/toolcraft-workflow.md"),
    ]
      .filter((filePath) => existsSync(filePath))
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");

    expect(documentation).toMatch(/reachable controls and inputs/i);
    expect(documentation).toMatch(/workload dimensions and enforced boundaries/i);
    expect(documentation).toMatch(
      /render-plan assessment(?: and| with).*protected kernel benchmark/i,
    );
    expect(documentation).toMatch(/derived paths and combined fixtures/i);
    expect(documentation).not.toMatch(/50_000|1_000\s+lines|1920x1080-equivalent/i);
    expect(documentation).not.toMatch(/classif(?:y|ication)[^\n]*(?:key name|key-name|keyword)/i);
    expect(documentation).not.toMatch(
      /bitmap-media|halftone|per-pixel|max text length|max media size/i,
    );
    expect(documentation).toMatch(/exact normalized development pressure `0\.8`/i);
    expect(documentation).toMatch(/exhaustive-discrete/i);
    expect(documentation).toMatch(/match(?:es)? every option one-to-one/i);
    expect(documentation).toMatch(/toolcraftDiscreteCombinationBudget/);
    expect(documentation).toMatch(/toolcraftDiscreteDimensionBudget/);
    expect(documentation).toMatch(/bypasses search budgets because no (?:combination )?search runs/i);
    expect(documentation).toMatch(/planning error/i);
    expect(documentation).toMatch(/TOOLCRAFT_PERFORMANCE_VERIFICATION_LIFECYCLE/);
    expect(documentation).toMatch(/exactly one scenario (?:for|per) (?:every )?(?:canonical |derived )?path/i);
    expect(documentation).toMatch(/targeted failure[^\n]*(?:not|rather than)[^\n]*full[- ]suite/i);
    expect(documentation).toMatch(
      /first product delivery[^\n]*full functional acceptance[^\n]*no measured performance/i,
    );
    expect(documentation).toMatch(
      /later(?: ordinary)? edits[^\n]*(?:focused|directly relevant|feature-focused)/i,
    );
    expect(documentation).toMatch(
      /complaint[^\n]*one-authority-targeted-performance-iteration/i,
    );
    expect(documentation).toMatch(/full-performance/i);
    expect(documentation).toMatch(/needs-agent-judgment/i);
    expect(documentation).toMatch(
      /repeated bare command[^\n]*protected no-op/i,
    );
    expect(documentation).not.toMatch(
      /first stable[^\n]*(?:full performance|full checkpoint|baseline)/i,
    );
    expect(documentation).not.toMatch(/compatibility mode|legacy preferred|legacy-only/i);
    expect(documentation).not.toMatch(/loadProfile|smoothTargetRatio/i);
    expect(documentation).not.toMatch(/without exceeding development pressure/i);
    expect(documentation).not.toMatch(/\breachableValues\b/);
  });
});
