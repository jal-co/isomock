import {
  TOOLCRAFT_DELIVERY_PLAN_VERSION,
  createToolcraftDeliveryPlanHash,
  getToolcraftDeliveryPlanError,
} from "./toolcraft-delivery-plan.mjs";
import {
  getToolcraftExecutionEvidenceError,
} from "./toolcraft-delivery-evidence.mjs";
import {
  createToolcraftFunctionalProofModelHash,
  getToolcraftFunctionalProofModelError,
} from "./toolcraft-functional-proof-model.mjs";
import { readToolcraftCheckpointBundle } from "./toolcraft-checkpoint-bundle.mjs";
import {
  getToolcraftVerificationInventoryError,
} from "./toolcraft-verification-inventory.mjs";

export const TOOLCRAFT_DELIVERY_RECEIPT_VERSION = 8;

const receiptKeys = Object.freeze([
  "completedAt",
  "evidence",
  "files",
  "functionalProofModel",
  "functionalProofModelHash",
  "kind",
  "manifestHash",
  "plan",
  "planHash",
  "planVersion",
  "runner",
  "sourceHash",
  "status",
  "version",
]);
const hashPattern = /^[a-f0-9]{64}$/u;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const actual = Reflect.ownKeys(value);
  return (
    actual.length === expected.length &&
    actual.every(
      (key) =>
        typeof key === "string" &&
        expected.includes(key) &&
        Object.prototype.propertyIsEnumerable.call(value, key),
    )
  );
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function getCurrentReceiptCommonError(receipt) {
  if (
    !hasExactKeys(receipt, receiptKeys) ||
    ![
      "delivery-verification",
      "targeted-performance-verification",
    ].includes(receipt.kind) ||
    receipt.runner !== "protected-delivery" ||
    receipt.status !== "passed" ||
    receipt.version !== TOOLCRAFT_DELIVERY_RECEIPT_VERSION ||
    receipt.planVersion !== TOOLCRAFT_DELIVERY_PLAN_VERSION ||
    typeof receipt.completedAt !== "string" ||
    !hashPattern.test(receipt.sourceHash ?? "") ||
    !hashPattern.test(receipt.functionalProofModelHash ?? "") ||
    !hashPattern.test(receipt.manifestHash ?? "") ||
    !hashPattern.test(receipt.planHash ?? "")
  ) {
    return "Toolcraft delivery receipt is malformed or has unsupported fields.";
  }
  return getToolcraftVerificationInventoryError({
    entries: receipt.files,
    label: "Toolcraft delivery receipt file inventory",
    sourceHash: receipt.sourceHash,
  });
}

export function getToolcraftDeliveryReceiptShapeError(receipt) {
  const commonError = getCurrentReceiptCommonError(receipt);
  if (commonError) return commonError;
  const plan = deepFreeze(receipt.plan);
  const functionalProofModel = deepFreeze(receipt.functionalProofModel);
  const planError = getToolcraftDeliveryPlanError(plan);
  if (planError) return planError;
  const expectedKind = plan.kind === "functional"
    ? "delivery-verification"
    : "targeted-performance-verification";
  if (receipt.kind !== expectedKind) {
    return "Toolcraft protected receipt kind does not match its plan.";
  }
  const modelError =
    getToolcraftFunctionalProofModelError(functionalProofModel);
  if (modelError) {
    return `Toolcraft delivery receipt functional proof model is invalid: ${modelError}`;
  }
  if (
    createToolcraftFunctionalProofModelHash(functionalProofModel) !==
      receipt.functionalProofModelHash ||
    receipt.functionalProofModelHash !== plan.functionalProofModelHash
  ) {
    return "Toolcraft delivery receipt functional proof model hash does not match its model and plan.";
  }
  if (
    receipt.sourceHash !== plan.sourceHash ||
    receipt.manifestHash !== plan.manifestHash
  ) {
    return "Toolcraft delivery receipt source or manifest does not match its plan.";
  }
  if (createToolcraftDeliveryPlanHash(plan) !== receipt.planHash) {
    return "Toolcraft delivery receipt plan hash does not match its plan.";
  }
  return getToolcraftExecutionEvidenceError({
    evidence: receipt.evidence,
    finalInventory: {
      entries: receipt.files,
      sourceHash: receipt.sourceHash,
    },
    plan,
  });
}

export function createToolcraftDeliveryReceipt({
  functionalProofModel,
  plan,
  result,
}) {
  const modelError =
    getToolcraftFunctionalProofModelError(functionalProofModel);
  if (modelError) {
    throw new Error(
      `Invalid Toolcraft functional proof model: ${modelError}`,
    );
  }
  const functionalProofModelHash =
    createToolcraftFunctionalProofModelHash(functionalProofModel);
  if (functionalProofModelHash !== plan.functionalProofModelHash) {
    throw new Error(
      "Toolcraft functional proof model does not match the delivery plan.",
    );
  }
  const planHash = createToolcraftDeliveryPlanHash(plan);
  const resultError = getToolcraftExecutionEvidenceError({
    evidence: result?.evidence,
    finalInventory: result?.finalInventory,
    plan,
  });
  if (resultError) throw new Error(resultError);
  const receipt = {
    completedAt: new Date().toISOString(),
    evidence: result?.evidence,
    files: result?.finalInventory?.entries,
    functionalProofModel,
    functionalProofModelHash,
    kind: plan.kind === "functional"
      ? "delivery-verification"
      : "targeted-performance-verification",
    manifestHash: plan.manifestHash,
    plan,
    planHash,
    planVersion: TOOLCRAFT_DELIVERY_PLAN_VERSION,
    runner: "protected-delivery",
    sourceHash: plan.sourceHash,
    status: "passed",
    version: TOOLCRAFT_DELIVERY_RECEIPT_VERSION,
  };
  const error = getToolcraftDeliveryReceiptShapeError(receipt);
  if (error) throw new Error(error);
  return deepFreeze(receipt);
}

export async function readToolcraftDeliveryReceipt(rootDir) {
  const loaded = await readToolcraftCheckpointBundle(rootDir);
  if (loaded.missing || loaded.error) return loaded;
  const receipt = loaded.bundle.delivery;
  const error = getToolcraftDeliveryReceiptShapeError(receipt);
  return error ? { error } : { receipt: deepFreeze(receipt) };
}

export async function validateToolcraftDeliveryReceipt({
  rootDir,
}) {
  const loaded = await readToolcraftDeliveryReceipt(rootDir);
  if (loaded.missing) return ["Toolcraft delivery receipt is missing."];
  if (loaded.error) return [loaded.error];
  return [];
}
