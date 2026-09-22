import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import ts from "typescript";

const starterRoot = path.resolve(import.meta.dirname, "..");
const helperPath = path.join(starterRoot, "e2e/product-observable-helpers.ts");

async function loadProductObservableFacade(context) {
  const outputDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-product-observable-"),
  );
  context.after(() => fs.rm(outputDir, { force: true, recursive: true }));
  const outputPath = path.join(outputDir, "product-observable-helpers.mjs");
  const source = (await fs.readFile(helperPath, "utf8"))
    .replaceAll('"@playwright/test"', '"./playwright.mjs"')
    .replaceAll('"./browser-runtime-evidence"', '"./evidence.mjs"')
    .replaceAll('"./browser-proof-session"', '"./proof-session.mjs"')
    .replaceAll('"./stable-outcome-helpers"', '"./stable-outcome.mjs"')
    .replaceAll(
      '"./browser-product-raster-snapshot"',
      '"./raster-snapshot.mjs"',
    );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: helperPath,
  });

  await Promise.all([
    fs.writeFile(outputPath, outputText),
    fs.writeFile(
      path.join(outputDir, "playwright.mjs"),
      `
        export function expect(actual, message = "Expectation failed") {
          return {
            async toBeVisible() {
              if (!actual?.visible) throw new Error(message);
            },
          };
        }
      `,
    ),
    fs.writeFile(
      path.join(outputDir, "evidence.mjs"),
      `
        export async function attachToolcraftBrowserRuntimeEvidence(evidence) {
          globalThis.__toolcraftProductObservableAttachments.push(evidence);
        }
      `,
    ),
    fs.writeFile(
      path.join(outputDir, "proof-session.mjs"),
      `
        export function assertToolcraftBrowserActionForSession(session, action) {
          if (action.session !== session) throw new Error("wrong proof session");
        }
        export function getToolcraftBrowserActionTarget(action) {
          return action.target;
        }
        export async function getToolcraftBrowserProofPage(session) {
          return session.page;
        }
        export function isToolcraftBrowserAction(action) {
          return action?.kind === "action";
        }
        export function isToolcraftBrowserProofSession(session) {
          return session?.kind === "session";
        }
        export async function runToolcraftBrowserAction(action) {
          await action.run();
        }
      `,
    ),
    fs.writeFile(
      path.join(outputDir, "stable-outcome.mjs"),
      `
        export async function expectToolcraftPersistentOutcomeAfterAction(
          observe,
          action,
          options,
        ) {
          const before = await observe();
          await action();
          const after = await observe();
          if (after === before) {
            throw new Error(options.message);
          }
        }
      `,
    ),
    fs.writeFile(
      path.join(outputDir, "raster-snapshot.mjs"),
      `
        const warmedPages = new WeakSet();
        const screenshotOptions = {
          animations: "disabled",
          caret: "hide",
          scale: "css",
          type: "png",
        };

        export async function resolveToolcraftProductRasterProbe(page, probe) {
          const locator = page.locator(probe.selector);
          const bounds = await locator.boundingBox();
          if (
            !bounds ||
            bounds.width <= 0 ||
            bounds.height <= 0 ||
            bounds.width > 4096 ||
            bounds.height > 4096 ||
            bounds.width * bounds.height > 8_388_608
          ) {
            throw new Error(
              'Raster probe exceeds the bounded visual proof limit.',
            );
          }
          return {
            bounds,
            locator,
            async capture() {
              if (!warmedPages.has(page)) {
                await locator.screenshot(screenshotOptions);
                warmedPages.add(page);
              }
              const raster = await locator.screenshot(screenshotOptions);
              return JSON.stringify(await page.evaluate(() => undefined, raster));
            },
          };
        }
      `,
    ),
  ]);

  return import(`${pathToFileURL(outputPath).href}?test=${Date.now()}`);
}

function createPage({
  height = 100,
  raster = [137, 80, 78, 71],
  width = 160,
} = {}) {
  const state = {
    height,
    metadata: {
      ariaLabel: "before",
      className: "before",
      hiddenContent: "before",
      href: "/before",
      role: "img",
    },
    raster: [...raster],
    rasterEvaluations: 0,
    screenshotCalls: 0,
    selector: null,
    width,
  };
  const locator = {
    visible: true,
    async boundingBox() {
      return { height: state.height, width: state.width, x: 8, y: 12 };
    },
    first() {
      return this;
    },
    async screenshot(options) {
      assert.deepEqual(options, {
        animations: "disabled",
        caret: "hide",
        scale: "css",
        type: "png",
      });
      state.screenshotCalls += 1;
      return Uint8Array.from(state.raster);
    },
  };

  return {
    page: {
      async evaluate(_reader, input) {
        if (input === undefined) return undefined;
        state.rasterEvaluations += 1;
        let hash = 2166136261;
        for (const byte of state.raster) {
          hash ^= byte;
          hash = Math.imul(hash, 16777619);
        }
        return {
          height: state.height,
          rasterHash: (hash >>> 0).toString(16),
          width: state.width,
        };
      },
      locator(selector) {
        state.selector = selector;
        return locator;
      },
    },
    state,
  };
}

test("product observable proof targets the exact product scene canvas and SVG", async (context) => {
  const facade = await loadProductObservableFacade(context);
  const { page, state } = createPage();

  await facade.getToolcraftProductObservableSnapshot(page);

  assert.equal(
    state.selector,
    [
      "[data-toolcraft-product-output]",
      "[data-toolcraft-product-text]",
      "[data-toolcraft-product-scene] canvas",
      "[data-toolcraft-product-scene] svg",
      "[data-toolcraft-canvas-world] canvas",
      "[data-toolcraft-canvas-world] svg",
    ].join(", "),
  );
});

test("product observable proof rejects metadata-only and hidden bookkeeping changes", async (context) => {
  const facade = await loadProductObservableFacade(context);
  globalThis.__toolcraftProductObservableAttachments = [];
  const { page, state } = createPage();

  await assert.rejects(
    facade.expectToolcraftProductObservableToChange(page, async () => {
      state.metadata = {
        ariaLabel: "after",
        className: "after",
        hiddenContent: "after",
        href: "/after",
        role: "presentation",
      };
    }),
    /Product output should change/u,
  );

  assert.equal(state.screenshotCalls, 3);
  assert.equal(state.rasterEvaluations, 2);
  assert.deepEqual(globalThis.__toolcraftProductObservableAttachments, []);
});

test("product observable proof detects a visible raster change and attaches exact evidence", async (context) => {
  const facade = await loadProductObservableFacade(context);
  globalThis.__toolcraftProductObservableAttachments = [];
  const { page, state } = createPage();
  const session = { kind: "session", page };
  const action = {
    kind: "action",
    run: async () => {
      state.raster = [137, 80, 78, 71, 1];
    },
    session,
    target: "material.chocolate",
  };

  await facade.expectToolcraftProductObservableToChange(session, action, {
    requirementId: "material.chocolate",
  });

  assert.equal(state.screenshotCalls, 3);
  assert.equal(state.rasterEvaluations, 2);
  assert.deepEqual(globalThis.__toolcraftProductObservableAttachments, [
    {
      evidenceType: "product-observable-change",
      requirementId: "material.chocolate",
      target: "material.chocolate",
    },
  ]);
});

test("product observable proof fails closed before capturing an oversized surface", async (context) => {
  const facade = await loadProductObservableFacade(context);
  const { page, state } = createPage({ height: 2200, width: 4096 });

  await assert.rejects(
    facade.getToolcraftProductObservableSnapshot(page),
    /exceeds the bounded visual proof limit/u,
  );
  assert.equal(state.screenshotCalls, 0);
});
