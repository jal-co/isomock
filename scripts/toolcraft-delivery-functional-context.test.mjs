import assert from "node:assert/strict";
import test from "node:test";

import {
  collectToolcraftDeliveryFunctionalContext,
  collectToolcraftDeliveryFunctionalContextCore,
} from "./toolcraft-delivery-functional-context.mjs";
import {
  getToolcraftFunctionalProofModelError,
} from "./toolcraft-functional-proof-model.mjs";
import {
  createDeliveryFixture,
  removeDeliveryFixture,
} from "./run-delivery-verification-test-helpers.mjs";

test("functional context collects the canonical catalog once", async () => {
  const calls = { catalog: 0, model: 0 };
  const catalog = Object.freeze({
    acceptance: Object.freeze([]),
    performance: Object.freeze([]),
    version: 2,
  });
  const currentFunctionalProofModel = Object.freeze({
    acceptance: Object.freeze([]),
    version: 2,
  });

  const context = await collectToolcraftDeliveryFunctionalContextCore({
    dependencies: Object.freeze({
      collectCatalog: async () => {
        calls.catalog += 1;
        return catalog;
      },
      createFunctionalProofModel: (input) => {
        calls.model += 1;
        assert.equal(input.catalog, catalog);
        return currentFunctionalProofModel;
      },
    }),
    projectDir: "/tmp/toolcraft-functional-context",
  });

  assert.deepEqual(calls, { catalog: 1, model: 1 });
  assert.deepEqual(Object.keys(context), [
    "catalog",
    "currentFunctionalProofModel",
  ]);
  assert.equal(context.catalog, catalog);
  assert.equal(context.currentFunctionalProofModel, currentFunctionalProofModel);
  assert.equal(Object.isFrozen(context), true);
});

test("public functional context builds one valid canonical model", async (t) => {
  const rootDir = createDeliveryFixture();
  t.after(() => removeDeliveryFixture(rootDir));

  const context = await collectToolcraftDeliveryFunctionalContext(rootDir);

  assert.equal(
    getToolcraftFunctionalProofModelError(
      context.currentFunctionalProofModel,
    ),
    undefined,
  );
  assert.deepEqual(
    context.currentFunctionalProofModel.acceptance,
    context.catalog.acceptance,
  );
});
