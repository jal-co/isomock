import { evaluateToolcraftIntegrity } from "./check-toolcraft-integrity.mjs";
import { commitToolcraftDeliveryCheckpoint } from "./toolcraft-checkpoint-transaction.mjs";
import { readToolcraftDeliveryAnchor } from "./toolcraft-delivery-anchor.mjs";
import { executeToolcraftDeliveryPlan } from "./toolcraft-delivery-executor.mjs";
import {
  collectToolcraftDeliveryFunctionalContext,
} from "./toolcraft-delivery-functional-context.mjs";
import {
  getToolcraftFunctionalProofModelError,
} from "./toolcraft-functional-proof-model.mjs";
import {
  EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
  getToolcraftPreviousPerformanceError,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import { createToolcraftDeliveryPlan } from "./toolcraft-delivery-plan.mjs";
import { createToolcraftDeliveryReceipt } from "./toolcraft-delivery-receipt.mjs";
import {
  formatToolcraftPerformanceEscalationRecommendation,
  getToolcraftPerformanceEscalationRecommendation,
} from "./toolcraft-performance-escalation-policy.mjs";
import {
  readToolcraftPerformanceRequestAuthority,
} from "./toolcraft-performance-request-authority.mjs";
import { detectToolcraftPackageManager } from "./toolcraft-proof-process.mjs";
import {
  collectToolcraftVerificationInputs,
} from "./toolcraft-verification-inventory.mjs";

const testFilePattern = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function getAllProductTestFiles(inventory) {
  return inventory.entries
    .map(({ path: filePath }) => filePath)
    .filter(
      (filePath) =>
        filePath.startsWith("src/") &&
        !filePath.startsWith("src/toolcraft/") &&
        testFilePattern.test(filePath),
    )
    .sort(compareCodeUnits);
}

function assertCurrentPreviousPerformance(performance) {
  const error = getToolcraftPreviousPerformanceError(performance);
  if (error) throw new Error(error);
  return performance;
}

export async function loadToolcraftDeliveryPlanningInputs({
  authority,
  currentInventory,
  functionalContext,
  integrity,
  previous,
  projectDir,
}) {
  const currentModelError = getToolcraftFunctionalProofModelError(
    functionalContext.currentFunctionalProofModel,
  );
  if (currentModelError) {
    throw new Error(
      `Current functional proof model is invalid: ${currentModelError}`,
    );
  }
  const initialProof = previous.missing
    ? null
    : Object.freeze({
        functionalProofModelHash:
          previous.anchor.functionalProofModelHash,
        sourceHash: previous.anchor.sourceHash,
      });
  return Object.freeze({
    allProductTestFiles: getAllProductTestFiles(currentInventory),
    authority,
    catalog: functionalContext.catalog,
    currentFunctionalProofModel:
      functionalContext.currentFunctionalProofModel,
    currentInventory,
    initialProof,
    integrity,
    packageManager: detectToolcraftPackageManager(projectDir),
    previousLifecycle: previous.missing
      ? EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE
      : previous.anchor.lifecycle,
    previousPerformance: previous.missing
      ? Object.freeze({ kind: "none" })
      : assertCurrentPreviousPerformance(previous.anchor.performance),
  });
}

const defaultDeliveryDependencies = Object.freeze({
  collectInventory: collectToolcraftVerificationInputs,
  collectFunctionalContext: collectToolcraftDeliveryFunctionalContext,
  commit: async ({ receipt, result, projectDir }) =>
    commitToolcraftDeliveryCheckpoint({
      deliveryReceipt: receipt,
      finalInventory: result.finalInventory,
      planExecutionAuthority: result.planExecutionAuthority,
      projectDir,
    }),
  createPlan: createToolcraftDeliveryPlan,
  createReceipt: createToolcraftDeliveryReceipt,
  evaluateIntegrity: evaluateToolcraftIntegrity,
  executePlan: executeToolcraftDeliveryPlan,
  formatEscalationRecommendation:
    formatToolcraftPerformanceEscalationRecommendation,
  getEscalationRecommendation:
    getToolcraftPerformanceEscalationRecommendation,
  loadPlanningInputs: loadToolcraftDeliveryPlanningInputs,
  readDeliveryAnchor: readToolcraftDeliveryAnchor,
  readPerformanceAuthority: readToolcraftPerformanceRequestAuthority,
});

export const TOOLCRAFT_INITIAL_PROOF_ALREADY_COMPLETE = Object.freeze({
  kind: "initial-proof-already-complete",
  status: "focused-development-only",
});

function hasUnconsumedPerformanceAuthority(previous, authority) {
  return authority !== null &&
    !previous.anchor.lifecycle.consumedPerformanceRequestAuthorityHashes
      .includes(authority.hash);
}

export async function executeToolcraftDeliveryLifecycleCore({
  dependencies,
  projectDir,
}) {
  const previous = await dependencies.readDeliveryAnchor(projectDir);
  if (previous.error) throw new Error(previous.error);
  const authority =
    await dependencies.readPerformanceAuthority(projectDir);
  if (
    !previous.missing &&
    !hasUnconsumedPerformanceAuthority(previous, authority)
  ) {
    console.log(
      "Toolcraft initial product proof is complete; use focused checks for later edits.",
    );
    return TOOLCRAFT_INITIAL_PROOF_ALREADY_COMPLETE;
  }
  const currentInventory =
    await dependencies.collectInventory(projectDir);
  const integrity = await dependencies.evaluateIntegrity({
    inventory: currentInventory,
    platformOnly: true,
    rootDir: projectDir,
  });
  const functionalContext =
    await dependencies.collectFunctionalContext(projectDir);
  const planningInputs = await dependencies.loadPlanningInputs({
    authority,
    currentInventory,
    functionalContext,
    integrity,
    previous,
    projectDir,
  });
  const plan = dependencies.createPlan(planningInputs);
  const result = await dependencies.executePlan({ plan, projectDir });
  const receipt = dependencies.createReceipt({
    functionalProofModel:
      functionalContext.currentFunctionalProofModel,
    plan,
    result,
  });
  await dependencies.commit({ plan, projectDir, receipt, result });
  if (plan.kind === "performance-iteration") {
    const recommendation = dependencies.getEscalationRecommendation({
      currentReceipt: receipt,
      previousAnchor: previous.anchor,
    });
    if (recommendation) {
      console.log(
        dependencies.formatEscalationRecommendation(recommendation),
      );
    }
  }
  return receipt;
}

export function executeToolcraftDeliveryLifecycle({ projectDir }) {
  return executeToolcraftDeliveryLifecycleCore({
    dependencies: defaultDeliveryDependencies,
    projectDir,
  });
}
