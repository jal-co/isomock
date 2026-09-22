import assert from "node:assert/strict";
import test from "node:test";

import { evaluateToolcraftProductBoundary } from "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from "./toolcraft-product-boundary-test-fixtures.mjs";

test("accepts the public product constructors and safe primitives", async (context) => {
  const rootDir = await createFixture(context, {
    "src/app/app-composition.tsx": `
      import { composeToolcraftApp } from "@/toolcraft/runtime/react";
      import { Button } from "@/toolcraft/ui";
      import { appSchema } from "../domain/schema";
      export const appComposition = composeToolcraftApp(appSchema, {
        scene: { canvasContent: <Button>Render</Button> },
      });
    `,
    "src/domain/schema.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      export const appSchema = defineToolcraft({
        base: {
          canvas: { enabled: true },
          identity: { id: "fixture", title: "Fixture" },
          panels: {},
        },
        modules: [],
      });
    `,
    "src/main.tsx": `import { appComposition } from "./app/app-composition"; void appComposition;`,
  });

  const result = await evaluateToolcraftProductBoundary({
    protectedFilePaths: ["src/main.tsx"],
    rootDir,
  });

  assert.deepEqual(result.violations, []);
  assert.equal(result.productSourceCount, 2);
});

test("rejects old, copied, manual, and deep module construction", async (context) => {
  const rootDir = await createFixture(context, {
    "src/app/app-composition.tsx": `
      import type { ToolcraftAppComposition } from "@/toolcraft/runtime/react";
      const manualComposition: ToolcraftAppComposition = { schema };
      export const appComposition = manualComposition;
    `,
    "src/app/app-schema.ts": `
      import { defineToolcraft, imageExportModule } from "@/toolcraft/runtime";
      defineToolcraft({ canvas: { enabled: true }, panels: {} });
      defineToolcraft({
        base: {
          canvas: { enabled: true },
          export: { png: {} },
          identity: { id: "manual", title: "Manual" },
          panels: { layers: true, timeline: true },
        },
        modules: [{ ...imageExportModule() }],
      });
    `,
    "src/domain/deep.ts": `
      import { imageExportModule } from "@/toolcraft/runtime/modules/built-ins/image-export";
      import { resolveToolcraftProductDefinition } from "@/toolcraft/runtime/schema/resolve-toolcraft-product-definition";
      import ModuleInternals = require("@/toolcraft/runtime/modules/contract/contribution");
      type Catalog = import("@/toolcraft/runtime/modules/built-in-catalog").Catalog;
      void import("@/toolcraft/runtime/modules/resolution/resolve-product-modules");
      require("@/toolcraft/runtime/modules/contributions/media-policy-contributions");
      void import(runtimeSpecifier);
      void imageExportModule;
      void resolveToolcraftProductDefinition;
      void ModuleInternals;
      void (null as unknown as Catalog);
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map(({ kind }) => kind),
    [
      "product-constructor",
      "product-constructor",
      "product-constructor",
      "product-constructor",
      "product-constructor",
      "product-constructor",
      "runtime-product-module-ownership",
      "runtime-product-module-ownership",
      "runtime-product-module-ownership",
      "runtime-product-module-ownership",
      "runtime-product-module-ownership",
      "non-static-module-specifier",
    ],
  );
});

test("finds host surfaces outside src/app through aliases and sibling shells", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/product-shell.tsx": `
      import { CanvasShell as ProductCanvasHost, ToolcraftApp } from "@/toolcraft/runtime/react/canvas/canvas-shell";
      export function ProductShell() {
        return <ToolcraftApp canvasContent={<ProductCanvasHost />} schema={schema} />;
      }
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map((violation) => violation.kind),
    ["runtime-surface", "runtime-surface"],
  );
  assert.match(result.violations[0].message, /CanvasShell/u);
  assert.match(result.violations[1].message, /ToolcraftApp/u);
});

test("checks Vite root-absolute imports against the same product boundary", async (context) => {
  const rootDir = await createFixture(context, {
    "outside-product.ts": "export const outsideProduct = true;\n",
    "src/features/absolute-runtime.tsx": `
      import { CanvasShell } from "/src/toolcraft/runtime/react";
      export const canvas = <CanvasShell />;
    `,
    "src/features/fixture.test.ts": "export const fixture = true;\n",
    "src/features/production.ts": `
      import { fixture } from "/src/features/fixture.test";
      import { outsideProduct } from "/outside-product";
      void fixture;
      void outsideProduct;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map((violation) => violation.kind),
    ["runtime-surface", "production-test-import", "source-boundary-escape"],
  );
});

test("keeps model import, topology, and repair infrastructure runtime-owned", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/direct-loaders.ts": `
      import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
      import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
      void GLTFLoader;
      void FBXLoader;
    `,
    "src/features/gltf-transform.ts": `
      import { NodeIO } from "@gltf-transform/core";
      void NodeIO;
    `,
    "src/features/runtime-internals.ts": `
      export { createModelImportCoordinator } from "@/toolcraft/runtime/model-import";
      export async function loadRepairInternals() {
        return import("@/toolcraft/runtime/model-import/topology");
      }
    `,
    "src/features/safe-three-renderer.ts": `
      import { Scene, WebGLRenderer } from "three";
      export const scene = new Scene();
      export const rendererType = WebGLRenderer;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(result.violations.length, 5);
  assert.equal(
    result.violations.every(
      (violation) => violation.kind === "runtime-model-import-ownership",
    ),
    true,
  );
  assert.equal(
    result.violations.some((violation) =>
      violation.repoPath.endsWith("safe-three-renderer.ts"),
    ),
    false,
  );
});

test("ignores tests but checks a product bridge imported by production", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/bridge.ts": `
      export { TimelinePanel as ProductTimeline } from "@/toolcraft/runtime/react";
    `,
    "src/features/bridge.test.tsx": `
      import { TimelinePanel } from "@/toolcraft/runtime/react";
      void TimelinePanel;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].repoPath, "src/features/bridge.ts");
});

test("rejects production imports of tests through relative and source aliases", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/renderer.test.ts": "export const fixture = 1;\n",
    "src/product/aliased.ts": `import { fixture } from "@/features/renderer.test"; void fixture;`,
    "src/product/relative.ts": `export { fixture } from "../features/renderer.test";`,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map((violation) => violation.kind),
    ["production-test-import", "production-test-import"],
  );
});

test("keeps capability proof recipes verification-owned", async (context) => {
  const proofCatalogPath = "src/app/acceptance/capability-proofs/catalog.ts";
  const starterVerificationEntryPath = "src/app/app-acceptance.ts";
  const verificationOwnerPath = "src/app/acceptance/validate-coverage.ts";
  const runtimeModulePath = "src/toolcraft/runtime/modules/product-module.ts";
  const rootDir = await createFixture(context, {
    [proofCatalogPath]: "export const proofCatalog = {};\n",
    [starterVerificationEntryPath]:
      "export const validateStarter = () => [];\n",
    [verificationOwnerPath]: "export const validateCoverage = () => [];\n",
    [runtimeModulePath]: `
      import { proofCatalog } from "@/app/acceptance/capability-proofs/catalog";
      import { validateStarter } from "@/app/app-acceptance";
      import { validateCoverage } from "@/app/acceptance/validate-coverage";
      export const runtimeProofCatalog = proofCatalog;
      export const runtimeStarterValidation = validateStarter;
      export const runtimeValidation = validateCoverage;
    `,
    "src/product/import-proof.ts": `
      import { proofCatalog } from "@/app/acceptance/capability-proofs/catalog";
      export const productProofCatalog = proofCatalog;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({
    protectedFilePaths: [proofCatalogPath],
    rootDir,
  });

  assert.deepEqual(
    result.violations.map((violation) => violation.kind),
    [
      "capability-proof-boundary",
      "capability-proof-boundary",
      "starter-verification-boundary",
      "starter-verification-boundary",
    ],
  );
  assert.deepEqual(
    result.violations.map((violation) => violation.repoPath),
    [
      "src/product/import-proof.ts",
      runtimeModulePath,
      runtimeModulePath,
      runtimeModulePath,
    ],
  );
});

test("keeps every runtime production surface out of starter verification", async (context) => {
  const runtimePaths = [
    "src/toolcraft/runtime/modules/aliased.ts",
    "src/toolcraft/runtime/panels/performance.ts",
    "src/toolcraft/runtime/react/root-absolute.ts",
    "src/toolcraft/runtime/schema/relative.ts",
    "src/toolcraft/runtime/state/starter.ts",
    "src/toolcraft/runtime/testing/evidence.ts",
  ];
  const rootDir = await createFixture(context, {
    "src/app/acceptance/allowed-verification.ts": `
      import { proofCatalog } from "./capability-proofs";
      export const allowedProofCatalog = proofCatalog;
    `,
    "src/app/acceptance/capability-proofs/catalog.ts":
      "export const proofCatalog = {};\n",
    "src/app/acceptance/capability-proofs/index.ts":
      'export { proofCatalog } from "./catalog";\n',
    "src/app/acceptance/validate-coverage.ts":
      "export const validateCoverage = () => [];\n",
    "src/app/app-acceptance.ts":
      "export const validateStarter = () => [];\n",
    "src/app/app-performance.ts":
      "export const validatePerformance = () => [];\n",
    "src/app/test-evidence/index.ts": "export const browserEvidence = {};\n",
    "e2e/browser-runtime-evidence.ts": "export const runtimeEvidence = {};\n",
    [runtimePaths[0]]: `
      export { proofCatalog } from "@/app/acceptance/capability-proofs";
    `,
    [runtimePaths[1]]: `
      import { validatePerformance } from "@/app/app-performance";
      export const runtimePerformanceValidation = validatePerformance;
    `,
    [runtimePaths[2]]: `
      export const loadEvidence = () => import("/src/app/test-evidence");
    `,
    [runtimePaths[3]]: `
      export { validateCoverage } from "../../../app/acceptance/validate-coverage";
    `,
    [runtimePaths[4]]: `
      import { validateStarter } from "@/app/app-acceptance";
      export const runtimeStarterValidation = validateStarter;
    `,
    [runtimePaths[5]]: `
      export { runtimeEvidence } from "/e2e/browser-runtime-evidence";
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });
  const runtimeVerificationViolations = result.violations.filter(
    (violation) =>
      violation.kind === "capability-proof-boundary" ||
      violation.kind === "starter-verification-boundary",
  );

  assert.deepEqual(
    runtimeVerificationViolations.map((violation) => violation.repoPath).sort(),
    [...runtimePaths].sort(),
  );
  assert.equal(
    result.violations.some(
      (violation) =>
        violation.repoPath === "src/app/acceptance/allowed-verification.ts",
    ),
    false,
  );
});

test("rejects product CSS that can restyle the signed host", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/package-style.ts": `import "some-library/global.css";`,
    "src/features/package-style-module.ts": `import "some-library/theme.module.css";`,
    "src/features/package-style-dynamic.ts": `
      const themePath = "some-library/" + "theme.module.css";
      export const loadTheme = () => import(themePath);
    `,
    "src/features/plain-style-dynamic.ts": `
      export const loadStyles = () => import("./unsafe.css");
    `,
    "src/features/bare-selector.module.css": `
      button, [data-slot="panel-title"] { display: none; }
    `,
    "src/features/external-import.module.css": `
      @import "some-library/theme.css";
      .preview { color: white; }
    `,
    "src/features/product.module.css": `.preview { color: white; }`,
    "src/features/safe-descendant.module.css": `.preview > button { color: white; }`,
    "src/features/safe-sibling.module.css": `.preview + .caption { color: white; }`,
    "src/features/sibling-escape.module.css": `
      .preview + [data-slot="panel-title"] { display: none; }
    `,
    "src/features/runtime-override.module.css": `:global([data-slot="toolcraft-runtime-app"]) { display: none; }`,
    "src/features/safe-root-style.ts": `import "/src/features/product.module.css";`,
    "src/features/unsafe-global.css": `.toolcraft-runtime-app { display: none; }`,
    "src/features/unsupported-style.ts": `import "./theme.module.scss";`,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map((violation) => violation.kind),
    [
      "product-global-css",
      "product-global-css",
      "product-global-css-import",
      "product-global-css-import",
      "product-global-css-import",
      "product-global-css-import",
      "product-global-css",
      "public-component-chrome",
      "product-global-css",
      "product-global-css",
      "product-global-css-import",
    ],
  );
  assert.equal(
    result.violations.some((violation) =>
      violation.repoPath.endsWith("product.module.css"),
    ),
    false,
  );
  assert.equal(result.violations.some((violation) =>
    violation.repoPath.endsWith("safe-descendant.module.css") &&
    violation.kind === "public-component-chrome"
  ), true);
  assert.equal(
    result.violations.some((violation) =>
      violation.repoPath.endsWith("safe-sibling.module.css"),
    ),
    false,
  );
});

test("allows functional selectors only when every anchoring branch stays local", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/safe-is.module.css": `
      :is(.preview, .card:hover) > button { color: white; }
    `,
    "src/features/safe-where.module.css": `
      :where(.preview, :is(.card, .tile)) .label { color: white; }
      .preview :is(button, .icon) { color: white; }
      :where(.preview + .caption) { color: white; }
    `,
    "src/features/unsafe-has.module.css": `
      :has(.preview) button { display: none; }
    `,
    "src/features/unsafe-is.module.css": `
      :is(.preview, button) .label { display: none; }
    `,
    "src/features/unsafe-not.module.css": `
      :not(.preview) button { display: none; }
    `,
    "src/features/unsafe-sibling.module.css": `
      :where(.preview + button) { display: none; }
    `,
    "src/features/unsafe-where.module.css": `
      :where(.preview, [data-slot="panel-title"]) { display: none; }
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map((violation) => violation.repoPath),
    [
      "src/features/safe-is.module.css",
      "src/features/safe-where.module.css",
      "src/features/unsafe-has.module.css",
      "src/features/unsafe-is.module.css",
      "src/features/unsafe-not.module.css",
      "src/features/unsafe-sibling.module.css",
      "src/features/unsafe-where.module.css",
    ],
  );
});

test("rejects product source imported from outside the scanned source roots", async (context) => {
  const rootDir = await createFixture(context, {
    "outside-product.tsx": `
      import { ToolcraftApp } from "@/toolcraft/runtime/react";
      export const outsideProduct = ToolcraftApp;
    `,
    "src/features/product.tsx": `
      import { outsideProduct } from "../../outside-product";
      export const productContent = outsideProduct;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map((violation) => violation.kind),
    ["source-boundary-escape"],
  );
  assert.match(
    result.violations[0].message,
    /Move outside-product\.tsx under src before importing it/u,
  );
});

test("rejects global style injection from product JSX", async (context) => {
  const rootDir = await createFixture(context, {
    "src/app/jsx-style.tsx": `
      export const appComposition = {
        canvasContent: <style>{"[data-toolcraft-canvas-world] { display: none; }"}</style>,
      };
    `,
    "src/app/style-element.ts": `
      export const styleElement = document.createElement("style");
    `,
    "src/app/stylesheet.ts": `
      export const stylesheet = new CSSStyleSheet();
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map((violation) => violation.kind),
    [
      "global-style-injection",
      "global-style-injection",
      "native-control-recreation",
      "global-style-injection",
    ],
  );
});
