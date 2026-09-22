import path from "node:path";

import {
  createToolcraftDeliveryPlanHash,
} from "./toolcraft-delivery-plan.mjs";
import {
  getToolcraftExecutionEvidenceError,
} from "./toolcraft-delivery-evidence.mjs";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function fingerprint(value) {
  return JSON.stringify(stable(value));
}

function getReceiptFingerprint(deliveryReceipt) {
  if (
    typeof deliveryReceipt !== "object" ||
    deliveryReceipt === null ||
    !Array.isArray(deliveryReceipt.evidence) ||
    !Array.isArray(deliveryReceipt.files) ||
    typeof deliveryReceipt.planHash !== "string" ||
    typeof deliveryReceipt.sourceHash !== "string"
  ) {
    return null;
  }
  return fingerprint({
    evidence: deliveryReceipt.evidence,
    finalInventory: {
      entries: deliveryReceipt.files,
      sourceHash: deliveryReceipt.sourceHash,
    },
    planHash: deliveryReceipt.planHash,
  });
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export function createToolcraftPlanExecutionAuthorityRegistry(executePlan) {
  if (typeof executePlan !== "function") {
    throw new Error("Toolcraft plan execution authority requires an executor.");
  }
  const authorities = new WeakMap();
  const reservations = new WeakMap();

  function authorityError() {
    return new Error(
      "Toolcraft delivery checkpoint commit requires protected plan execution authority from the successful same-process executor.",
    );
  }

  function reservationError() {
    return new Error(
      "Toolcraft plan execution authority reservation is invalid or no longer active.",
    );
  }

  async function execute(options) {
    const planHash = createToolcraftDeliveryPlanHash(options.plan);
    const result = await executePlan(options);
    const evidenceError = getToolcraftExecutionEvidenceError({
      evidence: result?.evidence,
      finalInventory: result?.finalInventory,
      plan: options.plan,
    });
    if (evidenceError) throw new Error(evidenceError);
    const authority = Object.freeze(Object.create(null));
    authorities.set(authority, {
      fingerprint: fingerprint({
        evidence: result.evidence,
        finalInventory: result.finalInventory,
        planHash,
      }),
      projectDir: path.resolve(options.projectDir),
      reservation: null,
    });
    return deepFreeze({
      evidence: result.evidence,
      finalInventory: result.finalInventory,
      planExecutionAuthority: authority,
    });
  }

  function reserve({
    authority,
    deliveryReceipt,
    projectDir,
  }) {
    if (
      (typeof authority !== "object" && typeof authority !== "function") ||
      authority === null
    ) {
      throw authorityError();
    }
    const binding = authorities.get(authority);
    if (
      binding === undefined ||
      binding.reservation !== null ||
      binding.projectDir !== path.resolve(projectDir) ||
      binding.fingerprint !== getReceiptFingerprint(deliveryReceipt)
    ) {
      throw authorityError();
    }
    const reservation = Object.freeze(Object.create(null));
    binding.reservation = reservation;
    reservations.set(reservation, { authority, binding });
    return reservation;
  }

  function finalize(reservation) {
    const reserved = reservations.get(reservation);
    if (reserved?.binding.reservation !== reservation) {
      throw reservationError();
    }
    reservations.delete(reservation);
    authorities.delete(reserved.authority);
  }

  function release(reservation) {
    const reserved = reservations.get(reservation);
    if (reserved?.binding.reservation !== reservation) {
      throw reservationError();
    }
    reserved.binding.reservation = null;
    reservations.delete(reservation);
  }

  return Object.freeze({ execute, finalize, release, reserve });
}
