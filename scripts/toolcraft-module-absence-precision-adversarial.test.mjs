import assert from "node:assert/strict";
import test from "node:test";

import {
  collectToolcraftCutoverAbsenceDiagnostics,
  createToolcraftCutoverFixtureInventory,
} from "./toolcraft-module-cutover-test-utils.mjs";

test("resolves URL href module references and fails closed for unknown URLs", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "packages/hidden-runtime/package.json": `{
      "name": "@hidden/runtime",
      "exports": { ".": "./src/index.ts" }
    }`,
    "packages/hidden-runtime/src/index.ts": `export const publicValue = true;`,
    "packages/hidden-runtime/src/modules/private.ts": `export const secret = true;`,
    "src/safe-worker.mjs": `export const safe = true;`,
    "src/url-alias.mjs": `
      const privateUrl = new URL("@private/private", import.meta.url);
      void import(privateUrl.href);
    `,
    "src/url-direct.mjs": `
      void import(new URL("@private/private", import.meta.url).href);
    `,
    "src/url-candidate.mjs": `
      import path from "node:path";
      import { pathToFileURL } from "node:url";
      export const loadCandidate = (root, candidate) =>
        import(pathToFileURL(path.join(root, "scripts", candidate)).href);
    `,
    "src/url-path.mjs": `
      import { pathToFileURL } from "node:url";
      void import(pathToFileURL("@private/private").href);
    `,
    "src/url-static-path.mjs": `
      import { pathToFileURL } from "node:url";
      void import(pathToFileURL("./safe-worker.mjs").href);
    `,
    "src/url-safe.mjs": `
      const workerUrl = new URL("./safe-worker.mjs", import.meta.url);
      void import(workerUrl.href);
    `,
    "src/url-unknown.mjs": `void import(runtimeUrl.href);`,
    "tsconfig.json": `{
      "compilerOptions": {
        "baseUrl": ".",
        "paths": { "@private/*": ["packages/hidden-runtime/src/modules/*"] }
      }
    }`,
  });

  assert.deepEqual(collectToolcraftCutoverAbsenceDiagnostics(inventory), [
    { code: "deep-module-import", repoPath: "src/url-alias.mjs" },
    { code: "non-static-module-reference", repoPath: "src/url-candidate.mjs" },
    { code: "deep-module-import", repoPath: "src/url-direct.mjs" },
    { code: "deep-module-import", repoPath: "src/url-path.mjs" },
    { code: "non-static-module-reference", repoPath: "src/url-unknown.mjs" },
  ]);
});

test("traces alternate and cleanup legacy storage keys without flagging preferences", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "src/legacy-cleanup-flow.ts": `
      const previousNamespace = ["creative", "apps", "kit"].join("-");
      const previousKey = (currentKey: string) =>
        previousNamespace + currentKey.slice("toolcraft".length);
      export function clear(storage: Pick<Storage, "removeItem">, currentKey: string) {
        storage.removeItem(currentKey);
        storage.removeItem(previousKey(currentKey));
      }
    `,
    "src/legacy-read-flow.ts": `
      const previousNamespace = ["creative", "apps", "kit"].join("-");
      function previousKey(currentKey: string) {
        return previousNamespace + currentKey.slice("toolcraft".length);
      }
      export function read(storage: Pick<Storage, "getItem">, currentKey: string) {
        return storage.getItem(currentKey) ?? storage.getItem(previousKey(currentKey));
      }
    `,
    "src/preferences.ts": `
      export function readPreferences(storage: Pick<Storage, "getItem">) {
        const language = storage.getItem("defaultCodeLanguage");
        const packageManager = storage.getItem("defaultPackageManager");
        return { language, packageManager, slug: language?.replace("-", "_") };
      }
    `,
  });

  assert.deepEqual(collectToolcraftCutoverAbsenceDiagnostics(inventory), [
    { code: "old-storage-key-reader", repoPath: "src/legacy-cleanup-flow.ts" },
    { code: "old-storage-key-reader", repoPath: "src/legacy-read-flow.ts" },
  ]);
});

test("limits compatibility diagnostics to semantic owners", async (context) => {
  const inventory = await createToolcraftCutoverFixtureInventory(context, {
    "src/control-contract.ts": `
      export type ControlContract = {
        applicability?: { mode: "always"; origin: "legacy" };
        target: string;
        type: "slider";
      };
    `,
    "src/default-assets.ts": `
      import { createToolcraftDataUrlResourceRef as allocate } from "@/toolcraft/runtime";
      type Asset = { dataUrl: string; id: string; mimeType: string };
      export function hydrateDefaults(schema: { media: { defaultAssets: Asset[] } }) {
        const assets = schema.media.defaultAssets;
        if (!Array.isArray(assets)) return [];
        return assets.map((asset) => ({
          assetId: asset.id,
          mimeType: asset.mimeType,
          resourceRef: allocate("image", asset.dataUrl),
        }));
      }
    `,
    "src/derived-section.ts": `
      export const deriveSection = (slug: string) => ({
        controls: {},
        id: "legacy." + slug,
      });
    `,
    "src/generic-records.ts": `
      export type OptionalMetadata = { applicability?: string };
      export const record = { id: "legacy.not-a-control-section" };
      export const comparesProtocol = (event: { oldVersion: number }) => event.oldVersion === 1;
    `,
    "src/idb-upgrade.ts": `
      export function openStorage(indexedDB: IDBFactory) {
        const request = indexedDB.open("assets", 2);
        request.onupgradeneeded = (event) => {
          if (event.oldVersion === 1) return;
        };
      }
    `,
    "src/persisted-inline.ts": `
      import { createToolcraftDataUrlResourceRef as allocate } from "@/toolcraft/runtime";
      export function restoreAssets(value: unknown) {
        if (!Array.isArray(value)) return [];
        return value.flatMap((candidate) =>
          candidate && typeof candidate.dataUrl === "string" && typeof candidate.id === "string" && typeof candidate.mimeType === "string"
            ? [{ assetId: candidate.id, resourceRef: allocate("image", candidate.dataUrl) }]
            : [],
        );
      }
    `,
  });

  assert.deepEqual(collectToolcraftCutoverAbsenceDiagnostics(inventory), [
    { code: "legacy-control-applicability", repoPath: "src/control-contract.ts" },
    { code: "legacy-section-id", repoPath: "src/derived-section.ts" },
    { code: "indexeddb-v1-upgrade", repoPath: "src/idb-upgrade.ts" },
    { code: "persisted-inline-media-upgrade", repoPath: "src/persisted-inline.ts" },
  ]);
});
