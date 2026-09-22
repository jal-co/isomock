import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { exact, objectFact } from "./toolcraft-flow-facts.mjs";
import { toolcraftFlowStateKey } from "./toolcraft-flow-state-keys.mjs";

test("shared immutable state stores stay within the state-key serialization budget", () => {
  const nodes = Array.from({ length: 128 }, (_, index) => ({
    end: index + 2,
    kind: 80,
    pos: index + 1,
  }));
  const properties = new Map(nodes.map((node, index) => [
    `property-${index}`,
    exact([node]),
  ]));
  const sharedObject = objectFact(properties);
  const shared = Object.freeze({
    callables: new Map(),
    cells: new Map(),
    environment: new Map(),
    exit: "normal",
    exitLabel: undefined,
    objects: new Map(nodes.map((node) => [node, sharedObject])),
    overflow: false,
    returnFact: exact([nodes[0]]),
    thisFact: exact([nodes[1]]),
  });
  const states = Array.from({ length: 512 }, () => Object.freeze({ ...shared }));

  const startedAt = performance.now();
  const keys = states.map(toolcraftFlowStateKey);
  const durationMs = performance.now() - startedAt;

  assert.equal(new Set(keys).size, 1);
  assert.ok(
    durationMs < 400,
    `shared state-key serialization took ${durationMs.toFixed(1)}ms (limit 400ms)`,
  );
});
