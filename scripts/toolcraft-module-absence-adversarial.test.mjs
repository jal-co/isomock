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

const unconstrainedType = ["a", "ny"].join("");

test("finds renamed compatibility owners from semantic structure", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "src/bundle-owner.ts": `
      type Bundle = {
        aggregateDigest: string;
        descriptorVersion: 1 | 2;
        packageSource: unknown;
        sourceFiles: readonly unknown[];
      };
      const readers = { 1: (bundle: Bundle) => ({ ...bundle, descriptorVersion: 2 as const }) };
      export const readBundle = (bundle: Bundle) => readers[bundle.descriptorVersion]?.(bundle) ?? bundle;
    `,
    "src/collapse-reader.ts": `
      export function restorePanelState(storage: Pick<Storage, "getItem">, key: string) {
        const payload = JSON.parse(storage.getItem(key) ?? "null") as { collapsed?: unknown };
        return Array.isArray(payload.collapsed)
          ? { collapsedSections: Object.fromEntries(payload.collapsed.map((id) => [id, true])) }
          : undefined;
      }
    `,
    "src/inline-hydration.ts": `
      import { createToolcraftDataUrlResourceRef as allocateResource } from "@/toolcraft/runtime/source-assets";
      export function restoreAssets(value: unknown) {
        if (!Array.isArray(value)) return [];
        return value.flatMap((candidate) =>
          candidate && typeof candidate.dataUrl === "string" && typeof candidate.id === "string" && typeof candidate.mimeType === "string"
            ? [{ assetId: candidate.id, resourceRef: allocateResource("image", candidate.dataUrl) }]
            : [],
        );
      }
    `,
    "src/media-union.ts": `
      type OldImage = { dataUrl: string; fileName: string; id: string; mimeType: string };
      type CurrentImage = OldImage & { assetKind: "image"; resourceRef: string };
      export type AcceptedMedia = OldImage | CurrentImage;
    `,
    "src/old-key-reader.ts": `
      const priorNamespace = ["creative", "apps", "kit"].join("-");
      export function loadWorkspace(storage: Pick<Storage, "getItem">, key: string) {
        return storage.getItem(key) ?? storage.getItem(priorNamespace + key.slice("toolcraft".length));
      }
    `,
    "src/optional-applicability.ts": `
      export type ControlInput = {
        applicability?: { mode: "always" } | { all: readonly unknown[]; mode: "conditional" };
        target: string;
        type: "slider";
      };
    `,
    "src/persistence-owner.ts": `
      type Snapshot = { state: Record<string, unknown>; version: 1 | 2 };
      const upgrades = { 1: (snapshot: Snapshot) => ({ state: snapshot.state, version: 2 as const }) };
      export const restoreSnapshot = (snapshot: Snapshot) => upgrades[snapshot.version]?.(snapshot) ?? snapshot;
    `,
    "src/settings-owner.ts": `
      type Transfer = {
        appId: string; canvas: unknown; exportedAt: string; source: "toolcraft-settings";
        timeline: unknown; values: Record<string, unknown>; version: 1 | 2;
      };
      const decoders = { 1: (value: Transfer) => ({ ...value, version: 2 as const }) };
      export const readTransfer = (value: Transfer) => decoders[value.version]?.(value) ?? value;
    `,
  });

  assert.deepEqual(collectToolcraftCutoverAbsenceDiagnostics(inventory), [
    { code: "model-bundle-v1-upgrade", repoPath: "src/bundle-owner.ts" },
    { code: "old-section-collapse-reader", repoPath: "src/collapse-reader.ts" },
    { code: "persisted-inline-media-upgrade", repoPath: "src/inline-hydration.ts" },
    { code: "missing-kind-media-union", repoPath: "src/media-union.ts" },
    { code: "old-storage-key-reader", repoPath: "src/old-key-reader.ts" },
    { code: "legacy-control-applicability", repoPath: "src/optional-applicability.ts" },
    { code: "persistence-v1-upgrade", repoPath: "src/persistence-owner.ts" },
    { code: "settings-v1-upgrade", repoPath: "src/settings-owner.ts" },
  ]);
});

test("keeps deprecated maximum, origin, migrated, and media import checks exact", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "src/deprecated.ts": `
      export type Dimension = {
        configuredMaximumValue: number; developmentValue: number; effectiveMaximumValue: number;
        id: string; limit: string; maximumValue: number; targetPressure: number; unit: string;
      };
      export type ControlInput = {
        applicability: { mode: "always"; origin?: "explicit" | "implicit" | "legacy" };
        target: string;
        type: "slider";
      };
      export type MigrationResult = { fromVersion: number; kind: "migrated"; payload: { state: object; version: number } };
      const commandType = "media." + "import";
      export const command = { asset: {}, replaceExisting: false, ["ty" + "pe"]: commandType };
    `,
    "src/legal.ts": `
      export const capacity = { maximumValue: 10, name: "queue" };
      export const packageSource = { kind: "migrated", origin: "legacy" };
    `,
  });

  assert.deepEqual(collectToolcraftCutoverAbsenceDiagnostics(inventory), [
    { code: "legacy-control-applicability", repoPath: "src/deprecated.ts" },
    { code: "migrated-persistence-result", repoPath: "src/deprecated.ts" },
    { code: "performance-maximum-value", repoPath: "src/deprecated.ts" },
    { code: "single-media-import", repoPath: "src/deprecated.ts" },
  ]);
});

test("traces constructor inputs, module clones, and any-typed signed compositions", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "src/constructors.tsx": `
      import { defineToolcraft, imageExportModule, type ToolcraftProductDefinition } from "@/toolcraft/runtime";
      const oldShape = { canvas: { enabled: true }, panels: {} };
      const castOnce = oldShape as unknown as ToolcraftProductDefinition;
      const castTwice = castOnce;
      defineToolcraft(castTwice);
      const copiedModule = { ...imageExportModule() };
      const copiedModules = [copiedModule];
      defineToolcraft({
        base: { canvas: { enabled: true }, identity: { id: "fixture", title: "Fixture" }, panels: {} },
        modules: copiedModules,
      });
      export const appComposition: ${unconstrainedType} = { schema: defineToolcraft({
        base: { canvas: { enabled: true }, identity: { id: "signed", title: "Signed" }, panels: {} },
        modules: [],
      }) };
    `,
  });

  assert.deepEqual(
    collectToolcraftClosedConstructorDiagnostics(inventory).diagnostics.map(({ code }) => code),
    [
      "any-signed-composition",
      "old-input-cast",
      "old-product-definition",
      "spread-module-clone",
    ],
  );
});

test("resolves hidden TypeScript aliases and local package exports", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "package.json": `{
      "name": "fixture",
      "type": "module"
    }`,
    "packages/hidden-runtime/package.json": `{
      "name": "@hidden/runtime",
      "type": "module",
      "exports": { "./private": { "types": "./src/modules/private.ts", "default": "./src/modules/private.ts" } }
    }`,
    "packages/hidden-runtime/src/modules/private.ts": `export const secret = true;`,
    "src/alias-import.ts": `import { secret } from "@private/private"; void secret;`,
    "src/package-import.ts": `export { secret } from "@hidden/runtime/private";`,
    "tsconfig.json": `{
      "compilerOptions": {
        "baseUrl": ".",
        "paths": { "@private/*": ["packages/hidden-runtime/src/modules/*"] }
      }
    }`,
  });

  assert.deepEqual(collectToolcraftCutoverAbsenceDiagnostics(inventory), [
    { code: "deep-module-import", repoPath: "src/alias-import.ts" },
    { code: "deep-module-import", repoPath: "src/package-import.ts" },
  ]);
});

test("inventories full CLI and website production trees plus exact compatibility fixtures", async () => {
  const inventory = await createToolcraftCutoverCompilerInventory();

  if (inventory.kind === "workspace") {
    assert.ok(inventory.entries.some(({ repoPath }) =>
      repoPath === "cli/src/generate.mjs",
    ));
    assert.ok(inventory.entries.some(({ repoPath }) =>
      repoPath === "cli/bin/toolcraft.mjs",
    ));
    assert.ok(inventory.entries.some(({ repoPath }) =>
      repoPath === "cli/scripts/prepare-pack.mjs",
    ));
    assert.equal(
      inventory.allEntries.find(({ repoPath }) =>
        repoPath === "cli/src/generate-test-dependency-sandbox.mjs"
      )?.role,
      "test-support",
    );
    assert.equal(
      inventory.allEntries.find(({ repoPath }) =>
        repoPath === "cli/src/packaged-template-fallback-helpers.mjs"
      )?.role,
      "test-support",
    );
    assert.ok(inventory.entries.some(({ repoPath }) =>
      repoPath === "apps/website/src/lib/demo-routes.ts",
    ));
  } else {
    assert.ok(inventory.entries.some(({ repoPath }) =>
      repoPath === "src/app/app-schema.ts",
    ));
  }
  assert.ok(Array.isArray(inventory.compatibilityFixtureEntries));
  assert.deepEqual(inventory.compatibilityFixtureEntries, []);
});

test("follows wrapped recipe symbols and rejects feature branching across orchestration", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "src/app/acceptance/capability-proofs/a.ts": `
      type Catalog = typeof import("./catalog").TOOLCRAFT_CAPABILITY_PROOF_CATALOG;
      export const proveA = () => undefined as Catalog | undefined;
    `,
    "src/app/acceptance/capability-proofs/b.ts": `
      import type { ToolcraftProductCapabilityId } from "../../../toolcraft/runtime/modules/contract/capability";
      export function proveB(capability: ToolcraftProductCapabilityId) {
        if (capability === "b") return true;
        return false;
      }
    `,
    "src/app/acceptance/capability-proofs/catalog.ts": `
      import { wrappedRecipe } from "./recipes";
      import { proveB } from "./b";
      export const TOOLCRAFT_CAPABILITY_PROOF_CATALOG = Object.freeze({ a: wrappedRecipe, b: proveB });
    `,
    "src/app/acceptance/capability-proofs/recipes.ts": `export { proveA as wrappedRecipe } from "./a";`,
    "src/app/app-composition.ts": `
      import type { ToolcraftProductCapabilityId } from "../toolcraft/runtime/modules/contract/capability";
      const ports = new Map<ToolcraftProductCapabilityId, unknown>();
      export const selectPort = (capability: ToolcraftProductCapabilityId) => ports.get(capability);
    `,
    "src/app/app-schema.ts": `
      import type { ToolcraftProductCapabilityId } from "../toolcraft/runtime/modules/contract/capability";
      const schemas: Partial<Record<ToolcraftProductCapabilityId, unknown>> = {};
      export const selectSchema = (capability: ToolcraftProductCapabilityId) => schemas[capability];
    `,
    "src/toolcraft/runtime/modules/contract/capability.ts": `export type ToolcraftProductCapabilityId = "a" | "b";`,
  });

  assert.deepEqual(collectToolcraftCapabilityProofInventoryDiagnostics(inventory), [
    { code: "recipe-imports-catalog", repoPath: "src/app/acceptance/capability-proofs/a.ts" },
    { code: "feature-name-switchboard", repoPath: "src/app/acceptance/capability-proofs/b.ts" },
    { code: "feature-name-switchboard", repoPath: "src/app/app-composition.ts" },
    { code: "feature-name-switchboard", repoPath: "src/app/app-schema.ts" },
  ]);
});

test("traces variable-held product bases and structural materialized bridges", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "src/base-flow.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      const inherited = { export: { image: true } };
      const panelCapabilities = { layers: { enabled: true }, timeline: { enabled: true } };
      const base = {
        ...inherited,
        canvas: { enabled: true },
        identity: { id: "flow", title: "Flow" },
        panels: panelCapabilities,
      };
      defineToolcraft({ base, modules: [] });
      declare const bridgeValue: { modulePlan: unknown; schema: unknown };
      export const materializedBridge = bridgeValue;
    `,
  });

  assert.deepEqual(
    collectToolcraftClosedConstructorDiagnostics(inventory).diagnostics.map(
      ({ code }) => code,
    ),
    ["materialized-schema-bridge", "module-owned-base-field"],
  );
});

test("finds branched v1 owners and standalone legacy control declarations", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "src/branch-bundle.ts": `
      type Bundle = { aggregateDigest: string; descriptorVersion: 1 | 2; packageSource: unknown; sourceFiles: readonly unknown[] };
      const legacyDescriptor = 1 as const;
      export function restore(value: Bundle) {
        if (value.descriptorVersion === legacyDescriptor) return { ...value, descriptorVersion: 2 as const };
        return value;
      }
    `,
    "src/branch-persistence.ts": `
      type Snapshot = { state: Record<string, unknown>; version: 1 | 2 };
      const legacySnapshot = 1 as const;
      export const restore = (value: Snapshot) =>
        value.version === legacySnapshot ? { state: value.state, version: 2 as const } : value;
    `,
    "src/branch-settings.ts": `
      type Transfer = { appId: string; canvas: unknown; exportedAt: string; source: "toolcraft-settings"; timeline: unknown; values: object; version: 1 | 2 };
      const legacyTransfer = 1 as const;
      export function restore(value: Transfer) {
        return value.version === legacyTransfer ? { ...value, version: 2 as const } : value;
      }
    `,
    "src/control-contract.ts": `
      export type ControlContract = {
        applicability?: { mode: "always" } | { mode: "conditional"; when: unknown };
        target: string;
        type: "slider";
        visibleWhen?: { target: string };
      };
    `,
  });

  assert.deepEqual(collectToolcraftCutoverAbsenceDiagnostics(inventory), [
    { code: "model-bundle-v1-upgrade", repoPath: "src/branch-bundle.ts" },
    { code: "persistence-v1-upgrade", repoPath: "src/branch-persistence.ts" },
    { code: "settings-v1-upgrade", repoPath: "src/branch-settings.ts" },
    { code: "control-visible-when", repoPath: "src/control-contract.ts" },
    { code: "legacy-control-applicability", repoPath: "src/control-contract.ts" },
  ]);
});

test("covers import-equals recipes and every concrete orchestration owner", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "apps/website/src/examples/example-schema.ts": `
      import { defineToolcraft } from "@/toolcraft/runtime";
      import type { ToolcraftProductCapabilityId } from "../../../../src/toolcraft/runtime/modules/contract/capability";
      const variants: Partial<Record<ToolcraftProductCapabilityId, unknown>> = {};
      export const schema = defineToolcraft({ base: { canvas: { enabled: true }, identity: { id: "web", title: "Web" }, panels: {} }, modules: [] });
      export const selectVariant = (capability: ToolcraftProductCapabilityId) => variants[capability];
    `,
    "src/app/acceptance/capability-proofs/a.ts": `
      import Catalog = require("./catalog");
      export const proveA = () => undefined as typeof Catalog.TOOLCRAFT_CAPABILITY_PROOF_CATALOG | undefined;
    `,
    "src/app/acceptance/capability-proofs/catalog.ts": `
      import { proveA } from "./a";
      export const TOOLCRAFT_CAPABILITY_PROOF_CATALOG = Object.freeze({ a: proveA, b: proveB });
      function proveB() { return true; }
    `,
    "src/app/acceptance/capability-proofs/generic/owner-dispatch.ts": `
      import type { ToolcraftProductCapabilityId } from "../../../toolcraft/runtime/modules/contract/capability";
      declare const recipes: Partial<Record<ToolcraftProductCapabilityId, unknown>>;
      export const dispatch = (capability: ToolcraftProductCapabilityId) => recipes[capability];
    `,
    "src/app/acceptance/capability-proofs/owner-dispatch.ts": `
      import type { ToolcraftProductCapabilityId } from "../../../toolcraft/runtime/modules/contract/capability";
      export const dispatch = (capability: ToolcraftProductCapabilityId) => capability === "a" ? "owner-a" : "owner-b";
    `,
    "src/app/acceptance/capability-proofs/validate-capability-proofs.ts": `
      import type { ToolcraftProductCapabilityId } from "../../../toolcraft/runtime/modules/contract/capability";
      const validators = new Map<ToolcraftProductCapabilityId, unknown>([["a", true], ["b", false]]);
      export const validate = (capability: ToolcraftProductCapabilityId) => validators.get(capability);
    `,
    "src/app/app-schema.ts": `
      import type { ToolcraftProductCapabilityId } from "../toolcraft/runtime/modules/contract/capability";
      const branches: Partial<Record<ToolcraftProductCapabilityId, unknown>> = {};
      export const selectBranch = (capability: ToolcraftProductCapabilityId) => branches[capability];
    `,
    "src/toolcraft/runtime/modules/contract/capability.ts": `export type ToolcraftProductCapabilityId = "a" | "b";`,
  });

  assert.deepEqual(collectToolcraftCapabilityProofInventoryDiagnostics(inventory), [
    { code: "feature-name-switchboard", repoPath: "apps/website/src/examples/example-schema.ts" },
    { code: "recipe-imports-catalog", repoPath: "src/app/acceptance/capability-proofs/a.ts" },
    { code: "feature-name-switchboard", repoPath: "src/app/acceptance/capability-proofs/owner-dispatch.ts" },
    { code: "feature-name-switchboard", repoPath: "src/app/acceptance/capability-proofs/validate-capability-proofs.ts" },
    { code: "feature-name-switchboard", repoPath: "src/app/app-schema.ts" },
  ]);
});

test("does not let an inventoried CLI MJS definition author escape", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "cli/src/old-author.mjs": `
      import { makeSchema } from "./runtime-wrapper.mjs";
      const build = makeSchema;
      export const schema = build({ canvas: { enabled: true }, panels: {} });
    `,
    "cli/src/runtime-wrapper.mjs": `
      export { defineToolcraft as makeSchema } from "@/toolcraft/runtime";
    `,
  });
  const diagnostics = collectToolcraftClosedConstructorDiagnostics(inventory);

  assert.deepEqual(diagnostics.defineAuthors, ["cli/src/old-author.mjs"]);
  assert.deepEqual(diagnostics.diagnostics, [
    { code: "constructor-alias", repoPath: "cli/src/old-author.mjs" },
    { code: "old-product-definition", repoPath: "cli/src/old-author.mjs" },
  ]);
});

test("covers starter and runtime composition owners as closed orchestration", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "packages/toolcraft-runtime/src/react/app-shell/compose-toolcraft-app.tsx": `
      import type { ToolcraftProductCapabilityId } from "../../../../../src/toolcraft/runtime/modules/contract/capability";
      const ports: Partial<Record<ToolcraftProductCapabilityId, unknown>> = {};
      export function composeToolcraftApp(capability: ToolcraftProductCapabilityId) {
        return ports[capability];
      }
    `,
    "src/app/acceptance/capability-proofs/catalog.ts": `
      export const TOOLCRAFT_CAPABILITY_PROOF_CATALOG = Object.freeze({ a: () => true, b: () => true });
    `,
    "src/toolcraft/runtime/modules/contract/capability.ts": `
      export type ToolcraftProductCapabilityId = "a" | "b";
    `,
    "starter/src/app/app-composition.tsx": `
      import type { ToolcraftProductCapabilityId } from "../../../src/toolcraft/runtime/modules/contract/capability";
      const compositions: Partial<Record<ToolcraftProductCapabilityId, unknown>> = {};
      export const appComposition = (capability: ToolcraftProductCapabilityId) => compositions[capability];
    `,
  });

  assert.deepEqual(collectToolcraftCapabilityProofInventoryDiagnostics(inventory), [
    {
      code: "feature-name-switchboard",
      repoPath: "packages/toolcraft-runtime/src/react/app-shell/compose-toolcraft-app.tsx",
    },
    {
      code: "feature-name-switchboard",
      repoPath: "starter/src/app/app-composition.tsx",
    },
  ]);
});

test("fails closed for namespace MJS definitions and manual signed compositions", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "cli/src/namespace-author.mjs": `
      import * as Runtime from "@/toolcraft/runtime";
      const oldShape = { canvas: { enabled: true }, panels: {} };
      export const schema = Runtime.defineToolcraft(oldShape);
      export const appComposition = { schema };
    `,
  });
  const diagnostics = collectToolcraftClosedConstructorDiagnostics(inventory);

  assert.deepEqual(diagnostics.defineAuthors, ["cli/src/namespace-author.mjs"]);
  assert.deepEqual(diagnostics.diagnostics, [
    { code: "constructor-alias", repoPath: "cli/src/namespace-author.mjs" },
    { code: "manual-app-composition", repoPath: "cli/src/namespace-author.mjs" },
    { code: "old-product-definition", repoPath: "cli/src/namespace-author.mjs" },
  ]);
});

test("accepts a public-constructor MJS signed composition", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "cli/src/current-composition.mjs": `
      import { composeToolcraftApp } from "@/toolcraft/runtime/react";
      const schema = {};
      export const appComposition = composeToolcraftApp(schema, {});
    `,
  });
  const diagnostics = collectToolcraftClosedConstructorDiagnostics(inventory);

  assert.deepEqual(diagnostics.compositionAuthors, [
    "cli/src/current-composition.mjs",
  ]);
  assert.deepEqual(diagnostics.diagnostics, []);
});
