import assert from "node:assert/strict";
import test from "node:test";

import {
  executeToolcraftDeliveryLifecycleCore,
} from "./toolcraft-delivery-lifecycle.mjs";
import {
  EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  createToolcraftFunctionalProofModel,
} from "./toolcraft-functional-proof-model.mjs";
import {
  createToolcraftDeliveryPlan,
} from "./toolcraft-delivery-plan.mjs";
import {
  createToolcraftDeliveryReceipt,
} from "./toolcraft-delivery-receipt.mjs";
import {
  createToolcraftVerificationSourceHash,
} from "./toolcraft-verification-inventory.mjs";

const hash = (character) => character.repeat(64);
const catalog = Object.freeze({
  acceptance: Object.freeze([Object.freeze({
    acceptanceId: "output.updates",
    contractHash: hash("b"),
    domainId: "output",
    file: "e2e/app-controls.spec.ts",
    testName: "browser: output updates",
  })]),
  performance: Object.freeze([]),
  version: 2,
});

const functionalProofModel = createToolcraftFunctionalProofModel({
  catalog,
});

function inventory(contents = "1") {
  const entries = Object.freeze([
    Object.freeze({
      path: "src/app/schema.test.ts",
      sha256: hash(contents),
    }),
  ]);
  return Object.freeze({
    entries,
    sourceHash: createToolcraftVerificationSourceHash(entries),
  });
}

function initialInputs(currentInventory) {
  return Object.freeze({
    allProductTestFiles: Object.freeze([
      "src/app/schema.test.ts",
    ]),
    authority: null,
    catalog,
    currentFunctionalProofModel: functionalProofModel,
    currentInventory,
    initialProof: null,
    integrity: Object.freeze({
      manifestHash: hash("a"),
      sourceHash: currentInventory.sourceHash,
    }),
    packageManager: "pnpm",
    previousLifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
    previousPerformance: Object.freeze({ kind: "none" }),
  });
}

function exactInitialResult(plan, finalInventory) {
  return Object.freeze({
    evidence: Object.freeze(plan.steps.map((step) => {
      if (step.kind === "product-tests") {
        return Object.freeze({ files: step.files, kind: step.kind });
      }
      if (step.kind === "browser-functional") {
        return Object.freeze({
          kind: step.kind,
          testNames: step.testNames,
        });
      }
      return Object.freeze({ kind: step.kind });
    })),
    finalInventory,
    planExecutionAuthority: Object.freeze(Object.create(null)),
  });
}

function dependencies({
  currentInventory,
  executePlan,
  onCommit = () => {},
}) {
  return Object.freeze({
    collectInventory: async () => currentInventory,
    collectFunctionalContext: async () =>
      Object.freeze({ catalog, currentFunctionalProofModel: functionalProofModel }),
    commit: async (value) => onCommit(value),
    createPlan: createToolcraftDeliveryPlan,
    createReceipt: createToolcraftDeliveryReceipt,
    evaluateIntegrity: async () =>
      initialInputs(currentInventory).integrity,
    executePlan,
    formatEscalationRecommendation: () => "",
    getEscalationRecommendation: () => null,
    loadPlanningInputs: async () => initialInputs(currentInventory),
    readDeliveryAnchor: async () => ({ missing: true }),
    readPerformanceAuthority: async () => null,
  });
}

test("first delivery creates one complete functional receipt", async () => {
  const currentInventory = inventory();
  let committed;
  let executedPlan;
  const receipt = await executeToolcraftDeliveryLifecycleCore({
    dependencies: dependencies({
      currentInventory,
      executePlan: async ({ plan }) => {
        executedPlan = plan;
        return exactInitialResult(plan, currentInventory);
      },
      onCommit: (value) => { committed = value; },
    }),
    projectDir: "/tmp/toolcraft-functional-initial",
  });

  assert.equal(receipt.version, 8);
  assert.equal(receipt.plan.kind, "functional");
  assert.deepEqual(receipt.plan.basis, { kind: "initial" });
  assert.deepEqual(
    executedPlan.steps.map(({ kind }) => kind),
    [
      "docs",
      "code-health",
      "product-tests",
      "build",
      "browser-functional",
    ],
  );
  assert.deepEqual(
    executedPlan.steps.find(({ kind }) => kind === "product-tests").files,
    ["src/app/schema.test.ts"],
  );
  assert.equal(
    executedPlan.steps.filter(({ kind }) =>
      kind.startsWith("browser-")).length,
    1,
  );
  assert.deepEqual(receipt.evidence.at(-1).testNames, [
    "browser: output updates",
  ]);
  assert.equal(Object.hasOwn(receipt, "performanceBaseline"), false);
  assert.equal(committed.receipt, receipt);
  assert.equal(committed.result.finalInventory, currentInventory);
});

test("executor failure writes no initial functional receipt", async () => {
  const currentInventory = inventory();
  let commits = 0;
  await assert.rejects(
    executeToolcraftDeliveryLifecycleCore({
      dependencies: dependencies({
        currentInventory,
        executePlan: async () => {
          throw new Error("combined browser proof failed");
        },
        onCommit: () => { commits += 1; },
      }),
      projectDir: "/tmp/toolcraft-functional-initial-failure",
    }),
    /combined browser proof failed/iu,
  );
  assert.equal(commits, 0);
});

test("final inventory mutation cannot create an initial functional receipt", async () => {
  const currentInventory = inventory();
  let commits = 0;
  await assert.rejects(
    executeToolcraftDeliveryLifecycleCore({
      dependencies: dependencies({
        currentInventory,
        executePlan: async ({ plan }) =>
          exactInitialResult(plan, inventory("2")),
        onCommit: () => { commits += 1; },
      }),
      projectDir: "/tmp/toolcraft-functional-initial-mutation",
    }),
    /final inventory.*source|execution evidence/iu,
  );
  assert.equal(commits, 0);
});
