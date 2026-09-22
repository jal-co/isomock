import assert from "node:assert/strict";
import test from "node:test";

import {
  getToolcraftDeliveryAnchorShapeError,
} from "./toolcraft-delivery-anchor.mjs";
import {
  createToolcraftDeliveryReceipt,
} from "./toolcraft-delivery-receipt.mjs";
import {
  createPlanReceiptFixture,
} from "./toolcraft-delivery-receipt-test-helpers.mjs";
function createReceipt() {
  return createToolcraftDeliveryReceipt(
    createPlanReceiptFixture("performance-iteration"),
  );
}

test("performance iteration receipt stores canonical exact plan evidence", () => {
  const receipt = createReceipt();
  const step = receipt.plan.steps.find(
    ({ kind }) => kind === "browser-performance",
  );
  const evidence = receipt.evidence.find(
    ({ kind }) => kind === "browser-performance",
  );

  assert.deepEqual(evidence.testNames, step.testNames);
  assert.deepEqual(evidence.pathIds, step.pathIds);
  assert.deepEqual(evidence.passIds, step.passIds);
  assert.deepEqual(
    evidence.testEvidence.map(({ leafTitle }) => leafTitle),
    step.testNames,
  );
  assert.equal(
    evidence.report.requestAuthorityHash,
    receipt.plan.requestAuthorityHash,
  );
  assert.equal(
    getToolcraftDeliveryAnchorShapeError(receipt),
    undefined,
  );
});

test("performance receipt rejects excess selectors, passes, paths, and stale reports", () => {
  const receipt = createReceipt();
  const performanceIndex = receipt.evidence.findIndex(
    ({ kind }) => kind === "browser-performance",
  );
  const performanceEvidence = receipt.evidence[performanceIndex];
  const forgeries = [
    {
      ...performanceEvidence,
      testNames: ["browser perf: nonexistent selector"],
    },
    {
      ...performanceEvidence,
      testEvidence: [{
        fullTitle: "unrelated.spec.ts › browser perf: focused workload",
        leafTitle: "browser perf: focused workload",
      }],
    },
    { ...performanceEvidence, passIds: ["unrelated-pass"] },
    { ...performanceEvidence, pathIds: ["unrelated-path"] },
    { ...performanceEvidence, evidenceHash: "0".repeat(64) },
  ];

  for (const forged of forgeries) {
    assert.match(
      getToolcraftDeliveryAnchorShapeError({
        ...receipt,
        evidence: receipt.evidence.map((item, index) =>
          index === performanceIndex ? forged : item),
      }),
      /performance proof|targeted performance (?:report|evidence)/iu,
    );
  }
});

test("performance iteration cannot relax strict development evidence", () => {
  const receipt = createReceipt();
  const performanceIndex = receipt.evidence.findIndex(
    ({ kind }) => kind === "browser-performance",
  );
  const performanceEvidence = receipt.evidence[performanceIndex];
  const report = {
    ...performanceEvidence.report,
    fixtureResolutionMode: "default",
    requestAuthorityHash: null,
  };
  const relaxed = {
    ...performanceEvidence,
    report,
  };

  assert.match(
    getToolcraftDeliveryAnchorShapeError({
      ...receipt,
      evidence: receipt.evidence.map((item, index) =>
        index === performanceIndex ? relaxed : item),
    }),
    /targeted performance report is malformed/iu,
  );
});
