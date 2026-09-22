import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  TOOLCRAFT_PERFORMANCE_VERIFICATION_LIFECYCLE,
  TOOLCRAFT_FUNCTIONAL_PERFORMANCE_COVERAGE_POLICY,
  assessToolcraftRenderPlan,
  collectToolcraftWorkloadControls,
  collectToolcraftUnclassifiedPerformanceControls,
  type ToolcraftEnvelopePerformanceConfig,
  validateToolcraftPerformanceCoverage,
} from "@/toolcraft/runtime";
import {
  createToolcraftScriptLineBudgetPolicy,
  getToolcraftScriptProductionEntryPaths,
  toolcraftScriptSourceExtensions,
} from "../../scripts/toolcraft-delivery-architecture-policy.mjs";
import { evaluateCodeHealth } from "../../scripts/toolcraft-code-health-core.mjs";

import { appPerformance } from "./app-performance";
import { appSchema } from "./app-schema";
import {
  createToolcraftTypeScriptSourceAnalysis,
  e2eDir,
  getToolcraftImportedBinding,
  playwrightConfigForbidsFocusedTests,
  projectDir,
  toolcraftExpressionReferencesImport,
} from "./app-performance-test-utils";

async function evaluateGeneratedScriptBudgets(rootDir: string) {
  return evaluateCodeHealth({
    ...createToolcraftScriptLineBudgetPolicy("scripts"),
    productionEntryPaths: getToolcraftScriptProductionEntryPaths("scripts"),
    rootDir,
    sourceExtensions: toolcraftScriptSourceExtensions,
    sourceRoots: ["scripts"],
  });
}

function collectObjectPropertyAssignments(
  value: ts.ObjectLiteralExpression,
): ReadonlyMap<string, ts.Expression> {
  const properties = new Map<string, ts.Expression>();
  for (const property of value.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      properties.set(property.name.text, property.name);
      continue;
    }
    if (
      !ts.isPropertyAssignment(property) ||
      (!ts.isIdentifier(property.name) &&
        !ts.isStringLiteralLike(property.name))
    ) {
      continue;
    }
    properties.set(property.name.text, property.initializer);
  }
  return properties;
}

function collectPerformanceSpecFacts(source: string, fileName: string) {
  const analysis = createToolcraftTypeScriptSourceAnalysis(source, fileName);
  function importedBinding(
    expression: ts.Expression | undefined,
  ): Readonly<{ importedName: string; specifier: string }> | undefined {
    return getToolcraftImportedBinding(analysis, expression);
  }

  const compilerCalls = analysis.importedCalls.filter(
    ({ target }) =>
      target.specifier === "./performance-path-adapter-matrix" &&
      target.importedName ===
        "compileToolcraftPerformancePathAdapterMatrix" &&
      target.memberPath === "",
  );
  const compilerBoundaries = compilerCalls.map(({ call }) => {
    const [input] = call.arguments;
    const properties =
      input && ts.isObjectLiteralExpression(input)
        ? collectObjectPropertyAssignments(input)
        : new Map<string, ts.Expression>();
    const paths = properties.get("paths");
    const canvasBackingBinding = importedBinding(
      properties.get("canvasBacking"),
    );
    const schemaBinding = importedBinding(properties.get("schema"));
    return Object.freeze({
      adaptersFromCatalog: properties.has("adapters")
        ? toolcraftExpressionReferencesImport(
            analysis,
            properties.get("adapters"),
            {
              importedName: "appPerformancePathAdapters",
              specifier: "./app-performance-path-adapters",
            },
          )
        : false,
      canvasBackingFromCatalog:
        canvasBackingBinding?.importedName ===
          "appPerformanceCanvasBacking" &&
        canvasBackingBinding.specifier ===
          "./app-performance-path-adapters",
      pathShape:
        paths && ts.isIdentifier(paths)
          ? "catalog"
          : paths &&
              ts.isArrayLiteralExpression(paths) &&
              paths.elements.length === 1 &&
              ts.isIdentifier(paths.elements[0])
            ? "single"
            : "invalid",
      propertyNames: Object.freeze([...properties.keys()].sort()),
      schemaFromStarter:
        schemaBinding?.importedName === "appSchema" &&
        schemaBinding.specifier === "../src/app/app-schema",
    });
  });
  const staticTestNames = analysis.importedCalls.flatMap(({ call, target }) => {
    const [name] = call.arguments;
    return target.specifier === "@playwright/test" &&
      target.importedName === "test" &&
      target.memberPath === "" &&
      name &&
      ts.isStringLiteralLike(name)
      ? [name.text]
      : [];
  });
  return Object.freeze({
    compilerBoundaries: Object.freeze(compilerBoundaries),
    importedCallTargets: analysis.callTargets.importedCallTargets,
    staticTestNames: Object.freeze(staticTestNames),
  });
}

// Hang-only ceiling: functional gate duration is never product performance evidence.
const TOOLCRAFT_FUNCTIONAL_GATE_TIMEOUT_MS = 60_000;

describe("Toolcraft starter performance gates", () => {
  it(
    "keeps generated verification scripts within shared recursive budgets",
    async () => {
      const result = await evaluateGeneratedScriptBudgets(projectDir);
      expect(result.lineBudgetViolations).toEqual([]);
    },
    TOOLCRAFT_FUNCTIONAL_GATE_TIMEOUT_MS,
  );

  it("classifies every script extension and production-looking test by reachability", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "toolcraft-script-gate-"));
    try {
      const files = {
        "scripts/nested/fixture.spec.cjs":
          "export const fixture = true;\n".repeat(500),
        "scripts/nested/toolcraft-performance-worker.js":
          "export const execute = true;\n".repeat(301),
        "scripts/nested/types.cts": "export const type = true;\n",
        "scripts/nested/types.mts": "export const type = true;\n",
        "scripts/nested/worker.test.mjs":
          "export const execute = true;\n".repeat(351),
        "scripts/run-delivery-verification.mjs": [
          'import "./nested/toolcraft-performance-worker.js";',
          'import "./nested/worker.test.mjs";',
        ].join("\n"),
      };
      for (const [repoPath, source] of Object.entries(files)) {
        const absolutePath = join(rootDir, repoPath);
        mkdirSync(join(absolutePath, ".."), { recursive: true });
        writeFileSync(absolutePath, source);
      }
      const result = await evaluateGeneratedScriptBudgets(rootDir);
      expect(result.sourceFileCount).toBe(6);
      expect(
        result.lineBudgetViolations.map(({ maxLines, repoPath }) => ({
          maxLines,
          repoPath,
        })),
      ).toEqual([
        {
          maxLines: 300,
          repoPath: "scripts/nested/toolcraft-performance-worker.js",
        },
        {
          maxLines: 350,
          repoPath: "scripts/nested/worker.test.mjs",
        },
      ]);
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it("keeps the Playwright performance audit inside the browser perf tag", () => {
    const sourcePath = join(e2eDir, "app-performance.spec.ts");
    const source = readFileSync(sourcePath, "utf8");
    const facts = collectPerformanceSpecFacts(source, sourcePath);

    expect(source).not.toContain("TOOLCRAFT_PERF_CHECK");
    for (const expected of [
      ["@/toolcraft/runtime", "deriveToolcraftPerformancePaths"],
      ["./performance-path-adapter-matrix", "getToolcraftPerformancePathTestName"],
      ["./performance-path-helpers", "runToolcraftPerformancePath"],
    ] as const) {
      expect(
        facts.importedCallTargets.some(
          ({ importedName, memberPath, specifier }) =>
            specifier === expected[0] &&
            importedName === expected[1] &&
            memberPath === "",
        ),
      ).toBe(true);
    }
    expect(facts.compilerBoundaries).toHaveLength(2);
    for (const boundary of facts.compilerBoundaries) {
      expect(boundary.propertyNames).toEqual([
        "adapters",
        "canvasBacking",
        "paths",
        "schema",
      ]);
      expect(boundary.adaptersFromCatalog).toBe(true);
      expect(boundary.canvasBackingFromCatalog).toBe(true);
      expect(boundary.schemaFromStarter).toBe(true);
    }
    expect(facts.compilerBoundaries.map(({ pathShape }) => pathShape).sort()).toEqual([
      "catalog",
      "single",
    ]);
    expect(facts.staticTestNames).toContain(
      "browser perf: toolcraft adapter catalog",
    );
    expect(facts.staticTestNames.length).toBeGreaterThan(0);
    expect(
      facts.staticTestNames.every((name) => name.includes("browser perf:")),
      `app-performance.spec.ts tests must all be tagged for the dedicated perf checkpoint: ${facts.staticTestNames.join(", ")}`,
    ).toBe(true);
  });

  it("accepts harmless performance catalog import aliases", () => {
    const facts = collectPerformanceSpecFacts(
      `
        import { appSchema as schema } from "../src/app/app-schema";
        import {
          appPerformanceCanvasBacking as backing,
          appPerformancePathAdapters as adapters,
        } from "./app-performance-path-adapters";
        import {
          compileToolcraftPerformancePathAdapterMatrix as compile,
        } from "./performance-path-adapter-matrix";

        const paths = [];
        const path = paths[0];
        compile({ adapters, canvasBacking: backing, paths, schema });
        compile({
          adapters: adapters.filter((candidate) => candidate.pathId === path.id),
          canvasBacking: backing,
          paths: [path],
          schema,
        });
      `,
      "aliased-performance-spec.ts",
    );

    expect(facts.compilerBoundaries).toHaveLength(2);
    expect(facts.compilerBoundaries).toMatchObject([
      {
        adaptersFromCatalog: true,
        canvasBackingFromCatalog: true,
        schemaFromStarter: true,
      },
      {
        adaptersFromCatalog: true,
        canvasBackingFromCatalog: true,
        schemaFromStarter: true,
      },
    ]);
    expect(facts.compilerBoundaries.map(({ pathShape }) => pathShape).sort()).toEqual([
      "catalog",
      "single",
    ]);
  });

  it("rejects compiler boundaries that omit product canvas backing", () => {
    const facts = collectPerformanceSpecFacts(
      `
        import { appSchema as schema } from "../src/app/app-schema";
        import {
          appPerformanceCanvasBacking as backing,
          appPerformancePathAdapters as adapters,
        } from "./app-performance-path-adapters";
        import {
          compileToolcraftPerformancePathAdapterMatrix as compile,
        } from "./performance-path-adapter-matrix";

        const paths = [];
        compile({ adapters, paths, schema });
      `,
      "missing-performance-canvas-backing.ts",
    );

    expect(facts.compilerBoundaries).toHaveLength(1);
    expect(facts.compilerBoundaries[0]).toMatchObject({
      adaptersFromCatalog: true,
      canvasBackingFromCatalog: false,
      propertyNames: ["adapters", "paths", "schema"],
      schemaFromStarter: true,
    });
  });

  it("rejects shadowed performance compiler and adapter identifiers", () => {
    const facts = collectPerformanceSpecFacts(
      `
        import { appSchema as schema } from "../src/app/app-schema";
        import {
          appPerformanceCanvasBacking as backing,
          appPerformancePathAdapters as adapters,
        } from "./app-performance-path-adapters";
        import {
          compileToolcraftPerformancePathAdapterMatrix as compile,
        } from "./performance-path-adapter-matrix";

        const paths = [];
        function ignoredShadow(compile) {
          compile({ adapters, canvasBacking: backing, paths, schema });
        }
        {
          const adapters = [];
          compile({ adapters, canvasBacking: backing, paths, schema });
        }
      `,
      "shadowed-performance-spec.ts",
    );

    expect(facts.compilerBoundaries).toHaveLength(1);
    expect(facts.compilerBoundaries[0]?.adaptersFromCatalog).toBe(false);
  });

  it("keeps measured performance out of functional delivery", () => {
    expect(readdirSync(e2eDir).filter((name) => name.includes("-smoke"))).toEqual(
      [],
    );
  });

  it("rejects focused Playwright tests that would bypass protected browser gates", () => {
    expect(playwrightConfigForbidsFocusedTests()).toBe(true);
  });

  it("keeps later feature verification product-only and outside proof authority", () => {
    const source = readFileSync(
      join(projectDir, "scripts/run-feature-verification.mjs"),
      "utf8",
    );
    const productTestFacade = readFileSync(
      join(projectDir, "e2e/toolcraft-product-test.ts"),
      "utf8",
    );

    expect(source).toContain("loadToolcraftFeatureVerificationPlanInIsolatedProcess");
    expect(source).toMatch(
      /new Set\(\s*featurePlan\.scenarios\.map\(\(\{ file \}\) => file\)\s*\)/u,
    );
    expect(source).toMatch(/"test",\s*\.\.\.fileFilters/u);
    expect(source).toMatch(
      /path\s*\.resolve\(projectDir, file\)[\s\S]*return `\/\^\$\{escapedAbsoluteFile\}\$\/`/u,
    );
    expect(source).not.toMatch(
      /createToolcraftFeatureBrowserSelection|toolcraft-feature-browser-selection|\.\.\.selection\.files/u,
    );
    expect(source).not.toContain("grepTitle");
    expect(source).toContain("TOOLCRAFT_BROWSER_PROOF_TIMEOUT_MS");
    expect(source).toContain("--workers=1");
    expect(source.match(/dependencies\.runProcess\(/gu)).toHaveLength(1);
    expect(source).toContain("TOOLCRAFT_BROWSER_SERVER_MODE: \"dev\"");
    expect(source).not.toMatch(
      /Promise\.all|--list|resolveToolcraftPlaywrightTestTitles|captureToolcraftProofProcess|executeToolcraftDeliveryLifecycle|measureToolcraftPerformanceCheckpoint|collectToolcraftVerificationInputs|run-delivery|run-browser-performance|receipt/iu,
    );
    expect(productTestFacade).toMatch(
      /const selectedProductTestBudgets\s*=[\s\S]*new Map\([\s\S]*\.scenarios\.map\(\(\{ budget, testName \}\)/u,
    );
    expect(productTestFacade).toContain(
      "selectedProductTestBudgets?.get(title)",
    );
    expect(productTestFacade).toContain(
      "testInfo.setTimeout(TOOLCRAFT_BROWSER_PROOF_TIMEOUT_MS[budget])",
    );
    expect(productTestFacade).not.toContain("registerProductTest.setTimeout");
  });

  it("keeps verification lifecycle authority in the runtime contract", () => {
    expect(appPerformance).not.toHaveProperty("browserCheckPolicy");
    expect(TOOLCRAFT_PERFORMANCE_VERIFICATION_LIFECYCLE).toEqual({
      delivery: {
        command: "verify:delivery",
        modes: ["initial-functional", "performance-iteration"],
        selectors: "initial-complete-or-authority-exact",
      },
      fullPerformance: {
        command: "verify:perf",
        authority: "explicit-user-request-or-accepted-offer",
      },
    });
  });

  it("requires structurally valid performance coverage for functional delivery", () => {
    expect(
      validateToolcraftPerformanceCoverage(
        appSchema,
        appPerformance,
        TOOLCRAFT_FUNCTIONAL_PERFORMANCE_COVERAGE_POLICY,
      ),
    ).toEqual([]);
  });

  it("keeps unresolved kernel decisions pending during functional delivery", () => {
    const performanceConfig: ToolcraftEnvelopePerformanceConfig = appPerformance;
    const rawAssessment = assessToolcraftRenderPlan(appSchema, {
      ...performanceConfig,
      kernelBenchmarkDecisions: undefined,
    });

    expect(rawAssessment.errors).toEqual([]);
    expect(rawAssessment.requiredBenchmarks).toEqual(expect.any(Array));
  });

  it("starts from an explicit empty workload envelope", () => {
    if (collectToolcraftWorkloadControls(appSchema).length > 0) {
      return;
    }

    expect(appPerformance.workloadEnvelope).toEqual({ dimensions: [] });
    expect(appPerformance).not.toHaveProperty("rendererWorkload");
    expect(appPerformance).not.toHaveProperty("workloadTargets");
    expect(appPerformance).not.toHaveProperty("fixtureAdapters");
    expect(collectToolcraftWorkloadControls(appSchema)).toEqual([]);
  });

  it("requires every visible control to classify its performance role", () => {
    const unclassifiedControls =
      collectToolcraftUnclassifiedPerformanceControls(appSchema);

    expect(
      unclassifiedControls,
      "Every visible non-action control must declare performanceRole as workload or responsiveness so AI cannot skip the performance decision.",
    ).toEqual([]);
  });
});
