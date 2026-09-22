import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { createToolcraftFlowLiteralValues } from "./toolcraft-flow-literal-values.mjs";
import { exact } from "./toolcraft-flow-facts.mjs";

function arrayFixture(source, alternatives) {
  const parsed = ts.createSourceFile(
    "literal.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const node = parsed.statements[0].expression;
  const state = { exit: "normal", overflow: false };
  const owner = createToolcraftFlowLiteralValues({
    evaluateExpression: (expression, current) =>
      Array.from({ length: alternatives }, () => ({
        fact: exact([expression]),
        state: current,
      })),
    memory: {
      commitEvaluatedLiteral: (_value, current) => current,
      positionalShapeFromFact: () => undefined,
    },
    truth: () => "true",
    ts,
  });
  return owner.arrayOutcomes(node, state, 0, []);
}

test("array literal world overflow stays bounded and explicitly unresolved", () => {
  const outcomes = arrayFixture("[first, ...rest, last]", 33);
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].state.overflow, true);
  const shape = outcomes[0].evaluatedValue.positionalShape;
  assert.ok(shape.evidence.includes("overflow-span"));
  assert.deepEqual(shape.slots, []);
  assert.ok(shape.tails.length > 0);
});

test("unknown spread retains the known prefix without inventing following positions", () => {
  const outcomes = arrayFixture("[first, ...rest, last]", 1);
  assert.equal(outcomes.length, 1);
  const shape = outcomes[0].evaluatedValue.positionalShape;
  assert.ok(shape.evidence.includes("unknown-length"));
  assert.equal(shape.slots.length, 1);
  assert.equal(shape.tails.length, 2);
});
