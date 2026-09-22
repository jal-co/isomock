import type {
  ToolcraftDeliveryExecutionResult,
  ToolcraftDeliveryReceipt,
  ToolcraftDeliveryStepEvidence,
} from "./toolcraft-delivery-receipt.mjs";
import {
  createToolcraftDeliveryReceipt,
} from "./toolcraft-delivery-receipt.mjs";
import type {
  FunctionalDeliveryPlan,
  PerformanceIterationPlan,
  ToolcraftDeliveryLifecycleState,
  ToolcraftDeliveryPlan,
  ToolcraftDeliveryPlanningInputs,
} from "./toolcraft-delivery-plan.mjs";
import type {
  ToolcraftFunctionalProofModel,
} from "./toolcraft-functional-proof-model.mjs";

const files = [{ path: "src/app/app-schema.ts", sha256: "a".repeat(64) }];
const lifecycle: ToolcraftDeliveryLifecycleState = {
  consumedPerformanceRequestAuthorityHashes: ["e".repeat(64)],
  performanceEscalationOffered: true,
};
const plan: ToolcraftDeliveryPlan = {
  basis: { kind: "initial" },
  functionalProofModelHash: "f".repeat(64),
  kind: "functional",
  lifecycle,
  manifestHash: "c".repeat(64),
  sourceHash: "a".repeat(64),
  steps: [{ kind: "docs" }],
};
const evidence: readonly ToolcraftDeliveryStepEvidence[] = [
  { kind: "docs" },
];
const functionalProofModel: ToolcraftFunctionalProofModel = {
  acceptance: [{
    acceptanceId: "canvas.focused",
    contractHash: "b".repeat(64),
    domainId: "canvas",
    file: "e2e/app-controls.spec.ts",
    testName: "browser: focused acceptance",
  }],
  version: 2,
};
const receipt: ToolcraftDeliveryReceipt = {
  completedAt: "2026-07-24T00:00:00.000Z",
  evidence,
  files,
  functionalProofModel,
  functionalProofModelHash: plan.functionalProofModelHash,
  kind: "delivery-verification",
  manifestHash: plan.manifestHash,
  plan,
  planHash: "d".repeat(64),
  planVersion: 6,
  runner: "protected-delivery",
  sourceHash: plan.sourceHash,
  status: "passed",
  version: 8,
};

const withLegacyMode = { ...receipt, mode: "ordinary" as const };
// @ts-expect-error Current delivery receipts cannot carry a legacy mode.
const invalidMode: ToolcraftDeliveryReceipt = withLegacyMode;
const withBaseline = {
  ...receipt,
  baselineEvidenceHash: "e".repeat(64),
  baselineSourceHash: "f".repeat(64),
};
// @ts-expect-error Current delivery receipts cannot carry baseline linkage.
const invalidBaseline: ToolcraftDeliveryReceipt = withBaseline;
const withOldPlanVersion = { ...receipt, planVersion: 1 as const };
// @ts-expect-error Current delivery receipts require plan version 6.
const invalidPlanVersion: ToolcraftDeliveryReceipt = withOldPlanVersion;
const withOldReceiptVersion = { ...receipt, version: 7 as const };
// @ts-expect-error Current delivery receipts require receipt version 8.
const invalidReceiptVersion: ToolcraftDeliveryReceipt = withOldReceiptVersion;
const { functionalProofModel: _model, ...withoutModel } = receipt;
// @ts-expect-error Current delivery receipts require the canonical proof model.
const invalidReceiptModel: ToolcraftDeliveryReceipt = withoutModel;
declare const executionResult: ToolcraftDeliveryExecutionResult;
// @ts-expect-error Receipt creation requires the immediate functional proof model.
createToolcraftDeliveryReceipt({ plan, result: executionResult });
const { lifecycle: _lifecycle, ...withoutLifecycle } = plan;
// @ts-expect-error Every current delivery plan requires lifecycle metadata.
const invalidPlan: ToolcraftDeliveryPlan = withoutLifecycle;
const invalidFunctional: FunctionalDeliveryPlan = {
  ...plan,
  steps: [{
    // @ts-expect-error Functional plans cannot carry browser-performance proof.
    kind: "browser-performance",
    passIds: ["preview"],
    pathIds: ["path"],
    testNames: ["browser perf: path"],
  }],
};
const invalidIteration: PerformanceIterationPlan = {
  ...plan,
  basis: {
    initialFunctionalProofModelHash: "f".repeat(64),
    initialSourceHash: "a".repeat(64),
    kind: "performance-request",
  },
  kind: "performance-iteration",
  performanceComparison: { kind: "none" },
  requestAuthorityHash: "e".repeat(64),
  // @ts-expect-error Performance iterations require a final browser-performance step.
  steps: [{ kind: "docs" }],
};
const initialPerformanceCandidate = {
  basis: { kind: "initial" as const },
  functionalProofModelHash: "f".repeat(64),
  kind: "performance-iteration" as const,
  lifecycle,
  manifestHash: "c".repeat(64),
  performanceComparison: { kind: "none" as const },
  requestAuthorityHash: "e".repeat(64),
  sourceHash: "a".repeat(64),
  steps: [
    { kind: "build" as const },
    {
      kind: "browser-performance" as const,
      passIds: ["preview"],
      pathIds: ["path"],
      testNames: ["browser perf: path"],
    },
  ] as const,
};
// @ts-expect-error Performance iterations require a performance-request basis.
const invalidInitialIteration: PerformanceIterationPlan =
  initialPerformanceCandidate;
// @ts-expect-error Lifecycle authority history is immutable.
plan.lifecycle.consumedPerformanceRequestAuthorityHashes.push("f".repeat(64));
declare const planningInputs: ToolcraftDeliveryPlanningInputs;
const previousLifecycle: ToolcraftDeliveryLifecycleState =
  planningInputs.previousLifecycle;

void [
  receipt,
  invalidMode,
  invalidBaseline,
  invalidPlanVersion,
  invalidReceiptVersion,
  invalidReceiptModel,
  invalidPlan,
  invalidFunctional,
  invalidIteration,
  invalidInitialIteration,
  previousLifecycle,
  executionResult,
];
