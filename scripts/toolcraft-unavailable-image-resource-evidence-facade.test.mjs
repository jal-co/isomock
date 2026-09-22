import assert from "node:assert/strict";
import test from "node:test";

import {
  createArtifactAction,
  createSession,
  getHarnessState,
  loadUnavailableResourceFacade,
  resetHarness,
  setActivationError,
  setCleanupFailure,
  setMalformedActivation,
} from "./toolcraft-unavailable-resource-evidence-facade-test-helpers.mjs";

test("unavailable-image export recipe proves typed fault before evidence and cleans up", async (context) => {
  const facade = await loadUnavailableResourceFacade(context);
  resetHarness();
  const session = createSession();
  const fixture = facade.createToolcraftUnavailableImageResourceFixture(
    session,
    {
      fileName: "unavailable.png",
      sourceTarget: "source.images",
      target: "canvas.infinity",
    },
  );
  const exportAction = createArtifactAction(
    session,
    "canvas.infinity",
    new Uint8Array([1, 2, 3]),
  );
  const inspection =
    await facade.expectToolcraftInfinityCanvasUnavailableImageExportEvidence(
      fixture,
      exportAction,
      async () => ({ byteLength: 3, height: 2004, width: 2048 }),
      {
        expectedSize: { height: 2004, width: 2048 },
        requirementId: "canvas.infinity.image-export",
      },
    );

  assert.deepEqual(inspection, {
    byteLength: 3,
    height: 2004,
    width: 2048,
  });
  const state = getHarnessState();
  assert.equal(state.actionCalls, 2);
  assert.equal(state.artifactValidations, 1);
  assert.equal(state.closurelessObservationCalls, 4);
  assert.equal(state.sessionAssertions, 1);
  assert.deepEqual(state.attachments, [
    {
      evidenceType: "exported-artifact",
      requirementId: "canvas.infinity.image-export",
      target: "canvas.infinity",
    },
  ]);
  assert.deepEqual(state.trace, [
    "action:activate",
    "assert:active",
    "artifact",
    "assert:active",
    "action:cleanup",
    "assert:cleaned",
    "evidence:exported-artifact",
  ]);
  assert.deepEqual(state.bridgeActions, ["activate", "cleanup"]);
  assert.deepEqual(state.eventNames, [
    "toolcraft.browser-proof.unavailable-resource-request",
    "toolcraft.browser-proof.unavailable-resource-request",
  ]);
  assert.deepEqual(state.selectorNames, [
    '[data-slot="toolcraft-runtime-app"]',
    '[data-slot="toolcraft-runtime-app"]',
  ]);
  assert.ok(
    state.attributeNames.length > 0 &&
      state.attributeNames.every(
        (name) => name === "data-toolcraft-unavailable-resource-evidence",
      ),
  );
  assert.equal(state.pollCalls, 2);
});

test("unavailable-image export recipe cleans up and emits no evidence when decoded bounds fail", async (context) => {
  const facade = await loadUnavailableResourceFacade(context);
  resetHarness();
  const session = createSession();
  const fixture = facade.createToolcraftUnavailableImageResourceFixture(
    session,
    {
      fileName: "unavailable.png",
      target: "canvas.infinity",
    },
  );

  await assert.rejects(
    facade.expectToolcraftInfinityCanvasUnavailableImageExportEvidence(
      fixture,
      createArtifactAction(
        session,
        "canvas.infinity",
        new Uint8Array([1, 2, 3]),
      ),
      async () => ({ byteLength: 3, height: 100, width: 100 }),
      {
        expectedSize: { height: 2004, width: 2048 },
        requirementId: "canvas.infinity.image-export",
      },
    ),
  );

  assert.equal(getHarnessState().actionCalls, 2);
  assert.deepEqual(getHarnessState().attachments, []);
  assert.equal(getHarnessState().observation.status, "cleaned");
});

test("unavailable-image export recipe emits no evidence when cleanup fails", async (context) => {
  const facade = await loadUnavailableResourceFacade(context);
  resetHarness();
  setCleanupFailure();
  const session = createSession();
  const fixture = facade.createToolcraftUnavailableImageResourceFixture(
    session,
    {
      fileName: "unavailable.png",
      target: "canvas.infinity",
    },
  );

  await assert.rejects(
    facade.expectToolcraftInfinityCanvasUnavailableImageExportEvidence(
      fixture,
      createArtifactAction(
        session,
        "canvas.infinity",
        new Uint8Array([1, 2, 3]),
      ),
      async () => ({ byteLength: 3, height: 2004, width: 2048 }),
      {
        expectedSize: { height: 2004, width: 2048 },
        requirementId: "canvas.infinity.image-export",
      },
    ),
    /cleanup failed/u,
  );

  assert.deepEqual(getHarnessState().attachments, []);
  assert.deepEqual(getHarnessState().trace, [
    "action:activate",
    "assert:active",
    "artifact",
    "assert:active",
    "action:cleanup",
  ]);
});

test("unavailable-image export recipe surfaces bridge errors before artifact work", async (context) => {
  const facade = await loadUnavailableResourceFacade(context);
  resetHarness();
  setActivationError("activation failed");
  const session = createSession();
  const fixture = facade.createToolcraftUnavailableImageResourceFixture(
    session,
    { fileName: "unavailable.png", target: "canvas.infinity" },
  );

  await assert.rejects(
    facade.expectToolcraftInfinityCanvasUnavailableImageExportEvidence(
      fixture,
      createArtifactAction(
        session,
        "canvas.infinity",
        new Uint8Array([1]),
      ),
      async () => ({ byteLength: 1, height: 1, width: 1 }),
      {
        expectedSize: { height: 1, width: 1 },
        requirementId: "canvas.infinity.image-export",
      },
    ),
    /activation failed/u,
  );
  assert.deepEqual(getHarnessState().trace, ["action:activate"]);
  assert.deepEqual(getHarnessState().attachments, []);
});

test("unavailable-image export recipe rejects malformed bridge observations", async (context) => {
  const facade = await loadUnavailableResourceFacade(context);
  resetHarness();
  setMalformedActivation();
  const session = createSession();
  const fixture = facade.createToolcraftUnavailableImageResourceFixture(
    session,
    { fileName: "unavailable.png", target: "canvas.infinity" },
  );

  await assert.rejects(
    facade.expectToolcraftInfinityCanvasUnavailableImageExportEvidence(
      fixture,
      createArtifactAction(
        session,
        "canvas.infinity",
        new Uint8Array([1]),
      ),
      async () => ({ byteLength: 1, height: 1, width: 1 }),
      {
        expectedSize: { height: 1, width: 1 },
        requirementId: "canvas.infinity.image-export",
      },
    ),
    /published malformed state/u,
  );
  assert.deepEqual(getHarnessState().attachments, []);
});

test("unavailable-image export recipe rejects forged fixtures and target mismatch", async (context) => {
  const facade = await loadUnavailableResourceFacade(context);
  resetHarness();
  const session = createSession();
  const fixture = facade.createToolcraftUnavailableImageResourceFixture(
    session,
    {
      fileName: "unavailable.png",
      target: "canvas.infinity",
    },
  );

  await assert.rejects(
    facade.expectToolcraftInfinityCanvasUnavailableImageExportEvidence(
      {},
      { result: new Uint8Array([1]), target: "canvas.infinity" },
      async () => ({ byteLength: 1, height: 1, width: 1 }),
      {
        expectedSize: { height: 1, width: 1 },
        requirementId: "canvas.infinity.image-export",
      },
    ),
    /protected Toolcraft unavailable-resource fixture facade/u,
  );
  await assert.rejects(
    facade.expectToolcraftInfinityCanvasUnavailableImageExportEvidence(
      fixture,
      createArtifactAction(
        session,
        "actions.output",
        new Uint8Array([1]),
      ),
      async () => ({ byteLength: 1, height: 1, width: 1 }),
      {
        expectedSize: { height: 1, width: 1 },
        requirementId: "canvas.infinity.image-export",
      },
    ),
  );
  await assert.rejects(
    facade.expectToolcraftInfinityCanvasUnavailableImageExportEvidence(
      fixture,
      createArtifactAction(
        createSession(),
        "canvas.infinity",
        new Uint8Array([1]),
      ),
      async () => ({ byteLength: 1, height: 1, width: 1 }),
      {
        expectedSize: { height: 1, width: 1 },
        requirementId: "canvas.infinity.image-export",
      },
    ),
    /same browser proof session/u,
  );
  assert.equal(getHarnessState().actionCalls, 0);
  assert.deepEqual(getHarnessState().attachments, []);
});
