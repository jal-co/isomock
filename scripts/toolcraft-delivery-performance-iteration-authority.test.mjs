import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolcraftPlanExecutionAuthorityRegistry,
} from "./toolcraft-plan-execution-authority.mjs";
import {
  createToolcraftDeliveryReceipt,
} from "./toolcraft-delivery-receipt.mjs";
import {
  createPlanReceiptFixture,
} from "./toolcraft-delivery-receipt-test-helpers.mjs";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test("caller-authored evidence cannot mint plan execution authority", async () => {
  const { functionalProofModel, plan, result } = createPlanReceiptFixture(
    "performance-iteration",
  );
  const registry = createToolcraftPlanExecutionAuthorityRegistry(async () =>
    deepFreeze(structuredClone(result)),
  );
  const receipt = createToolcraftDeliveryReceipt({
    functionalProofModel,
    plan,
    result,
  });

  assert.throws(
    () =>
      registry.reserve({
        authority: Object.freeze(Object.create(null)),
        deliveryReceipt: receipt,
        projectDir: "/workspace/app",
      }),
    /protected plan execution authority/iu,
  );
});

test("authority remains bound to its executed performance report", async () => {
  const { functionalProofModel, plan, result } = createPlanReceiptFixture(
    "performance-iteration",
  );
  const projectDir = "/workspace/app";
  const registry = createToolcraftPlanExecutionAuthorityRegistry(async () =>
    deepFreeze(structuredClone(result)),
  );
  const execution = await registry.execute({ plan, projectDir });
  const receipt = createToolcraftDeliveryReceipt({
    functionalProofModel,
    plan,
    result: execution,
  });
  const performanceIndex = receipt.evidence.length - 1;
  const forgedReceipt = {
    ...receipt,
    evidence: receipt.evidence.map((entry, index) =>
      index === performanceIndex
        ? {
            ...entry,
            report: { ...entry.report, nonce: "forged-nonce" },
          }
        : entry,
    ),
  };

  assert.throws(
    () =>
      registry.reserve({
        authority: execution.planExecutionAuthority,
        deliveryReceipt: forgedReceipt,
        projectDir,
      }),
    /protected plan execution authority/iu,
  );
  const reservation = registry.reserve({
    authority: execution.planExecutionAuthority,
    deliveryReceipt: receipt,
    projectDir,
  });
  registry.finalize(reservation);
});
