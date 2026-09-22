import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolcraftDeliveryPlan,
  getToolcraftDeliveryPlanError,
} from "./toolcraft-delivery-plan.mjs";
import {
  planningInputs,
} from "./toolcraft-delivery-plan-test-helpers.mjs";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test("plan validation rejects mutable, incomplete, and expanded proof", () => {
  const initial = createToolcraftDeliveryPlan(planningInputs({ initial: true }));
  assert.match(getToolcraftDeliveryPlanError({ ...initial }), /immutable/iu);
  assert.match(
    getToolcraftDeliveryPlanError(deepFreeze({
      ...initial,
      steps: initial.steps.filter(({ kind }) => kind !== "build"),
    })),
    /preceding build/iu,
  );

  const performance = createToolcraftDeliveryPlan(planningInputs());
  assert.match(
    getToolcraftDeliveryPlanError(deepFreeze({
      ...performance,
      steps: [
        { kind: "code-health" },
        ...performance.steps,
      ],
    })),
    /expands beyond exact performance work/iu,
  );
});

test("planning input validation is exact and phase-aware", () => {
  const extra = planningInputs({ initial: true });
  extra.changeSet = {};
  assert.throws(
    () => createToolcraftDeliveryPlan(extra),
    /planning inputs are malformed/iu,
  );

  const malformedProof = planningInputs();
  malformedProof.initialProof = { sourceHash: "bad" };
  assert.throws(
    () => createToolcraftDeliveryPlan(malformedProof),
    /initial product proof identity/iu,
  );
});
