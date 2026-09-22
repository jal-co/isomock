import { readToolcraftCheckpointBundle } from "./toolcraft-checkpoint-bundle.mjs";
import {
  createToolcraftDeliveryAnchorState,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  TOOLCRAFT_DELIVERY_RECEIPT_VERSION,
  getToolcraftDeliveryReceiptShapeError,
} from "./toolcraft-delivery-receipt.mjs";
import {
  createToolcraftTargetedPerformanceComparisonHash,
} from "./toolcraft-targeted-performance-report.mjs";

function createPerformanceAnchor(receipt) {
  const evidence = receipt.evidence.find(
    ({ kind }) => kind === "browser-performance",
  );
  if (!evidence) return { kind: "none" };
  const common = {
    comparisonHash: createToolcraftTargetedPerformanceComparisonHash(
      evidence.report,
    ),
    report: evidence.report,
  };
  return {
    kind: "performance-iteration-report",
    ...common,
    requestAuthorityHash: receipt.plan.requestAuthorityHash,
  };
}

export function normalizeToolcraftDeliveryAnchor(receipt) {
  if (receipt?.version !== TOOLCRAFT_DELIVERY_RECEIPT_VERSION) {
    throw new Error(
      "Toolcraft delivery receipt uses an unsupported version; only the current receipt is accepted.",
    );
  }
  const error = getToolcraftDeliveryReceiptShapeError(receipt);
  if (error) throw new Error(error);
  return createToolcraftDeliveryAnchorState({
    files: receipt.files,
    functionalProofModel: receipt.functionalProofModel,
    functionalProofModelHash: receipt.functionalProofModelHash,
    lifecycle: receipt.plan.lifecycle,
    performance: createPerformanceAnchor(receipt),
    sourceHash: receipt.sourceHash,
  });
}

function createBundleAnchor(bundle) {
  const initial = normalizeToolcraftDeliveryAnchor(bundle.delivery);
  if (bundle.currentPerformance === null) return initial;
  const error = getToolcraftDeliveryReceiptShapeError(
    bundle.currentPerformance,
  );
  if (error) throw new Error(error);
  if (
    bundle.currentPerformance.kind !==
      "targeted-performance-verification" ||
    bundle.currentPerformance.plan.kind !== "performance-iteration"
  ) {
    throw new Error(
      "Toolcraft current performance checkpoint must be a targeted performance receipt.",
    );
  }
  return createToolcraftDeliveryAnchorState({
    files: initial.files,
    functionalProofModel: initial.functionalProofModel,
    functionalProofModelHash: initial.functionalProofModelHash,
    lifecycle: bundle.currentPerformance.plan.lifecycle,
    performance: createPerformanceAnchor(bundle.currentPerformance),
    sourceHash: initial.sourceHash,
  });
}

export function getToolcraftDeliveryAnchorShapeError(receipt) {
  try {
    normalizeToolcraftDeliveryAnchor(receipt);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function readToolcraftDeliveryAnchor(rootDir) {
  const loaded = await readToolcraftCheckpointBundle(rootDir);
  if (loaded.missing || loaded.error) return loaded;
  try {
    return {
      anchor: createBundleAnchor(loaded.bundle),
      receipt: loaded.bundle.delivery,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function validateToolcraftDeliveryAnchor({ rootDir }) {
  const loaded = await readToolcraftDeliveryAnchor(rootDir);
  if (loaded.missing) return ["Toolcraft delivery receipt is missing."];
  if (loaded.error) return [loaded.error];
  return [];
}
