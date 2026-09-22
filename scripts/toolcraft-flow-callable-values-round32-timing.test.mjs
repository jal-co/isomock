import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import ts from "typescript";

import { createToolcraftFlowCallableValues } from
  "./toolcraft-flow-callable-values.mjs";
import { exact } from "./toolcraft-flow-facts.mjs";

test("known primitive values skip semantic callable lookups within budget", () => {
  let typeReads = 0;
  const checker = {
    getSignaturesOfType: () => [],
    getTypeAtLocation() {
      typeReads += 1;
      const deadline = performance.now() + 0.25;
      while (performance.now() < deadline) {
        // Model the non-trivial cost of a real TypeScript semantic lookup.
      }
      return { flags: ts.TypeFlags.NumberLiteral };
    },
  };
  const index = { unwrap: (node) => node };
  const memory = { callableAt: () => undefined };
  const callableValues = createToolcraftFlowCallableValues({
    checker, index, memory, objectProvenance: {}, ts,
  });
  const literal = ts.factory.createNumericLiteral(1);
  const state = { callables: new Map(), environment: new Map() };

  const startedAt = performance.now();
  for (let index = 0; index < 128; index += 1) {
    assert.deepEqual(callableValues.candidatesAt(
      exact([literal]), literal, state,
    ), []);
  }
  const durationMs = performance.now() - startedAt;

  assert.ok(
    durationMs < 20,
    `primitive callable resolution took ${durationMs.toFixed(1)}ms (limit 20ms)`,
  );
  assert.equal(typeReads, 0);
});
