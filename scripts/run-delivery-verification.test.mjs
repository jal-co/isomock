import assert from "node:assert/strict";
import test from "node:test";

import { runToolcraftDeliveryVerification } from "./run-delivery-verification.mjs";
import {
  TOOLCRAFT_INITIAL_PROOF_ALREADY_COMPLETE,
  executeToolcraftDeliveryLifecycleCore,
} from "./toolcraft-delivery-lifecycle.mjs";
import {
  assertNoPerformanceAuthority,
  createDeliveryFixture,
  readDeliveryEvents,
  removeDeliveryFixture,
} from "./run-delivery-verification-test-helpers.mjs";

test("proven product returns before all delivery proof work", async () => {
  const calls = {
    anchorReads: 0,
    performanceAuthorityReads: 0,
  };
  const dependencies = Object.freeze({
    collectInventory: async () => {
      throw new Error("inventory must not be collected");
    },
    collectFunctionalContext: async () => {
      throw new Error("functional context must not be collected");
    },
    commit: async () => {
      throw new Error("checkpoint must not be committed");
    },
    createPlan: () => {
      throw new Error("plan must not be created");
    },
    createReceipt: () => { throw new Error("receipt must not be created"); },
    evaluateIntegrity: async () => {
      throw new Error("integrity must not be evaluated");
    },
    executePlan: async () => {
      throw new Error("proof must not execute");
    },
    formatEscalationRecommendation: () => "",
    getEscalationRecommendation: () => null,
    loadPlanningInputs: async () => {
      throw new Error("planning inputs must not be loaded");
    },
    readDeliveryAnchor: async () => {
      calls.anchorReads += 1;
      return {
        anchor: Object.freeze({ sourceHash: "a".repeat(64) }),
        receipt: Object.freeze({ kind: "initial-delivery-receipt" }),
      };
    },
    readPerformanceAuthority: async () => {
      calls.performanceAuthorityReads += 1;
      return null;
    },
  });

  const result = await executeToolcraftDeliveryLifecycleCore({
    dependencies, projectDir: "/tmp/toolcraft-proven-product",
  });

  assert.equal(result, TOOLCRAFT_INITIAL_PROOF_ALREADY_COMPLETE);
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(calls, {
    anchorReads: 1,
    performanceAuthorityReads: 1,
  });
});

test("consumed performance authority returns before all delivery proof work", async () => {
  const authority = Object.freeze({ hash: "b".repeat(64) });
  const dependencies = Object.freeze({
    collectInventory: async () => {
      throw new Error("inventory must not be collected");
    },
    readDeliveryAnchor: async () => ({
      anchor: Object.freeze({
        lifecycle: Object.freeze({
          consumedPerformanceRequestAuthorityHashes: Object.freeze([
            authority.hash,
          ]),
          performanceEscalationOffered: false,
        }),
      }),
      receipt: Object.freeze({ kind: "initial-delivery-receipt" }),
    }),
    readPerformanceAuthority: async () => authority,
  });

  const result = await executeToolcraftDeliveryLifecycleCore({
    dependencies,
    projectDir: "/tmp/toolcraft-consumed-performance-authority",
  });

  assert.equal(result, TOOLCRAFT_INITIAL_PROOF_ALREADY_COMPLETE);
});

test("missing initial proof still executes the complete delivery lifecycle", async () => {
  const calls = [];
  const receipt = Object.freeze({ kind: "initial-delivery-receipt" });
  const functionalContext = Object.freeze({
    currentFunctionalProofModel: Object.freeze({ kind: "model" }),
  });
  const dependencies = Object.freeze({
    collectInventory: async () => {
      calls.push("inventory");
      return Object.freeze({ entries: Object.freeze([]), sourceHash: "a".repeat(64) });
    },
    collectFunctionalContext: async () => {
      calls.push("functional-context");
      return functionalContext;
    },
    commit: async () => { calls.push("commit"); },
    createPlan: () => {
      calls.push("plan");
      return Object.freeze({ kind: "functional" });
    },
    createReceipt: () => {
      calls.push("receipt");
      return receipt;
    },
    evaluateIntegrity: async () => {
      calls.push("integrity");
      return Object.freeze({ manifestHash: "b".repeat(64) });
    },
    executePlan: async () => {
      calls.push("execute");
      return Object.freeze({ finalInventory: Object.freeze({}) });
    },
    formatEscalationRecommendation: () => "",
    getEscalationRecommendation: () => null,
    loadPlanningInputs: async ({ authority }) => {
      calls.push("planning-inputs");
      assert.equal(authority, null);
      return Object.freeze({ kind: "inputs" });
    },
    readDeliveryAnchor: async () => {
      calls.push("anchor");
      return Object.freeze({ missing: true });
    },
    readPerformanceAuthority: async () => {
      calls.push("performance-authority");
      return null;
    },
  });

  const result = await executeToolcraftDeliveryLifecycleCore({
    dependencies, projectDir: "/tmp/toolcraft-unproven-product",
  });

  assert.equal(result, receipt);
  assert.deepEqual(calls, [
    "anchor",
    "performance-authority",
    "inventory",
    "integrity",
    "functional-context",
    "planning-inputs",
    "plan",
    "execute",
    "receipt",
    "commit",
  ]);
});

test("malformed initial proof fails closed before phase resolution", async () => {
  await assert.rejects(
    executeToolcraftDeliveryLifecycleCore({
      dependencies: Object.freeze({
        readDeliveryAnchor: async () => ({ error: "malformed checkpoint" }),
      }),
      projectDir: "/tmp/toolcraft-malformed-product",
    }),
    /malformed checkpoint/u,
  );
});

test("public delivery accepts only an optional package-manager separator", async (t) => {
  for (const arguments_ of [
    ["--reason=performance-iteration"],
    ["--unexpected=delivery-policy"],
    ["unexpected-positional-value"],
    ["--", "--unexpected=delivery-policy"],
  ]) {
    const rootDir = createDeliveryFixture();
    t.after(() => removeDeliveryFixture(rootDir));
    await assert.rejects(
      runToolcraftDeliveryVerification({ arguments_, projectDir: rootDir }),
      /does not accept arguments/iu,
    );
    assert.deepEqual(readDeliveryEvents(rootDir), []);
    assertNoPerformanceAuthority(rootDir);
  }

  const separatorRoot = createDeliveryFixture();
  t.after(() => removeDeliveryFixture(separatorRoot));
  await assert.rejects(
    runToolcraftDeliveryVerification({
      arguments_: ["--"],
      projectDir: separatorRoot,
    }),
    /manifest/iu,
  );
});
