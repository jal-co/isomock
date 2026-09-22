import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { createToolcraftNodeEsmResolver } from "./toolcraft-node-esm-resolution.mjs";

test("resolves duplicate edge batches through one bounded resolver process", async () => {
  const resolver = createToolcraftNodeEsmResolver();
  try {
    const importer = path.join(import.meta.dirname, "fixture.mjs");
    const requests = Array.from({ length: 40 }, () => ({ importer, specifier: "typescript" }));
    const processId = resolver.processId;
    const resolved = await resolver.resolveMany(requests);
    assert.equal(new Set(resolved).size, 1);
    assert.match(resolved[0], /typescript/u);
    assert.equal(resolver.processId, processId);
  } finally {
    await resolver.close();
  }
});
