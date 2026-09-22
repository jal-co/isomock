import assert from "node:assert/strict";
import test from "node:test";

import {
  executeClosurelessObservation,
  getHarnessState,
  loadUnavailableResourceFacade,
  resetHarness,
} from "./toolcraft-unavailable-resource-evidence-facade-test-helpers.mjs";

test("closureless observation harness rejects browser callbacks with outer references", () => {
  const readAttribute = (root) => root.getAttribute("data-value");
  assert.throws(
    () => executeClosurelessObservation((root) => readAttribute(root), {}),
    /readAttribute is not defined/u,
  );
});

function createFiniteObservation(width, height) {
  return {
    artboardPresent: true,
    canvasMode: "finite",
    finiteCanvasSize: { height, width },
    finiteControlSize: { height, width },
    finiteControlsPresent: { aspectRatio: true, height: true, width: true },
    overflow: "hidden",
    productScene: {
      backingHeight: 400,
      backingWidth: 640,
      viewportRect: { height: 400, width: 640, x: -320, y: -200 },
      worldRect: { height: 400, width: 640, x: -320, y: -200 },
    },
    productSceneStatus: null,
    viewport: { offsetX: 0, offsetY: 0, zoom: 100 },
  };
}

function createInfiniteObservation() {
  return {
    artboardPresent: false,
    canvasMode: "infinite",
    finiteCanvasSize: null,
    finiteControlSize: null,
    finiteControlsPresent: { aspectRatio: false, height: false, width: false },
    overflow: "visible",
    productScene: {
      backingHeight: 400,
      backingWidth: 640,
      viewportRect: { height: 400, width: 640, x: -320, y: -200 },
      worldRect: { height: 400, width: 640, x: -320, y: -200 },
    },
    productSceneStatus: "ready",
    viewport: { offsetX: 0, offsetY: 0, zoom: 100 },
  };
}

const preservedTransition = Object.freeze({
  productHostPreserved: true,
  productOutputPreserved: true,
});

function createPreservedTransitions() {
  return {
    afterReloadToRestored: preservedTransition,
    beforeToEnabled: preservedTransition,
    restoredToUndone: preservedTransition,
    undoneToRedone: preservedTransition,
  };
}

function createModeObservations() {
  const before = createFiniteObservation(1920, 1080);
  const infinite = createInfiniteObservation();
  const afterPan = {
    ...infinite,
    productScene: {
      ...infinite.productScene,
      viewportRect: {
        ...infinite.productScene.viewportRect,
        x: infinite.productScene.viewportRect.x + 24,
        y: infinite.productScene.viewportRect.y - 12,
      },
    },
    viewport: { offsetX: 24, offsetY: -12, zoom: 100 },
  };
  const withPostPan = (observation) => ({
    ...observation,
    productScene: afterPan.productScene,
    viewport: afterPan.viewport,
  });
  return {
    afterPan,
    afterReload: withPostPan(infinite),
    before,
    enabled: infinite,
    redone: withPostPan(before),
    restored: withPostPan(before),
    undone: withPostPan(infinite),
  };
}

function replaceRecordEntry(record, key, patch) {
  record[key] = { ...record[key], ...patch };
}

function replaceObservationPart(observations, key, part, patch) {
  replaceRecordEntry(observations, key, {
    [part]: { ...observations[key][part], ...patch },
  });
}

function replaceProductRect(observations, key, rect, patch) {
  const productScene = observations[key].productScene;
  replaceObservationPart(observations, key, "productScene", {
    [rect]: { ...productScene[rect], ...patch },
  });
}

function replaceEveryProductScene(observations, patch) {
  for (const key of Object.keys(observations)) {
    replaceObservationPart(observations, key, "productScene", patch);
  }
}

function runInfinityModeEvidence(facade, observations, transitions) {
  return facade.expectToolcraftInfinityCanvasModeEvidence(
    observations,
    transitions,
    {
      expectedFiniteSize: { height: 1080, width: 1920 },
      expectedSceneRect: observations.before.productScene.worldRect,
      requirementId: "canvas.infinity.mode",
      target: "canvas.infinity",
    },
  );
}

test("Infinity mode recipe rejects a wrong restored dormant finite size", async (context) => {
  const facade = await loadUnavailableResourceFacade(context);
  resetHarness();
  const observations = createModeObservations();

  await assert.rejects(
    runInfinityModeEvidence(
      facade,
      {
        ...observations,
        restored: createFiniteObservation(1280, 720),
      },
      createPreservedTransitions(),
    ),
  );
  assert.deepEqual(getHarnessState().attachments, []);
});

test("Infinity mode recipe accepts exact restored dormant finite dimensions", async (context) => {
  const facade = await loadUnavailableResourceFacade(context);
  resetHarness();
  const observations = createModeObservations();

  await runInfinityModeEvidence(
    facade,
    observations,
    createPreservedTransitions(),
  );
  assert.deepEqual(getHarnessState().attachments, [
    {
      evidenceType: "viewport-side-effect",
      requirementId: "canvas.infinity.mode",
      target: "canvas.infinity",
    },
    {
      evidenceType: "infinity-mode-continuity",
      requirementId: "canvas.infinity.mode",
      target: "canvas.infinity",
    },
  ]);
});

for (const [name, update] of [
  ["viewport offset", ({ observations }) =>
    replaceObservationPart(observations, "enabled", "viewport", { offsetX: 1 })],
  ["viewport zoom", ({ observations }) =>
    replaceObservationPart(observations, "enabled", "viewport", { zoom: 125 })],
  ["product world rect", ({ observations }) =>
    replaceProductRect(observations, "undone", "worldRect", { width: 639 })],
  ["product viewport rect", ({ observations }) =>
    replaceProductRect(observations, "restored", "viewportRect", { x: -319 })],
  ["product backing", ({ observations }) =>
    replaceObservationPart(observations, "redone", "productScene", {
      backingWidth: 639,
    })],
  ["all-null product backing", ({ observations }) =>
    replaceEveryProductScene(observations, {
      backingHeight: null,
      backingWidth: null,
    })],
  ["zero-area product viewport rect", ({ observations }) =>
    replaceEveryProductScene(observations, {
      viewportRect: { height: 400, width: 0, x: -320, y: -200 },
    })],
  ["product host identity", ({ transitions }) =>
    replaceRecordEntry(transitions, "restoredToUndone", {
      productHostPreserved: false,
    })],
  ["product output identity", ({ transitions }) =>
    replaceRecordEntry(transitions, "undoneToRedone", {
      productOutputPreserved: false,
    })],
]) {
  test(`Infinity mode recipe rejects mismatched ${name}`, async (context) => {
    const facade = await loadUnavailableResourceFacade(context);
    resetHarness();
    const observations = createModeObservations();
    const transitions = createPreservedTransitions();
    update({ observations, transitions });

    await assert.rejects(
      runInfinityModeEvidence(facade, observations, transitions),
    );
    assert.deepEqual(getHarnessState().attachments, []);
  });
}
