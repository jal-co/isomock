import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

import { emptyState, exact, toolcraftEmptyPropertyRemainder } from
  "./toolcraft-flow-facts.mjs";
import { toolcraftDataDescriptor } from
  "./toolcraft-flow-property-descriptors.mjs";
import { createToolcraftFlowPropertyOperations } from
  "./toolcraft-flow-property-operations.mjs";
import { createToolcraftFlowPropertyCopy } from
  "./toolcraft-flow-property-copy.mjs";
import { createToolcraftTypeScriptChecker } from
  "./toolcraft-typescript-analysis.mjs";

const MAX_OPERATION_WORLDS = 128;

function enumeration(reverse = false) {
  const source = ts.factory.createIdentifier("source");
  const names = Array.from({ length: 8 }, (_, position) => `field${position}`);
  if (reverse) names.reverse();
  const descriptors = new Map(names.map((name) => [name,
    toolcraftDataDescriptor(exact([
      ts.factory.createIdentifier(`value_${name}`),
    ]), { enumerable: "unknown" })
  ]));
  const memory = {
    candidatesForOutcome: () => [],
    ownDescriptorOutcomesFromFact(ownerFact, cursor, state) {
      return descriptors.get(cursor).alternatives.map((alternative) => ({
        alternative, ownerFact, receiverFact: ownerFact, state,
      }));
    },
    ownDescriptorsFromFact: (_fact, state) => [{
      descriptors,
      ownerFact: exact([source]),
      propertyRemainder: toolcraftEmptyPropertyRemainder(),
      state,
    }],
  };
  const sourceFile = ts.createSourceFile(
    "round36-operation-worlds.ts", "", ts.ScriptTarget.Latest, true,
  );
  const propertyKeys = { emptyCoverage: () => ({ string: {
    finiteTypes: [], typeIds: [], unbounded: false }, symbol: {
    finiteTypes: [], typeIds: [], unbounded: false } }), mergeCoverage: () => ({}) };
  memory.propertyKeys = propertyKeys;
  const operations = createToolcraftFlowPropertyOperations({
    checker: createToolcraftTypeScriptChecker(sourceFile, ts),
    index: { unwrap: (node) => node },
    memory,
    propertyKeys,
    ts,
  });
  return createToolcraftFlowPropertyCopy({ memory, propertyOperations: operations })
    .evaluatedOwnDescriptors(exact([source]), emptyState(), {
    applyCandidate: () => [],
  });
}

function modeSignature(worlds) {
  const modes = new Map();
  const names = new Set(worlds.flatMap(({ descriptors }) => [...descriptors.keys()]));
  for (const name of names) modes.set(name, new Set());
  for (const world of worlds) {
    for (const name of names) {
      const descriptor = world.descriptors.get(name);
      if (!descriptor) modes.get(name).add("absent");
      else for (const alternative of descriptor.alternatives) {
        modes.get(name).add(alternative.kind);
      }
    }
  }
  return [...modes].sort(([left], [right]) => left.localeCompare(right))
    .map(([name, alternatives]) => [name, [...alternatives].sort()]);
}

test("descriptor enumeration bounds uncertain worlds without losing modes", () => {
  const forward = enumeration();
  const reverse = enumeration(true);

  assert.ok(
    forward.length <= MAX_OPERATION_WORLDS,
    `enumeration created ${forward.length} worlds (limit ${MAX_OPERATION_WORLDS})`,
  );
  assert.ok(reverse.length <= MAX_OPERATION_WORLDS);
  assert.deepEqual(modeSignature(forward), modeSignature(reverse));
  assert.equal(modeSignature(forward).length, 8);
  assert.ok(modeSignature(forward).every(([, modes]) =>
    modes.includes("absent") && modes.includes("data")
  ));
});
