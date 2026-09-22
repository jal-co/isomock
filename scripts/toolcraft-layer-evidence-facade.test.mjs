import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import ts from "typescript";

const starterRoot = path.resolve(import.meta.dirname, "..");
const helperPath = path.join(
  starterRoot,
  "e2e/browser-layer-evidence-helpers.ts",
);

async function loadLayerEvidenceFacade(context) {
  const outputDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-layer-evidence-"),
  );
  context.after(() => fs.rm(outputDir, { force: true, recursive: true }));
  const outputPath = path.join(outputDir, "browser-layer-evidence-helpers.mjs");
  const source = (await fs.readFile(helperPath, "utf8"))
    .replaceAll('"@playwright/test"', '"./playwright.mjs"')
    .replaceAll(
      '"./browser-acceptance-transition-helpers"',
      '"./transition.mjs"',
    )
    .replaceAll('"./browser-runtime-evidence"', '"./evidence.mjs"')
    .replaceAll('"./browser-proof-session"', '"./proof-session.mjs"')
    .replaceAll(
      '"./browser-selection-scope-evidence"',
      '"./selection-scope.mjs"',
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
        import assert from "node:assert/strict";
        export function expect(actual, message = "Expectation failed") {
          return {
            not: {
              toBe(expected) {
                assert.notEqual(actual, expected, message);
              },
              toEqual(expected) {
                assert.notDeepEqual(actual, expected, message);
              },
            },
            toBe(expected) {
              assert.equal(actual, expected, message);
            },
            toEqual(expected) {
              assert.deepEqual(actual, expected, message);
            },
          };
        }
      `,
    ),
    fs.writeFile(
      path.join(outputDir, "transition.mjs"),
      `
        export function createToolcraftSemanticTransitionOptions(message, options) {
          return { message, ...options };
        }
        export async function expectToolcraftExpectedOutcomeAfterAction() {
          globalThis.__toolcraftLayerEvidenceTransitionCalls += 1;
          return globalThis.__toolcraftLayerEvidenceTransition;
        }
      `,
    ),
    fs.writeFile(
      path.join(outputDir, "evidence.mjs"),
      `
        export async function attachToolcraftBrowserRuntimeEvidence(evidence) {
          globalThis.__toolcraftLayerEvidenceAttachments.push(evidence);
        }
      `,
    ),
    fs.writeFile(
      path.join(outputDir, "proof-session.mjs"),
      `
        export function getToolcraftBrowserActionTarget(action) {
          return action.target;
        }
      `,
    ),
    fs.writeFile(
      path.join(outputDir, "selection-scope.mjs"),
      `
        export async function expectToolcraftSelectionScopedControl(options) {
          globalThis.__toolcraftLayerSelectionScopeCalls.push(options);
          globalThis.__toolcraftLayerEvidenceAttachments.push({
            evidenceType: "product-observable-change",
            requirementId: options.requirementId,
            target: options.propertyTarget,
          });
          globalThis.__toolcraftLayerEvidenceAttachments.push({
            evidenceType: "selection-scoped-control",
            requirementId: options.requirementId,
            target: options.propertyTarget,
          });
        }
      `,
    ),
  ]);

  return import(`${pathToFileURL(outputPath).href}?test=${Date.now()}`);
}

function setTransition(before, after) {
  globalThis.__toolcraftLayerEvidenceTransition = { after, before };
}

test("layer recipes attach exact-target base and specialized evidence", async (context) => {
  const facade = await loadLayerEvidenceFacade(context);
  globalThis.__toolcraftLayerEvidenceAttachments = [];
  globalThis.__toolcraftLayerSelectionScopeCalls = [];
  globalThis.__toolcraftLayerEvidenceTransitionCalls = 0;
  const action = { target: "layers.semantic-target" };
  const observation = {};
  const options = {
    requirementId: "layers.requirement",
    stabilityIntervalMs: 0,
  };

  setTransition(
    { outputSignature: "before", selectedLayerId: "layer-a" },
    { outputSignature: "after", selectedLayerId: "layer-b" },
  );
  await facade.expectToolcraftLayerSelection(
    observation,
    action,
    globalThis.__toolcraftLayerEvidenceTransition.after,
    options,
  );

  setTransition(
    {
      layerId: "layer-a",
      outputSignature: "before",
      visible: true,
    },
    {
      layerId: "layer-a",
      outputSignature: "after",
      visible: false,
    },
  );
  await facade.expectToolcraftLayerVisibility(
    observation,
    action,
    globalThis.__toolcraftLayerEvidenceTransition.after,
    options,
  );

  setTransition(
    { layerIds: ["layer-a", "layer-b"], outputSignature: "before" },
    { layerIds: ["layer-b", "layer-a"], outputSignature: "after" },
  );
  await facade.expectToolcraftLayerReorder(
    observation,
    action,
    globalThis.__toolcraftLayerEvidenceTransition.after,
    options,
  );

  setTransition(
    {
      groupSignature: "before",
      layerIds: ["layer-a", "layer-b"],
      outputSignature: "before",
    },
    {
      groupSignature: "after",
      layerIds: ["layer-a", "layer-b"],
      outputSignature: "after",
    },
  );
  await facade.expectToolcraftLayerGrouping(
    observation,
    action,
    globalThis.__toolcraftLayerEvidenceTransition.after,
    options,
  );

  const selectedLayerOptions = {
    propertyTarget: action.target,
    requirementId: options.requirementId,
  };
  await facade.expectToolcraftSelectedLayerControl(selectedLayerOptions);

  setTransition(
    { layerIds: ["layer-a"], outputSignature: "before" },
    {
      layerIds: ["layer-a", "layer-b"],
      outputSignature: "after",
    },
  );
  await facade.expectToolcraftLayerMediaLifecycle(
    observation,
    action,
    globalThis.__toolcraftLayerEvidenceTransition.after,
    options,
  );

  const expectedEvidence = [
    {
      evidenceType: "layer-selection",
      requirementId: options.requirementId,
      target: action.target,
    },
    ...[
      ["product-observable-change", "layer-visibility"],
      ["product-observable-change", "layer-reorder"],
      ["product-observable-change", "layer-grouping"],
    ].flatMap(([baseEvidenceType, specializedEvidenceType]) => [
      {
        evidenceType: baseEvidenceType,
        requirementId: options.requirementId,
        target: action.target,
      },
      {
        evidenceType: specializedEvidenceType,
        requirementId: options.requirementId,
        target: action.target,
      },
    ]),
    {
      evidenceType: "product-observable-change",
      requirementId: options.requirementId,
      target: action.target,
    },
    {
      evidenceType: "selection-scoped-control",
      requirementId: options.requirementId,
      target: action.target,
    },
    {
      evidenceType: "layer-selected-layer-controls",
      requirementId: options.requirementId,
      target: action.target,
    },
    {
      evidenceType: "media-lifecycle",
      requirementId: options.requirementId,
      target: action.target,
    },
    {
      evidenceType: "layer-media-lifecycle",
      requirementId: options.requirementId,
      target: action.target,
    },
  ];
  assert.deepEqual(
    globalThis.__toolcraftLayerEvidenceAttachments,
    expectedEvidence,
  );
  assert.equal(globalThis.__toolcraftLayerEvidenceTransitionCalls, 5);
  assert.deepEqual(globalThis.__toolcraftLayerSelectionScopeCalls, [
    selectedLayerOptions,
  ]);
});

test("layer recipes fail before assertions or evidence when action has no target", async (context) => {
  const facade = await loadLayerEvidenceFacade(context);
  globalThis.__toolcraftLayerEvidenceAttachments = [];
  globalThis.__toolcraftLayerEvidenceTransitionCalls = 0;
  setTransition(
    { outputSignature: "before", selectedLayerId: "layer-a" },
    { outputSignature: "after", selectedLayerId: "layer-b" },
  );

  await assert.rejects(
    facade.expectToolcraftLayerSelection(
      {},
      {},
      globalThis.__toolcraftLayerEvidenceTransition.after,
      { requirementId: "layers.selection" },
    ),
    /target-scoped browser action/u,
  );
  assert.equal(globalThis.__toolcraftLayerEvidenceTransitionCalls, 0);
  assert.deepEqual(globalThis.__toolcraftLayerEvidenceAttachments, []);
});
