import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolcraftDeliveryReceipt,
  getToolcraftDeliveryReceiptShapeError,
} from "./toolcraft-delivery-receipt.mjs";
import { createToolcraftDeliveryPlanHash } from "./toolcraft-delivery-plan.mjs";
import { createPlanReceiptFixture } from "./toolcraft-delivery-receipt-test-helpers.mjs";
import {
  createToolcraftTargetedPerformanceReport,
  createToolcraftTargetedPerformanceComparisonHash,
  createToolcraftTargetedPerformanceEvidenceHash,
} from "./toolcraft-targeted-performance-report.mjs";

test("accepts exact authority-bound performance iteration evidence", () => {
  const fixture = createPlanReceiptFixture("performance-iteration");
  const receipt = createToolcraftDeliveryReceipt(fixture);
  assert.equal(getToolcraftDeliveryReceiptShapeError(receipt), undefined);
});

test("rejects incomplete or altered performance iteration evidence", () => {
  const fixture = createPlanReceiptFixture("performance-iteration");
  const receipt = createToolcraftDeliveryReceipt(fixture);
  const performance = receipt.evidence.at(-1);
  const cases = [
    { ...performance, report: undefined },
    { ...performance, evidenceHash: "0".repeat(64) },
    {
      ...performance,
      evidenceHash:
        createToolcraftTargetedPerformanceComparisonHash(performance.report),
    },
    {
      ...performance,
      report: { ...performance.report, requestAuthorityHash: "0".repeat(64) },
    },
    { ...performance, pathIds: ["unplanned-path"] },
    { ...performance, passIds: ["unplanned-pass"] },
    { ...performance, testNames: ["browser perf: unplanned"] },
    {
      ...performance,
      testEvidence: [{
        fullTitle: "app-controls.spec.ts › browser perf: unplanned",
        leafTitle: "browser perf: unplanned",
      }],
    },
  ];
  for (const altered of cases) {
    const evidence = [...receipt.evidence.slice(0, -1), altered];
    assert.match(
      getToolcraftDeliveryReceiptShapeError({ ...receipt, evidence }),
      /performance|report|authority|proof step|exactly match/iu,
    );
  }
});

test("rejects incomplete comparison evidence in the embedded performance plan", () => {
  const fixture = createPlanReceiptFixture("performance-iteration");
  const plan = {
    ...fixture.plan,
    lifecycle: {
      ...fixture.plan.lifecycle,
      performanceEscalationOffered: true,
    },
    performanceComparison: {
      kind: "compatible-targeted-report",
      comparisonHash: "a".repeat(64),
    },
  };
  Object.freeze(plan.lifecycle);
  Object.freeze(plan.performanceComparison);
  Object.freeze(plan);
  assert.throws(
    () => createToolcraftDeliveryReceipt({
      functionalProofModel: fixture.functionalProofModel,
      plan,
      result: fixture.result,
    }),
    /comparison|plan/iu,
  );
});

test("rejects a rehashed plan whose comparison hash is forged", () => {
  const fixture = createPlanReceiptFixture("performance-iteration");
  const currentReport = fixture.result.evidence.at(-1).report;
  const report = createToolcraftTargetedPerformanceReport({
    ...currentReport,
    requestAuthorityHash: "c".repeat(64),
    sourceHash: fixture.plan.sourceHash,
  });
  const comparisonHash =
    createToolcraftTargetedPerformanceComparisonHash(report);
  const validPlan = Object.freeze({
    ...fixture.plan,
    lifecycle: Object.freeze({
      ...fixture.plan.lifecycle,
      performanceEscalationOffered: true,
    }),
    performanceComparison: Object.freeze({
      kind: "compatible-targeted-report",
      report,
      comparisonHash,
    }),
  });
  const receipt = createToolcraftDeliveryReceipt({
    functionalProofModel: fixture.functionalProofModel,
    plan: validPlan,
    result: fixture.result,
  });
  const forgedPlan = Object.freeze({
    ...validPlan,
    performanceComparison: Object.freeze({
      ...validPlan.performanceComparison,
      comparisonHash: "f".repeat(64),
    }),
  });

  assert.throws(
    () => createToolcraftDeliveryPlanHash(forgedPlan),
    /comparison.*malformed|report hash/iu,
  );
  assert.equal(getToolcraftDeliveryReceiptShapeError(receipt), undefined);
});

test("rejects ambiguous or excess canonical performance test evidence", () => {
  const fixture = createPlanReceiptFixture("performance-iteration");
  const receipt = createToolcraftDeliveryReceipt(fixture);
  const performance = receipt.evidence.at(-1);
  const leafTitle = performance.testNames[0];
  const testEvidence = [
    ...performance.testEvidence,
    {
      fullTitle: `duplicate.spec.ts › ${leafTitle}`,
      leafTitle,
    },
  ].sort((left, right) =>
    left.fullTitle < right.fullTitle ? -1 : left.fullTitle > right.fullTitle ? 1 : 0
  );
  const altered = {
    ...performance,
    evidenceHash: createToolcraftTargetedPerformanceEvidenceHash({
      report: performance.report,
      testEvidence,
    }),
    testEvidence,
  };

  assert.match(
    getToolcraftDeliveryReceiptShapeError({
      ...receipt,
      evidence: [...receipt.evidence.slice(0, -1), altered],
    }),
    /performance.*evidence|one-to-one|ambiguous|exactly match/iu,
  );
});
