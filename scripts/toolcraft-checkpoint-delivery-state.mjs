import {
  normalizeToolcraftDeliveryAnchor,
} from "./toolcraft-delivery-anchor.mjs";
import {
  getToolcraftDeliveryReceiptShapeError,
} from "./toolcraft-delivery-receipt.mjs";
import {
  EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
  createToolcraftDeliveryPlanLifecycle,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  getToolcraftVerificationInventoryError,
} from "./toolcraft-verification-inventory.mjs";

function inventoriesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getPreviousAnchor(
  previousDeliveryReceipt,
  previousPerformanceReceipt,
) {
  return previousDeliveryReceipt === undefined
    ? null
    : {
        ...normalizeToolcraftDeliveryAnchor(previousDeliveryReceipt),
        lifecycle:
          previousPerformanceReceipt?.plan?.kind ===
          "performance-iteration"
            ? previousPerformanceReceipt.plan.lifecycle
            : previousDeliveryReceipt.plan.lifecycle,
      };
}

function assertDeliveryBasisAnchor({ previousAnchor, receipt }) {
  const basis = receipt.plan.basis;
  if (basis.kind === "initial") {
    if (previousAnchor) {
      throw new Error(
        "Toolcraft initial delivery basis requires no previous successful delivery.",
      );
    }
    return;
  }
  if (
    !previousAnchor ||
    basis.kind !== "performance-request" ||
    basis.initialFunctionalProofModelHash !==
      previousAnchor.functionalProofModelHash ||
    basis.initialSourceHash !== previousAnchor.sourceHash
  ) {
    throw new Error(
      "Toolcraft performance request basis must match the initial successful delivery identity.",
    );
  }
}

function assertLifecycleTransition({ previousAnchor, receipt }) {
  const plan = receipt.plan;
  const expected = createToolcraftDeliveryPlanLifecycle({
    kind: plan.kind,
    performanceComparison:
      plan.kind === "performance-iteration"
        ? plan.performanceComparison
        : null,
    previous:
      previousAnchor?.lifecycle ??
      EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
    requestAuthorityHash:
      plan.kind === "performance-iteration"
        ? plan.requestAuthorityHash
        : null,
  });
  if (!inventoriesEqual(plan.lifecycle, expected)) {
    throw new Error(
      "Toolcraft delivery lifecycle transition does not exactly match the previous delivery anchor.",
    );
  }
}

function assertFinalInventory({ finalInventory, receipt }) {
  const inventoryError = getToolcraftVerificationInventoryError({
    entries: finalInventory?.entries,
    label: "Toolcraft delivery final inventory",
    sourceHash: finalInventory?.sourceHash,
  });
  if (inventoryError) throw new Error(inventoryError);
  if (
    finalInventory.sourceHash !== receipt.sourceHash ||
    !inventoriesEqual(finalInventory.entries, receipt.files)
  ) {
    throw new Error(
      "Toolcraft delivery final inventory does not exactly match its receipt.",
    );
  }
}

export async function assertDeliveryCheckpointState({
  deliveryReceipt,
  finalInventory,
  previousDeliveryReceipt,
  previousPerformanceReceipt,
}) {
  const receiptError = getToolcraftDeliveryReceiptShapeError(deliveryReceipt);
  if (receiptError) throw new Error(receiptError);
  const previousAnchor = getPreviousAnchor(
    previousDeliveryReceipt,
    previousPerformanceReceipt,
  );
  assertDeliveryBasisAnchor({
    previousAnchor,
    receipt: deliveryReceipt,
  });
  assertLifecycleTransition({
    previousAnchor,
    receipt: deliveryReceipt,
  });
  assertFinalInventory({ finalInventory, receipt: deliveryReceipt });
}
