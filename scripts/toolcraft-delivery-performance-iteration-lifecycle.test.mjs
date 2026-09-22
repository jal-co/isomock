import assert from "node:assert/strict";
import test from "node:test";

import {
  executeToolcraftDeliveryLifecycleCore,
} from "./toolcraft-delivery-lifecycle.mjs";
import {
  createToolcraftDeliveryPlan,
} from "./toolcraft-delivery-plan.mjs";
import {
  planningInputs,
  requestAuthority,
} from "./toolcraft-delivery-plan-test-helpers.mjs";

function dependencies({
  executePlan,
  initial = false,
  onCommit = () => {},
  previous,
}) {
  const inputs = planningInputs({
    authority: requestAuthority,
    initial,
  });
  return Object.freeze({
    collectInventory: async () => inputs.currentInventory,
    collectFunctionalContext: async () => ({
      catalog: inputs.catalog,
      currentFunctionalProofModel: inputs.currentFunctionalProofModel,
    }),
    commit: async (value) => onCommit(value),
    createPlan: createToolcraftDeliveryPlan,
    createReceipt: ({ plan }) => Object.freeze({
      kind: "targeted-performance-verification",
      plan,
    }),
    evaluateIntegrity: async () => inputs.integrity,
    executePlan,
    formatEscalationRecommendation: () => "",
    getEscalationRecommendation: () => null,
    loadPlanningInputs: async () => inputs,
    readDeliveryAnchor: async () => previous,
    readPerformanceAuthority: async () => requestAuthority,
  });
}

const previous = Object.freeze({
  anchor: Object.freeze({
    functionalProofModelHash: "d".repeat(64),
    lifecycle: Object.freeze({
      consumedPerformanceRequestAuthorityHashes: Object.freeze([]),
      performanceEscalationOffered: false,
    }),
    performance: Object.freeze({ kind: "none" }),
    sourceHash: "e".repeat(64),
  }),
  receipt: Object.freeze({ kind: "initial-delivery" }),
});

test("one bare delivery runs only build plus exact authorized performance", async () => {
  let committed;
  let executed;
  const result = Object.freeze({ finalInventory: Object.freeze({}) });
  const receipt = await executeToolcraftDeliveryLifecycleCore({
    dependencies: dependencies({
      executePlan: async ({ plan }) => {
        executed = plan;
        return result;
      },
      onCommit: (value) => { committed = value; },
      previous,
    }),
    projectDir: "/tmp/toolcraft-targeted-performance",
  });

  assert.equal(receipt.plan.kind, "performance-iteration");
  assert.deepEqual(executed.steps.map(({ kind }) => kind), [
    "build",
    "browser-performance",
  ]);
  assert.equal(committed.receipt, receipt);
});

test("failed targeted performance writes no checkpoint", async () => {
  let commits = 0;
  await assert.rejects(
    executeToolcraftDeliveryLifecycleCore({
      dependencies: dependencies({
        executePlan: async () => {
          throw new Error("targeted performance failed");
        },
        onCommit: () => { commits += 1; },
        previous,
      }),
      projectDir: "/tmp/toolcraft-targeted-performance-failure",
    }),
    /targeted performance failed/iu,
  );
  assert.equal(commits, 0);
});

test("performance authority cannot run before initial product proof", async () => {
  const deps = dependencies({
    executePlan: async () => {
      throw new Error("must not execute");
    },
    initial: true,
    previous: Object.freeze({ missing: true }),
  });
  await assert.rejects(
    executeToolcraftDeliveryLifecycleCore({
      dependencies: deps,
      projectDir: "/tmp/toolcraft-unproven-performance",
    }),
    /first delivery must be functional/iu,
  );
});
