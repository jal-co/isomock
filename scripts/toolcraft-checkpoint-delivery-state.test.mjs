import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeliveryFixture,
  functionalTestName,
  removeDeliveryFixture,
} from "./run-delivery-verification-test-helpers.mjs";
import {
  assertDeliveryCheckpointState,
} from "./toolcraft-checkpoint-delivery-state.mjs";
import {
  commitToolcraftDeliveryCheckpoint,
} from "./toolcraft-checkpoint-transaction.mjs";
import {
  executeToolcraftDeliveryPlan,
} from "./toolcraft-delivery-executor.mjs";
import {
  EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  createToolcraftDeliveryReceipt,
} from "./toolcraft-delivery-receipt.mjs";
import {
  createFunctionalProofModelFixture,
  createPlanReceiptFixture,
} from "./toolcraft-delivery-receipt-test-helpers.mjs";
import {
  createToolcraftFunctionalProofModelHash,
} from "./toolcraft-functional-proof-model.mjs";
import {
  collectToolcraftVerificationInputs,
} from "./toolcraft-verification-inventory.mjs";

const hash = (character) => character.repeat(64);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

async function executeInitialFixture(rootDir) {
  const finalInventory =
    await collectToolcraftVerificationInputs(rootDir);
  const functionalSteps = [
    { kind: "docs" },
    { kind: "code-health" },
    {
      acceptanceIds: null,
      files: ["src/app/schema.test.ts"],
      kind: "product-tests",
    },
    { kind: "build" },
    {
      kind: "browser-functional",
      testNames: [functionalTestName],
    },
  ];
  const common = {
    basis: { kind: "initial" },
    manifestHash: finalInventory.entries.find(
      ({ path }) =>
        path === "src/toolcraft/.toolcraft-manifest.json",
    ).sha256,
    sourceHash: finalInventory.sourceHash,
  };
  const functionalProofModel = createFunctionalProofModelFixture();
  const plan = deepFreeze({
    ...common,
    functionalProofModelHash:
      createToolcraftFunctionalProofModelHash(functionalProofModel),
    kind: "functional",
    lifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
    steps: functionalSteps,
  });
  const execution = await executeToolcraftDeliveryPlan({
    plan,
    projectDir: rootDir,
  });
  return {
    execution,
    receipt: createToolcraftDeliveryReceipt({
      functionalProofModel,
      plan,
      result: execution,
    }),
  };
}

test("genuinely absent previous receipt permits an initial basis", async () => {
  const initialFixture = createPlanReceiptFixture("functional-initial");
  const initialReceipt = createToolcraftDeliveryReceipt(initialFixture);
  await assert.doesNotReject(assertDeliveryCheckpointState({
    deliveryReceipt: initialReceipt,
    finalInventory: initialFixture.result.finalInventory,
    previousDeliveryReceipt: undefined,
  }));
});

test("real initial functional delivery commits only without a predecessor", async (t) => {
  const freshRoot = createDeliveryFixture();
  const existingRoot = createDeliveryFixture();
  t.after(() => {
    removeDeliveryFixture(freshRoot);
    removeDeliveryFixture(existingRoot);
  });

  const fresh = await executeInitialFixture(freshRoot);
  await assert.doesNotReject(
    assertDeliveryCheckpointState({
      deliveryReceipt: fresh.receipt,
      finalInventory: fresh.execution.finalInventory,
      previousDeliveryReceipt: undefined,
    }),
  );
  await assert.doesNotReject(
    commitToolcraftDeliveryCheckpoint({
      deliveryReceipt: fresh.receipt,
      finalInventory: fresh.execution.finalInventory,
      planExecutionAuthority:
        fresh.execution.planExecutionAuthority,
      projectDir: freshRoot,
    }),
  );

  const previous = await executeInitialFixture(existingRoot);
  await commitToolcraftDeliveryCheckpoint({
    deliveryReceipt: previous.receipt,
    finalInventory: previous.execution.finalInventory,
    planExecutionAuthority:
      previous.execution.planExecutionAuthority,
    projectDir: existingRoot,
  });
  const rejected = await executeInitialFixture(existingRoot);
  await assert.rejects(
    assertDeliveryCheckpointState({
      deliveryReceipt: rejected.receipt,
      finalInventory: rejected.execution.finalInventory,
      previousDeliveryReceipt: previous.receipt,
    }),
    /initial delivery basis requires no previous/iu,
  );
  await assert.rejects(
    commitToolcraftDeliveryCheckpoint({
      deliveryReceipt: rejected.receipt,
      finalInventory: rejected.execution.finalInventory,
      planExecutionAuthority:
        rejected.execution.planExecutionAuthority,
      projectDir: existingRoot,
    }),
    /initial delivery basis requires no previous/iu,
  );
});

test("present malformed, unsupported, and legacy receipts fail closed", async () => {
  const initialFixture = createPlanReceiptFixture("functional-initial");
  const initialReceipt = createToolcraftDeliveryReceipt(initialFixture);
  const previousReceipt = initialReceipt;
  const legacyPlan = deepFreeze({
    ...previousReceipt.plan,
    kind: "legacy-delivery",
  });
  for (const [previousDeliveryReceipt, expected] of [
    [{ version: 6 }, /unsupported version/iu],
    [{ version: 7 }, /unsupported version/iu],
    [{ ...previousReceipt, plan: legacyPlan }, /delivery plan is malformed/iu],
  ]) {
    await assert.rejects(
      assertDeliveryCheckpointState({
        deliveryReceipt: initialReceipt,
        finalInventory: initialFixture.result.finalInventory,
        previousDeliveryReceipt,
      }),
      (error) => {
        assert.match(error.message, expected);
        assert.doesNotMatch(error.message, /initial delivery basis/iu);
        return true;
      },
    );
  }
});

test("targeted performance basis must match the initial proof identity", async () => {
  const initialFixture = createPlanReceiptFixture("functional-initial");
  const initialReceipt = createToolcraftDeliveryReceipt(initialFixture);
  const targetedFixture = createPlanReceiptFixture("performance-iteration");
  const targetedPlan = deepFreeze({
    ...targetedFixture.plan,
    basis: {
      ...targetedFixture.plan.basis,
      initialFunctionalProofModelHash:
        initialReceipt.functionalProofModelHash,
      initialSourceHash: initialReceipt.sourceHash,
    },
  });
  const targetedReceipt = createToolcraftDeliveryReceipt({
    ...targetedFixture,
    plan: targetedPlan,
  });
  await assert.doesNotReject(assertDeliveryCheckpointState({
    deliveryReceipt: targetedReceipt,
    finalInventory: targetedFixture.result.finalInventory,
    previousDeliveryReceipt: initialReceipt,
  }));
  await assert.rejects(
    assertDeliveryCheckpointState({
      deliveryReceipt: targetedReceipt,
      finalInventory: targetedFixture.result.finalInventory,
      previousDeliveryReceipt: {
        ...initialReceipt,
        sourceHash: hash("9"),
      },
    }),
    /source|inventory|plan/iu,
  );
});
