import assert from "node:assert/strict";
import test from "node:test";

import { UNKNOWN, emptyState, toolcraftEmptyPropertyRemainder, withCompletion } from
  "./toolcraft-flow-facts.mjs";
import { normalizeOperationWorlds } from "./toolcraft-flow-operation-worlds.mjs";
import { toolcraftDataDescriptor } from
  "./toolcraft-flow-property-descriptors.mjs";

test("4096 typed operation worlds deterministically exhaust at or below 128", async () => {
  const { createOperationExhaustionWorld, createOperationWorld,
    operationWorldSemanticKey } = await import(
    "./toolcraft-flow-operation-world-types.mjs"
  );
  const worlds = Array.from({ length: 4096 }, (_, position) => {
    const completion = position % 17 === 0 ? "throw" : "normal";
    return createOperationWorld({ completion,
      cursor: `cursor:${position}`, descriptorMode: "spread-copy",
      kind: "property-copy", owner: `owner:${position % 257}`,
      patchPresence: "none", payload: {
        descriptors: position === 0 || position === 2048 || position === 4095
          ? new Map([["danger", toolcraftDataDescriptor(UNKNOWN)]]) : new Map(),
        propertyRemainder: toolcraftEmptyPropertyRemainder(),
      },
      state: withCompletion(emptyState(), completion) });
  });
  const forward = normalizeOperationWorlds(worlds);
  const reverse = normalizeOperationWorlds([...worlds].reverse());
  assert.equal(forward.length <= 128, true, forward.length);
  assert.equal(forward.every(({ exhausted, exhaustionEvent, state }) =>
    exhausted === true && exhaustionEvent?.kind === "ExhaustionEvent" &&
      exhaustionEvent.originalCardinality > 0 && state.overflow === false), true);
  assert.equal(forward.reduce((total, { exhaustionEvent }) =>
    total + exhaustionEvent.originalCardinality, 0), 4096);
  assert.deepEqual(forward.map(operationWorldSemanticKey),
    reverse.map(operationWorldSemanticKey));
  assert.equal(forward.some(({ payload }) =>
    payload.descriptors.get("danger")?.alternatives.some(
      ({ kind }) => kind !== "absent"
    )), true);
  assert.equal(forward.some(({ payload }) => {
    const descriptor = payload.descriptors.get("danger");
    return descriptor?.alternatives.some(({ kind }) => kind === "absent") &&
      descriptor.alternatives.some(({ kind }) => kind !== "absent");
  }), true);

  const safe = normalizeOperationWorlds(worlds.map((world) => createOperationWorld({
    ...world, payload: { descriptors: new Map(),
      propertyRemainder: toolcraftEmptyPropertyRemainder() },
  })));
  assert.equal(safe.some(({ payload }) => payload.descriptors.has("danger")), false);

  const raised = normalizeOperationWorlds(worlds.slice(0, 129), { limit: 1000 });
  assert.equal(raised.length <= 128, true, raised.length);

  const mixed = normalizeOperationWorlds(Array.from({ length: 129 }, (_, position) =>
    createOperationWorld({ completion: "normal", cursor: `mixed:${position}`,
      descriptorMode: position === 0 ? "spread-copy" : "current",
      kind: "property-copy", owner: "mixed-owner", patchPresence: "none",
      payload: position === 0 ? {
        descriptors: new Map([["danger", toolcraftDataDescriptor(UNKNOWN)]]),
        propertyRemainder: toolcraftEmptyPropertyRemainder(),
      } : {}, state: emptyState() })));
  const mixedDanger = mixed[0].payload.descriptors.get("danger");
  assert.equal(mixedDanger.alternatives.some(({ kind }) => kind === "absent"), true);
  assert.equal(mixedDanger.alternatives.some(({ kind }) => kind !== "absent"), true);

  const currentOnly = normalizeOperationWorlds(Array.from({ length: 129 },
    (_, position) => createOperationWorld({ completion: "normal",
      cursor: `current:${position}`, descriptorMode: "current",
      kind: "property-copy", owner: "current-owner", patchPresence: "none",
      payload: {}, state: emptyState() })));
  assert.deepEqual(currentOnly[0].payload, {});

  assert.throws(() => createOperationWorld({ ...worlds[1], completion: "throw" }),
    TypeError);
  assert.throws(() => createOperationExhaustionWorld({ completion: "throw",
    cursors: ["cursor"], descriptorModes: ["current"], kind: "property-copy",
    originalCardinality: 1, owners: ["owner"], patchPresences: ["none"],
    payload: {}, state: emptyState() }), TypeError);
  assert.throws(() => normalizeOperationWorlds([
    Object.freeze({ ...worlds[1], phase: "forged" }),
  ]), TypeError);
  const propertyCursor = { alternatives: Object.freeze([]),
    coverage: toolcraftEmptyPropertyRemainder().coverage,
    dynamicId: "cursor", kind: "PropertyKeyFact", unbounded: false };
  assert.throws(() => createOperationWorld({ ...worlds[1], cursor: {
    ...propertyCursor, phase: "before" } }), TypeError);
  assert.throws(() => createOperationWorld({ ...worlds[1], cursor: {
    ...propertyCursor, [Symbol("phase")]: "after" } }), TypeError);
});
