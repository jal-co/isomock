import assert from "node:assert/strict";
import test from "node:test";

import {
  collectToolcraftCapabilityProofInventoryDiagnostics,
  collectToolcraftClosedConstructorDiagnostics,
} from "./toolcraft-module-cutover-compiler-test-utils.mjs";
import {
  collectToolcraftCutoverAbsenceDiagnostics,
  createToolcraftCutoverCompilerInventory,
  createToolcraftCutoverFixtureInventory,
} from "./toolcraft-module-cutover-test-utils.mjs";

test("keeps the compiler-inventoried production cutover compatibility-free", async () => {
  const inventory = await createToolcraftCutoverCompilerInventory();
  const constructorInventory = collectToolcraftClosedConstructorDiagnostics(
    inventory,
  );

  assert.deepEqual(collectToolcraftCutoverAbsenceDiagnostics(inventory), []);
  assert.equal(
    constructorInventory.compositionAuthors.length,
    inventory.kind === "workspace" ? 2 : 1,
  );
  assert.ok(constructorInventory.defineAuthors.length > 0);
  assert.deepEqual(constructorInventory.diagnostics, []);
  assert.deepEqual(
    collectToolcraftCapabilityProofInventoryDiagnostics(inventory),
    [],
  );
});

test("fails closed for computed compatibility fields without treating comments or strings as code", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "src/current.ts": `
      const field = "maximum" + "Value";
      const commandField = "ty" + "pe";
      export const compatibility = {
        configuredMaximumValue: 4, developmentValue: 2, effectiveMaximumValue: 4,
        id: "render", limit: "bounded", [field]: 4, targetPressure: 2, unit: "ms",
      };
      export const command = { asset: {}, [commandField]: "media." + "import" };
      export const section = {
        controls: { scale: { ["visible" + "When"]: { equals: true } } },
      };
    `,
    "src/legal.ts": `
      // maximumValue media.import legacy.visibleWhen
      export const legal = "ToolcraftAppSchema migrated onDisposeError";
    `,
  });

  assert.deepEqual(
    collectToolcraftCutoverAbsenceDiagnostics(inventory).map(
      ({ code, repoPath }) => ({ code, repoPath }),
    ),
    [
      { code: "control-visible-when", repoPath: "src/current.ts" },
      { code: "performance-maximum-value", repoPath: "src/current.ts" },
      { code: "single-media-import", repoPath: "src/current.ts" },
    ],
  );
});

test("rejects renamed compatibility owners and structural upgrade discriminants", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "src/compatibility.ts": `
      type ToolcraftAppSchema = { canvas: unknown; panels: unknown };
      type ToolcraftLegacyImageAsset = { dataUrl: string; fileName: string; id: string; mimeType: string };
      type ToolcraftImageAsset = ToolcraftLegacyImageAsset & { assetKind: "image" };
      type AcceptedMedia = ToolcraftLegacyImageAsset | ToolcraftImageAsset;
      const resultField = "ki" + "nd";
      const originField = "ori" + "gin";
      export function restoreCurrentName(input: ToolcraftAppSchema, asset: AcceptedMedia) {
        return {
          fromVersion: 1,
          id: "legacy." + "compatibility",
          mode: "always",
          [originField]: "implicit",
          [resultField]: "migrated",
          payload: { asset, input },
        };
      }
    `,
  });

  assert.deepEqual(
    collectToolcraftCutoverAbsenceDiagnostics(inventory).map(({ code }) => code),
    [
      "migrated-persistence-result",
      "missing-kind-media-union",
    ],
  );
});

test("rejects alias, package, dynamic, require, and import-equals internal edges", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "packages/hidden-runtime/package.json": `{
      "name": "@hidden/runtime",
      "exports": {
        "./catalog": "./src/modules/catalog.ts",
        "./contribution": "./src/modules/contribution.ts"
      }
    }`,
    "packages/hidden-runtime/src/modules/catalog.ts": `export const catalog = {};`,
    "packages/hidden-runtime/src/modules/contribution.ts": `export const contribution = {};`,
    "packages/hidden-runtime/src/modules/media.ts": `export const media = {};`,
    "packages/hidden-runtime/src/modules/resolve.ts": `export const resolve = {};`,
    "src/alias.ts": `
      const internalModule = "@private/" + "resolve";
      void import(internalModule);
    `,
    "src/dynamic.ts": `
      void import("@private/media");
    `,
    "src/import-equals.ts": `
      import Alias = require("@private/resolve");
      void Alias;
    `,
    "src/non-static.ts": `
      void import(runtimeSpecifier);
    `,
    "src/package-export.ts": `export * from "@hidden/runtime/catalog";`,
    "src/require.ts": `require("@hidden/runtime/contribution");`,
    "tsconfig.json": `{
      "compilerOptions": {
        "baseUrl": ".",
        "paths": { "@private/*": ["packages/hidden-runtime/src/modules/*"] }
      }
    }`,
  });

  assert.deepEqual(
    collectToolcraftCutoverAbsenceDiagnostics(inventory),
    [
      { code: "deep-module-import", repoPath: "src/alias.ts" },
      { code: "deep-module-import", repoPath: "src/dynamic.ts" },
      { code: "deep-module-import", repoPath: "src/import-equals.ts" },
      { code: "non-static-module-reference", repoPath: "src/non-static.ts" },
      { code: "deep-module-import", repoPath: "src/package-export.ts" },
      { code: "deep-module-import", repoPath: "src/require.ts" },
    ],
  );
});

test("does not infer upgrade owners from current v1 protocols or generic oldVersion", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "src/model-import/canonical/model-document.ts": `
      export const readCurrentModelDocument = (document: { version: number }) =>
        document.version === 1;
    `,
    "src/model-import/model-source-bundle-reader.ts": `
      export const upgradeBundle = (bundle: { descriptorVersion: number }) =>
        bundle["descriptor" + "Version"] === 1;
    `,
    "src/react/app-shell/settings-transfer-reader.ts": `
      export const upgradeSettings = (payload: { version: number }) =>
        payload.version === 1;
    `,
    "src/source-assets/repository/indexeddb-reader.ts": `
      export const upgradeDatabase = (event: { oldVersion: number }) =>
        event.oldVersion === 1;
    `,
    "src/state/persistence-reader.ts": `
      declare const createToolcraftDataUrlResourceRef: (...args: unknown[]) => string;
      export const upgradePersistence = (payload: { version: number; dataUrl: string }) =>
        payload.version === 1
          ? createToolcraftDataUrlResourceRef("image", payload.dataUrl)
          : null;
    `,
  });

  assert.deepEqual(collectToolcraftCutoverAbsenceDiagnostics(inventory), []);
});

test("preserves authored defaults, section conditions, live Color ingress, and design-system FileDrop", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "src/legal-current.ts": `
      import { FileDrop } from "@/toolcraft/ui";
      export const schema = {
        media: { defaultAssets: [{ dataUrl: "data:image/png;base64,AAAA" }] },
        section: {
          controls: {},
          id: "runtime.setup.part-1",
          visibleWhen: { equals: true, target: "mode.visible" },
        },
      };
      export const acceptLiveColor = (value: { hex: string }) => value.hex;
      export const reportPipelineDisposal = (onDisposeError: (error: unknown) => void) =>
        onDisposeError(new Error("disposed"));
      export const topologyLimit = (maximumValue: number) => maximumValue;
      void FileDrop;
    `,
  });

  assert.deepEqual(collectToolcraftCutoverAbsenceDiagnostics(inventory), []);
});

test("rejects old input casts and spread-cloned module definitions", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "src/constructors.ts": `
      import {
        defineToolcraft,
        imageExportModule,
        type ToolcraftProductDefinition,
      } from "@/toolcraft/runtime";
      defineToolcraft(({
        canvas: { enabled: true },
        panels: {},
      } as unknown) as ToolcraftProductDefinition);
      defineToolcraft({
        base: {
          canvas: { enabled: true },
          identity: { id: "fixture", title: "Fixture" },
          panels: {},
        },
        modules: [{ ...imageExportModule() }],
      });
    `,
  });

  assert.deepEqual(
    collectToolcraftClosedConstructorDiagnostics(inventory).diagnostics.map(
      ({ code }) => code,
    ),
    ["old-input-cast", "old-product-definition", "spread-module-clone"],
  );
});

test("rejects hidden definition fields and manual signed compositions", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "src/signed.tsx": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      import type { ToolcraftAppComposition } from "@/toolcraft/runtime/react";
      const product = {
        base: { canvas: { enabled: true }, identity: { id: "fixture", title: "Fixture" }, panels: {} },
        escape: true,
        modules: [],
      };
      export const appSchema = defineToolcraft(product);
      export const appComposition: ToolcraftAppComposition = { schema: appSchema };
    `,
  });

  assert.deepEqual(
    collectToolcraftClosedConstructorDiagnostics(inventory).diagnostics.map(
      ({ code }) => code,
    ),
    ["manual-app-composition", "old-product-definition"],
  );
});

test("keeps capability recipes exhaustive, catalog-independent, and switchboard-free", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "src/app/acceptance/capability-proofs/catalog.ts": `
      import { proveImageExport } from "./image-export";
      export const TOOLCRAFT_CAPABILITY_PROOF_CATALOG = Object.freeze({
        "image-export": proveImageExport,
      });
    `,
    "src/app/acceptance/capability-proofs/image-export.ts": `
      import type { ToolcraftProductCapabilityId } from "../../../toolcraft/runtime/modules/contract/capability";
      type Catalog = typeof import("./catalog").TOOLCRAFT_CAPABILITY_PROOF_CATALOG;
      export function proveImageExport(capability: ToolcraftProductCapabilityId) {
        switch (capability) {
          case "image-export": return undefined as Catalog | undefined;
          default: return undefined;
        }
      }
    `,
    "src/toolcraft/runtime/modules/contract/capability.ts": `
      export type ToolcraftProductCapabilityId = "image-export" | "timeline";
    `,
  });

  assert.deepEqual(
    collectToolcraftCapabilityProofInventoryDiagnostics(inventory).map(
      ({ code }) => code,
    ),
    [
      "non-exhaustive-capability-recipes",
      "feature-name-switchboard",
      "recipe-imports-catalog",
    ],
  );
});
