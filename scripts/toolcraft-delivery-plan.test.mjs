import assert from "node:assert/strict";
import test from "node:test";

import {
  TOOLCRAFT_DELIVERY_PLAN_VERSION,
  createToolcraftDeliveryPlan,
  createToolcraftDeliveryPlanHash,
  getToolcraftDeliveryDiagnosticTier,
} from "./toolcraft-delivery-plan.mjs";
import {
  EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  createToolcraftFunctionalProofModel,
  createToolcraftFunctionalProofModelHash,
} from "./toolcraft-functional-proof-model.mjs";
import { createToolcraftDeliveryCatalog } from "./toolcraft-delivery-catalog.mjs";
import {
  hash,
  initialSteps,
  planningInputs,
  requestAuthority,
} from "./toolcraft-delivery-plan-test-helpers.mjs";

test("creates only the fixed complete initial functional plan", () => {
  const inputs = planningInputs({ initial: true });
  const plan = createToolcraftDeliveryPlan(inputs);

  assert.equal(TOOLCRAFT_DELIVERY_PLAN_VERSION, 6);
  assert.deepEqual(plan, {
    basis: { kind: "initial" },
    functionalProofModelHash: createToolcraftFunctionalProofModelHash(
      inputs.currentFunctionalProofModel,
    ),
    kind: "functional",
    lifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
    manifestHash: hash("a"),
    sourceHash: inputs.currentInventory.sourceHash,
    steps: initialSteps,
  });
  assert.equal(Object.isFrozen(plan), true);
  assert.match(createToolcraftDeliveryPlanHash(plan), /^[a-f0-9]{64}$/u);
  assert.equal(getToolcraftDeliveryDiagnosticTier(plan), 4);
});

test("initial delivery executes a shared browser scenario once while retaining every acceptance row", () => {
  const inputs = planningInputs({ initial: true });
  const browser = {
    budget: "extended-io",
    file: "e2e/product-export.spec.ts",
    testName: "browser: export image formats resolution and output",
  };
  const acceptance = ["export.progress", "export.image", "export.content"].map(
    (id) => ({ browser, id }),
  );
  const catalog = createToolcraftDeliveryCatalog({
    acceptance,
    availableTests: [{ file: browser.file, testName: browser.testName }],
    performancePaths: [],
    rootDir: process.cwd(),
  });
  const model = createToolcraftFunctionalProofModel({ catalog });
  const plan = createToolcraftDeliveryPlan({
    ...inputs,
    catalog,
    currentFunctionalProofModel: model,
  });

  assert.deepEqual(plan.steps.at(-1), {
    kind: "browser-functional",
    testNames: [browser.testName],
  });
  assert.deepEqual(plan.steps[2], {
    acceptanceIds: null,
    files: inputs.allProductTestFiles,
    kind: "product-tests",
  });
  assert.deepEqual(
    model.acceptance.map(({ acceptanceId, file, testName }) => ({
      acceptanceId,
      file,
      testName,
    })),
    ["export.content", "export.image", "export.progress"].map(
      (acceptanceId) => ({
        acceptanceId,
        file: browser.file,
        testName: browser.testName,
      }),
    ),
  );
  assert.equal(
    plan.functionalProofModelHash,
    createToolcraftFunctionalProofModelHash(model),
  );
  const incompleteModel = createToolcraftFunctionalProofModel({
    catalog: { ...catalog, acceptance: catalog.acceptance.slice(1) },
  });
  assert.notEqual(
    plan.functionalProofModelHash,
    createToolcraftFunctionalProofModelHash(incompleteModel),
  );
});

test("initial delivery does not deduplicate inconsistent exact scenario files", () => {
  const inputs = planningInputs({ initial: true });
  const first = inputs.catalog.acceptance[0];
  assert.throws(
    () =>
      createToolcraftDeliveryPlan({
        ...inputs,
        catalog: {
          ...inputs.catalog,
          acceptance: [
            first,
            {
              ...first,
              acceptanceId: "output.second",
              file: "e2e/other-output.spec.ts",
            },
          ],
        },
      }),
    /acceptance test name.*different files/iu,
  );
});

test("proven products cannot construct later functional delivery plans", () => {
  assert.throws(
    () => createToolcraftDeliveryPlan(planningInputs({ authority: null })),
    /does not create later functional delivery plans/iu,
  );
});

test("first delivery rejects performance authority", () => {
  assert.throws(
    () => createToolcraftDeliveryPlan(planningInputs({
      authority: requestAuthority,
      initial: true,
    })),
    /first delivery must be functional/iu,
  );
});
