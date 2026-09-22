import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { createToolcraftHostCallOrigin } from "./toolcraft-host-call-origin.mjs";

test("cyclic evaluated call-result origins remain unknown instead of recursing", () => {
  const first = { expression: {}, arguments: [] };
  const second = { expression: {}, arguments: [] };
  const calls = new Map([[first, second], [second, first]]);
  let callOrigin;
  const operations = {
    originOf(value, visited, context) {
      return calls.has(value) ? callOrigin(value, visited, context)
        : [{ kind: "unknown" }];
    },
  };
  callOrigin = createToolcraftHostCallOrigin({
    ts,
    flowValues: { resultAt: (call) => ({ kind: "exact", values: [calls.get(call)] }) },
    mergeFacts: (facts) => facts,
    operations,
  });
  assert.deepEqual(callOrigin(first, new Set(), {}), [
    { kind: "unknown", overflow: true },
  ]);
});
