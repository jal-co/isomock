import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { evaluateToolcraftProductBoundary } from "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from "./toolcraft-product-boundary-test-fixtures.mjs";
import { collectToolcraftFrameworkOwnedLocalPaths } from "./toolcraft-source-ownership.mjs";

const starterRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const unavailableImageEvidenceFacadePath =
  "e2e/browser-infinity-canvas-evidence.ts";
const unavailableImageEvidencePrivatePath =
  "e2e/browser-infinity-canvas-unavailable-image-evidence.ts";

async function evaluateUnavailableImageEvidenceImport(context, specifier) {
  const rootDir = await createFixture(context, {
    "e2e/app-canvas.spec.ts": `
      import { createToolcraftUnavailableImageResourceFixture } from "${specifier}";
      void createToolcraftUnavailableImageResourceFixture;
    `,
    [unavailableImageEvidenceFacadePath]: `
      export {
        createToolcraftUnavailableImageResourceFixture,
      } from "./browser-infinity-canvas-unavailable-image-evidence";
    `,
    [unavailableImageEvidencePrivatePath]: `
      export function createToolcraftUnavailableImageResourceFixture() {}
    `,
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@private-proof": [`./${unavailableImageEvidencePrivatePath}`],
          "@public-proof": [`./${unavailableImageEvidenceFacadePath}`],
        },
      },
    }),
  });

  return evaluateToolcraftProductBoundary({
    protectedFilePaths: [
      unavailableImageEvidenceFacadePath,
      unavailableImageEvidencePrivatePath,
    ],
    rootDir,
  });
}

test("protects every starter helper that writes reserved runtime evidence", async () => {
  const e2eRoot = path.join(starterRoot, "e2e");
  const helperPaths = (await fs.readdir(e2eRoot))
    .filter((fileName) => /\.[cm]?[jt]sx?$/u.test(fileName))
    .map((fileName) => `e2e/${fileName}`);
  const evidenceWriterPaths = [];

  for (const helperPath of helperPaths) {
    const source = await fs.readFile(path.join(starterRoot, helperPath), "utf8");
    if (
      /from\s+["']\.\/browser-(?:runtime|performance|performance-measurement)-evidence["']/u.test(
        source,
      )
    ) {
      evidenceWriterPaths.push(helperPath);
    }
  }

  const protectedPathSet = new Set(
    await collectToolcraftFrameworkOwnedLocalPaths(starterRoot),
  );
  assert.deepEqual(
    evidenceWriterPaths.filter((helperPath) => !protectedPathSet.has(helperPath)),
    [],
  );
  assert.ok(evidenceWriterPaths.includes("e2e/performance-pipeline-evidence.ts"));
  for (const protectedEvidencePath of [
    "e2e/browser-performance-evidence.ts",
    "e2e/browser-performance-measurement-evidence.ts",
    "e2e/browser-performance-measurement-report.ts",
    "e2e/browser-performance-report.ts",
    "e2e/browser-runtime-evidence.ts",
    "e2e/performance-checkpoint-report.ts",
    "e2e/performance-environment-evidence.ts",
    "e2e/performance-measurement-evidence.ts",
    "e2e/performance-pipeline-evidence.ts",
    "e2e/performance-pipeline-evidence-test-fixtures.ts",
    "e2e/performance-pipeline-invariants.ts",
    "src/app/test-evidence/browser-performance-contract.ts",
    "src/app/test-evidence/browser-performance-measurement-contract.ts",
  ]) {
    assert.ok(
      protectedPathSet.has(protectedEvidencePath),
      `${protectedEvidencePath} must remain framework-owned.`,
    );
  }
});

test("rejects product tests that import or forge reserved runtime evidence", async (context) => {
  const rootDir = await createFixture(context, {
    "e2e/app-controls.spec.ts": `
      import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
      export const loadHelper = (moduleName: string) => import(moduleName);
      const forgedName = "toolcraft.browser-runtime-evidence";
      const assembledName = "toolcraft.browser-runtime-" + "evidence";
      const assembledContentType =
        "application/vnd.toolcraft.browser-runtime-" + "evidence+json";
      void attachToolcraftBrowserRuntimeEvidence;
      void forgedName;
      void assembledName;
      void assembledContentType;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map((violation) => violation.kind),
    [
      "reserved-runtime-evidence",
      "non-static-module-specifier",
      "reserved-runtime-evidence",
      "reserved-runtime-evidence",
      "reserved-runtime-evidence",
    ],
  );
});

test("rejects product code that imports or forges rich performance evidence", async (context) => {
  const rootDir = await createFixture(context, {
    "e2e/app-controls.spec.ts": `
      import { attachToolcraftBrowserPerformanceEvidence } from "./browser-performance-evidence";
      import { attachToolcraftPerformanceMeasurementEvidence } from "./browser-performance-measurement-evidence";
      import { evaluateToolcraftPerformanceMeasurements } from "./browser-performance-measurement-report";
      import { evaluateToolcraftBrowserPerformanceEvidence } from "./browser-performance-report";
      import { createToolcraftPerformanceCheckpointReport } from "./performance-checkpoint-report";
      import { attachToolcraftPerformanceEnvironmentEvidence } from "./performance-environment-evidence";
      import { finalizeToolcraftMeasurement } from "./performance-measurement-evidence";
      import { expectToolcraftPipelineInvariant as internalPipelineHelper } from "./performance-pipeline-evidence";
      import pipelineHelperSource from "./performance-pipeline-evidence.ts?raw";
      import { pipelineEvidence } from "./performance-pipeline-evidence-test-fixtures";
      import { getPipelineObservationInvariantErrors } from "./performance-pipeline-invariants";
      import { runToolcraftPerformancePath } from "./performance-path-helpers";
      import { serializeToolcraftBrowserPerformanceEvidence } from "../src/app/test-evidence/browser-performance-contract";
      import { serializeToolcraftPerformanceMeasurement } from "../src/app/test-evidence/browser-performance-measurement-contract";
      const forgedName = "toolcraft.browser-performance-" + "evidence";
      const forgedContentType =
        "application/vnd.toolcraft.browser-performance-" + "evidence+json";
      const forgedMeasurementName =
        "toolcraft.browser-performance-" + "measurement";
      const forgedEnvironmentContentType =
        "application/vnd.toolcraft.performance-" + "environment+json";
      const bridgeAttribute = "data-toolcraft-pipeline-" + "evidence";
      const bridgeSymbol =
        "toolcraft.renderer-pipeline-evidence." + "snapshot";
      void attachToolcraftBrowserPerformanceEvidence;
      void attachToolcraftPerformanceMeasurementEvidence;
      void evaluateToolcraftPerformanceMeasurements;
      void evaluateToolcraftBrowserPerformanceEvidence;
      void createToolcraftPerformanceCheckpointReport;
      void attachToolcraftPerformanceEnvironmentEvidence;
      void finalizeToolcraftMeasurement;
      void internalPipelineHelper;
      void pipelineHelperSource;
      void pipelineEvidence;
      void getPipelineObservationInvariantErrors;
      void runToolcraftPerformancePath;
      void serializeToolcraftBrowserPerformanceEvidence;
      void serializeToolcraftPerformanceMeasurement;
      void forgedName;
      void forgedContentType;
      void forgedMeasurementName;
      void forgedEnvironmentContentType;
      void bridgeAttribute;
      void bridgeSymbol;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(result.violations.length, 20);
  assert.ok(
    result.violations.every(
      (violation) => violation.kind === "reserved-runtime-evidence",
    ),
  );
});

test("allows product adapters to import only the inert performance path contract", async (context) => {
  const rootDir = await createFixture(context, {
    "e2e/app-performance-path-adapters.ts": `
      import type { ToolcraftPerformancePathAdapter } from "./performance-path-adapter-contract";
      export const adapters = [] as const satisfies readonly ToolcraftPerformancePathAdapter[];
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(result.violations, []);
});

test("allows product layer specs to use the public proof facade without reserved evidence imports", async (context) => {
  const rootDir = await createFixture(context, {
    "e2e/app-layers.spec.ts": `
      import { expectToolcraftLayerReorder } from "./browser-layer-evidence-helpers";
      import { createToolcraftBrowserProofSession } from "./browser-proof-session";
      export async function proveLayerOrder(page: unknown) {
        const session = await createToolcraftBrowserProofSession(page);
        const action = session.targetAction("layers.order", async () => {});
        void action;
        void expectToolcraftLayerReorder;
      }
    `,
    "e2e/browser-layer-evidence-helpers.ts": `
      export async function expectToolcraftLayerReorder() {}
    `,
    "e2e/browser-proof-session.ts": `
      export async function createToolcraftBrowserProofSession() {
        return {
          targetAction(target: string, run: () => Promise<void>) {
            return { run, target };
          },
        };
      }
    `,
  });

  const result = await evaluateToolcraftProductBoundary({
    protectedFilePaths: [
      "e2e/browser-layer-evidence-helpers.ts",
      "e2e/browser-proof-session.ts",
    ],
    rootDir,
  });

  assert.deepEqual(result.violations, []);
});

test("rejects relative and configured-alias imports of private unavailable-image evidence", async (context) => {
  const results = await Promise.all(
    [
      "./browser-infinity-canvas-unavailable-image-evidence",
      "@private-proof",
    ].map((specifier) =>
      evaluateUnavailableImageEvidenceImport(context, specifier),
    ),
  );
  assert.deepEqual(
    results.map((result) =>
      result.violations.map((violation) => violation.kind),
    ),
    [
      ["reserved-runtime-evidence"],
      ["reserved-runtime-evidence"],
    ],
  );
  for (const result of results) {
    assert.match(result.violations[0].message, /browser-infinity-canvas-evidence/u);
  }
});

test("allows relative and configured-alias imports of the public unavailable-image facade", async (context) => {
  for (const specifier of [
    "./browser-infinity-canvas-evidence",
    "@public-proof",
  ]) {
    const result = await evaluateUnavailableImageEvidenceImport(
      context,
      specifier,
    );
    assert.deepEqual(result.violations, []);
  }
});

test("normalizes private unavailable-image evidence import paths before enforcing policy", async (context) => {
  const result = await evaluateUnavailableImageEvidenceImport(
    context,
    "./nested/../browser-infinity-canvas-unavailable-image-evidence",
  );
  assert.deepEqual(
    result.violations.map((violation) => violation.kind),
    ["reserved-runtime-evidence"],
  );
});

test("rejects product access to the reserved unavailable-resource bridge", async (context) => {
  const rejectedRoot = await createFixture(context, {
    "e2e/app-canvas.spec.ts": `
      const fixtureEvent =
        "toolcraft.browser-proof.unavailable-resource-" + "request";
      const fixtureAttribute =
        "data-toolcraft-unavailable-resource-" + "evidence";
      void fixtureEvent;
      void fixtureAttribute;
    `,
    "src/product/unavailable-resource-bridge.tsx": `
      export const ReservedBridge = () => (
        <output data-toolcraft-unavailable-resource-evidence />
      );
    `,
  });
  const rejected = await evaluateToolcraftProductBoundary({
    rootDir: rejectedRoot,
  });
  assert.deepEqual(
    rejected.violations.map((violation) => violation.kind),
    [
      "reserved-runtime-evidence",
      "reserved-runtime-evidence",
      "native-control-recreation",
      "reserved-runtime-evidence",
    ],
  );
});

test("rejects product selectors and JSX attributes that access the pipeline evidence bridge", async (context) => {
  const rootDir = await createFixture(context, {
    "src/product/pipeline-bridge.tsx": `
      export const pipelineBridgeSelector =
        "[data-toolcraft-pipeline-" + "evidence]";
      export const PipelineBridge = () => (
        <output data-toolcraft-pipeline-evidence />
      );
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map((violation) => violation.kind),
    [
      "reserved-runtime-evidence",
      "native-control-recreation",
      "reserved-runtime-evidence",
    ],
  );
});

test("rejects reserved runtime evidence bridged through product production source", async (context) => {
  const rootDir = await createFixture(context, {
    "e2e/browser-runtime-evidence.ts": `
      export const attachToolcraftBrowserRuntimeEvidence = async () => {};
    `,
    "e2e/product.spec.ts": `
      import { attachToolcraftBrowserRuntimeEvidence } from "../src/product/evidence-bridge";
      void attachToolcraftBrowserRuntimeEvidence;
    `,
    "src/product/evidence-bridge.ts": `
      export { attachToolcraftBrowserRuntimeEvidence } from "../../e2e/browser-runtime-evidence";
    `,
  });

  const result = await evaluateToolcraftProductBoundary({
    protectedFilePaths: ["e2e/browser-runtime-evidence.ts"],
    rootDir,
  });

  assert.deepEqual(
    result.violations.map((violation) => violation.kind),
    ["production-test-import", "reserved-runtime-evidence"],
  );
});

test("rejects reserved runtime evidence payloads hidden in product production helpers", async (context) => {
  const rootDir = await createFixture(context, {
    "e2e/product.spec.ts": `
      import { evidenceName } from "../src/product/evidence-payload";
      void evidenceName;
    `,
    "src/product/evidence-payload.ts": `
      export const evidenceName = "toolcraft.browser-runtime-" + "evidence";
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map((violation) => violation.kind),
    ["reserved-runtime-evidence"],
  );
});

test("rejects computed and non-static dynamic module loading", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/computed.ts": `
      const runtimeRoot = "@/toolcraft/runtime/";
      export const loadRuntime = () => import(runtimeRoot + "react");
    `,
    "src/features/non-static.ts": `
      export const loadModule = (moduleName: string) => import(moduleName);
    `,
    "src/features/shadowed-static.ts": `
      const moduleName = "@/toolcraft/runtime/react";
      export const loadModule = (moduleName: string) => import(moduleName);
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map((violation) => violation.kind),
    [
      "runtime-surface",
      "non-static-module-specifier",
      "non-static-module-specifier",
    ],
  );
});
