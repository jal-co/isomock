import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolcraftDeliveryPlan,
  getToolcraftDeliveryDiagnosticTier,
  getToolcraftDeliveryPlanError,
} from "./toolcraft-delivery-plan.mjs";
import {
  createToolcraftDeliveryLifecycleState,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  createToolcraftPerformanceRequestAuthorityHash,
} from "./toolcraft-performance-authority-policy.mjs";
import {
  deepFreezeToolcraftValue,
} from "./toolcraft-functional-proof-primitives.mjs";
import {
  createToolcraftTargetedPerformanceComparisonHash,
  createToolcraftTargetedPerformanceReport,
} from "./toolcraft-targeted-performance-report.mjs";
import {
  createTargetedMeasurementFixture,
} from "./toolcraft-verification-receipt-test-helpers.mjs";
import {
  authoritySource,
  pathId,
  performanceTestName,
  performanceSteps,
  planningInputs,
  requestAuthority,
} from "./toolcraft-delivery-plan-test-helpers.mjs";

function createPreviousPerformance(sourceHash) {
  const requestAuthorityHash = "e".repeat(64);
  const report = createToolcraftTargetedPerformanceReport({
    fixtureResolutionMode: "strict-development",
    fixtureSelector: "development",
    measurements: createTargetedMeasurementFixture([pathId]),
    nonce: "previous-targeted-report",
    performancePassIds: ["preview-composite"],
    performancePathIds: [pathId],
    requestAuthorityHash,
    sourceHash,
    testNames: [performanceTestName],
  });
  return {
    previousLifecycle: createToolcraftDeliveryLifecycleState({
      requestAuthorityHash,
    }),
    previousPerformance: Object.freeze({
      comparisonHash:
        createToolcraftTargetedPerformanceComparisonHash(report),
      kind: "performance-iteration-report",
      report,
      requestAuthorityHash,
    }),
  };
}

test("exact request authority creates build plus selected performance paths only", () => {
  const inputs = planningInputs();
  const plan = createToolcraftDeliveryPlan(inputs);

  assert.deepEqual(plan.basis, {
    initialFunctionalProofModelHash:
      inputs.initialProof.functionalProofModelHash,
    initialSourceHash: inputs.initialProof.sourceHash,
    kind: "performance-request",
  });
  assert.equal(plan.kind, "performance-iteration");
  assert.equal(plan.requestAuthorityHash, requestAuthority.hash);
  assert.deepEqual(plan.steps, performanceSteps);
  assert.equal(getToolcraftDeliveryDiagnosticTier(plan), 3);
  assert.equal(
    plan.steps.some(({ kind }) => kind === "browser-functional"),
    false,
  );
  assert.equal(
    plan.steps.some(({ kind }) => kind === "product-tests"),
    false,
  );
});

test("performance authority must select a canonical catalog path", () => {
  const inputs = planningInputs();
  const unknownPath = `performance-path:${encodeURIComponent(JSON.stringify([
    "interactive-continuous",
    "control-drag",
    ["preview-composite"],
    [],
    [],
    ["main"],
    [],
  ]))}`;
  const source = {
    ...authoritySource,
    pathIds: [unknownPath],
  };
  inputs.authority = {
    hash: createToolcraftPerformanceRequestAuthorityHash(source),
    ...source,
  };
  assert.throws(
    () => createToolcraftDeliveryPlan(inputs),
    /unknown path/iu,
  );
});

test("reuses performance comparison only for the exact current source", () => {
  const current = planningInputs();
  const inputs = planningInputs(createPreviousPerformance(
    current.currentInventory.sourceHash,
  ));
  const plan = createToolcraftDeliveryPlan(inputs);

  assert.equal(plan.performanceComparison.kind, "compatible-targeted-report");
  assert.equal(plan.lifecycle.performanceEscalationOffered, true);

  const changed = planningInputs(createPreviousPerformance("9".repeat(64)));
  const changedPlan = createToolcraftDeliveryPlan(changed);
  assert.deepEqual(changedPlan.performanceComparison, { kind: "none" });
  assert.equal(changedPlan.lifecycle.performanceEscalationOffered, false);
});

test("rejects a compatible performance comparison from another source", () => {
  const current = planningInputs();
  const plan = createToolcraftDeliveryPlan(planningInputs(
    createPreviousPerformance(current.currentInventory.sourceHash),
  ));
  const report = createToolcraftTargetedPerformanceReport({
    ...plan.performanceComparison.report,
    sourceHash: "9".repeat(64),
  });
  const malformed = deepFreezeToolcraftValue({
    ...plan,
    performanceComparison: {
      comparisonHash:
        createToolcraftTargetedPerformanceComparisonHash(report),
      kind: "compatible-targeted-report",
      report,
    },
  });

  assert.match(
    getToolcraftDeliveryPlanError(malformed),
    /malformed or incompatible/iu,
  );
});
