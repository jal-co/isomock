import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolcraftDeliveryLifecycleState,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  createToolcraftDeliveryReceipt,
} from "./toolcraft-delivery-receipt.mjs";
import {
  createPlanReceiptFixture,
} from "./toolcraft-delivery-receipt-test-helpers.mjs";
import {
  formatToolcraftPerformanceEscalationRecommendation,
  getToolcraftPerformanceEscalationRecommendation,
} from "./toolcraft-performance-escalation-policy.mjs";
import {
  createToolcraftTargetedPerformanceComparisonHash,
  createToolcraftTargetedPerformanceEvidenceHash,
  createToolcraftTargetedPerformanceReport,
} from "./toolcraft-targeted-performance-report.mjs";

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function createCompatiblePair() {
  const firstFixture = createPlanReceiptFixture("performance-iteration");
  const firstReceipt = createToolcraftDeliveryReceipt(firstFixture);
  const firstEvidence = firstReceipt.evidence.at(-1);
  const requestAuthorityHash = "e".repeat(64);
  const report = createToolcraftTargetedPerformanceReport({
    ...firstEvidence.report,
    nonce: "second-targeted-report",
    requestAuthorityHash,
  });
  const testEvidence = firstEvidence.testEvidence;
  const plan = freeze({
    ...firstReceipt.plan,
    lifecycle: createToolcraftDeliveryLifecycleState({
      performanceEscalationReached: true,
      previous: firstReceipt.plan.lifecycle,
      requestAuthorityHash,
    }),
    performanceComparison: {
      comparisonHash: createToolcraftTargetedPerformanceComparisonHash(
        firstEvidence.report,
      ),
      kind: "compatible-targeted-report",
      report: firstEvidence.report,
    },
    requestAuthorityHash,
  });
  const secondReceipt = createToolcraftDeliveryReceipt({
    functionalProofModel: firstReceipt.functionalProofModel,
    plan,
    result: {
      evidence: [
        { kind: "build" },
        {
          ...firstEvidence,
          evidenceHash: createToolcraftTargetedPerformanceEvidenceHash({
            report,
            testEvidence,
          }),
          report,
        },
      ],
      finalInventory: firstFixture.result.finalInventory,
    },
  });
  const previousAnchor = {
    lifecycle: firstReceipt.plan.lifecycle,
    performance: {
      comparisonHash: createToolcraftTargetedPerformanceComparisonHash(
        firstEvidence.report,
      ),
      kind: "performance-iteration-report",
      report: firstEvidence.report,
      requestAuthorityHash: firstReceipt.plan.requestAuthorityHash,
    },
  };
  return { firstReceipt, previousAnchor, secondReceipt };
}

test("first targeted performance iteration does not recommend a full audit", () => {
  const firstReceipt = createToolcraftDeliveryReceipt(
    createPlanReceiptFixture("performance-iteration"),
  );
  assert.equal(
    getToolcraftPerformanceEscalationRecommendation({
      currentReceipt: firstReceipt,
      previousAnchor: {
        lifecycle: {
          consumedPerformanceRequestAuthorityHashes: [],
          performanceEscalationOffered: false,
        },
        performance: { kind: "none" },
      },
    }),
    null,
  );
});

test("two compatible targeted iterations offer but never run full audit", () => {
  const { previousAnchor, secondReceipt } = createCompatiblePair();
  const recommendation = getToolcraftPerformanceEscalationRecommendation({
    currentReceipt: secondReceipt,
    previousAnchor,
  });
  assert.deepEqual(recommendation, {
    command: "pnpm verify:perf",
    kind: "offer-full-performance-audit",
    reason: "two-consecutive-compatible-performance-iterations",
    requiresExplicitUserConsent: true,
  });
  assert.match(
    formatToolcraftPerformanceEscalationRecommendation(recommendation),
    /do not run pnpm verify:perf without explicit user consent/iu,
  );
});
