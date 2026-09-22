import path from "node:path";

import {
  createToolcraftCheckpointBundle,
  readToolcraftCheckpointBundle,
  writeToolcraftCheckpointBundle,
} from "./toolcraft-checkpoint-bundle.mjs";
import { assertDeliveryCheckpointState } from "./toolcraft-checkpoint-delivery-state.mjs";
import {
  getToolcraftDeliveryReceiptShapeError,
} from "./toolcraft-delivery-receipt.mjs";
import {
  finalizeToolcraftPlanExecutionAuthority,
  releaseToolcraftPlanExecutionAuthority,
  reserveToolcraftPlanExecutionAuthority,
} from "./toolcraft-delivery-executor.mjs";

const allowedOptionKeys = new Set([
  "deliveryReceipt",
  "finalInventory",
  "observeDurabilityBarrier",
  "projectDir",
  "planExecutionAuthority",
]);

function assertCommitOptions(options) {
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options) ||
    !Object.keys(options).every((key) => allowedOptionKeys.has(key)) ||
    typeof options.projectDir !== "string" ||
    (options.observeDurabilityBarrier !== undefined &&
      typeof options.observeDurabilityBarrier !== "function")
  ) {
    throw new Error(
      "Toolcraft delivery checkpoint commit options are malformed or unsupported.",
    );
  }
}

function getExistingAuthority(loaded) {
  if (loaded.missing) {
    return { currentPerformance: null, performanceBaseline: null };
  }
  if (loaded.error) throw new Error(loaded.error);
  return loaded.bundle;
}

function createCheckpointCandidate(existing, receipt) {
  const receiptError = getToolcraftDeliveryReceiptShapeError(receipt);
  if (receiptError) throw new Error(receiptError);
  if (receipt.plan.kind === "performance-iteration") {
    if (!existing.delivery) {
      throw new Error(
        "Toolcraft targeted performance requires an initial delivery receipt.",
      );
    }
    return createToolcraftCheckpointBundle({
      currentPerformance: receipt,
      delivery: existing.delivery,
      performanceBaseline: existing.performanceBaseline,
    });
  }
  return createToolcraftCheckpointBundle({
    currentPerformance: existing.currentPerformance,
    delivery: receipt,
    performanceBaseline: existing.performanceBaseline,
  });
}

export async function commitToolcraftDeliveryCheckpoint(options) {
  assertCommitOptions(options);
  const {
    deliveryReceipt,
    finalInventory,
    observeDurabilityBarrier,
    projectDir,
    planExecutionAuthority,
  } = options;
  const resolvedProjectDir = path.resolve(projectDir);
  const loaded = await readToolcraftCheckpointBundle(resolvedProjectDir);
  const existing = getExistingAuthority(loaded);
  const previousDeliveryReceipt = existing.delivery;
  const candidate = createCheckpointCandidate(existing, deliveryReceipt);

  let planExecutionReservation = reserveToolcraftPlanExecutionAuthority({
    authority: planExecutionAuthority,
    deliveryReceipt,
    projectDir: resolvedProjectDir,
  });
  let durablyCommitted = false;
  try {
    await assertDeliveryCheckpointState({
      deliveryReceipt,
      finalInventory,
      previousDeliveryReceipt,
      previousPerformanceReceipt: existing.currentPerformance,
    });
    await writeToolcraftCheckpointBundle({
      bundle: candidate,
      observeDurabilityBarrier: async (event) => {
        if (event.phase === "checkpoint-committed") {
          durablyCommitted = true;
        }
        await observeDurabilityBarrier?.(event);
      },
      rootDir: resolvedProjectDir,
    });
    durablyCommitted = true;
    if (planExecutionReservation !== undefined) {
      finalizeToolcraftPlanExecutionAuthority(planExecutionReservation);
      planExecutionReservation = undefined;
    }
  } catch (error) {
    if (planExecutionReservation !== undefined) {
      if (durablyCommitted) {
        finalizeToolcraftPlanExecutionAuthority(
          planExecutionReservation,
        );
      } else {
        releaseToolcraftPlanExecutionAuthority(
          planExecutionReservation,
        );
      }
    }
    throw error;
  }

  // Authority is final before post-write reads because the bundle is durable.
  const committed = await readToolcraftCheckpointBundle(resolvedProjectDir);
  if (
    committed.error ||
    committed.missing ||
    committed.source !== "canonical"
  ) {
    throw new Error(
      committed.error ??
        "Toolcraft committed verification checkpoint bundle is missing.",
    );
  }
  if (JSON.stringify(committed.bundle) !== JSON.stringify(candidate)) {
    throw new Error(
      "Toolcraft committed verification checkpoint bundle does not match the atomic candidate.",
    );
  }
}
