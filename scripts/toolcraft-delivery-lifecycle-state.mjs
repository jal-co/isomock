import {
  createToolcraftTargetedPerformanceComparisonHash,
  getToolcraftTargetedPerformanceReportError,
} from "./toolcraft-targeted-performance-report.mjs";
import {
  createToolcraftFunctionalProofModelHash,
  getToolcraftFunctionalProofModelError,
} from "./toolcraft-functional-proof-model.mjs";

const lifecycleKeys = Object.freeze([
  "consumedPerformanceRequestAuthorityHashes",
  "performanceEscalationOffered",
]);
const hashPattern = /^[a-f0-9]{64}$/u;

function isRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length &&
    ownKeys.every((key) =>
      typeof key === "string" &&
      keys.includes(key) &&
      Object.prototype.propertyIsEnumerable.call(value, key)
    );
}

function isDenseExactArray(value) {
  if (!Array.isArray(value) || Reflect.ownKeys(value).length !== value.length + 1)
    return false;
  return Array.from(
    { length: value.length },
    (_, index) => Object.hasOwn(value, index),
  ).every(Boolean);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export function getToolcraftDeliveryLifecycleStateError(value) {
  const hashes = value?.consumedPerformanceRequestAuthorityHashes;
  if (
    !hasExactKeys(value, lifecycleKeys) ||
    !isDenseExactArray(hashes) ||
    !hashes.every((hash, index) =>
      hashPattern.test(hash) &&
      (index === 0 || hashes[index - 1] < hash)
    ) ||
    typeof value.performanceEscalationOffered !== "boolean"
  ) {
    return "Toolcraft delivery lifecycle state is malformed or noncanonical.";
  }
}

export function getToolcraftPreviousPerformanceError(value) {
  if (!isRecord(value) ||
    !["none", "performance-iteration-report"].includes(value.kind))
    return "Previous performance evidence is malformed.";
  const keys = value.kind === "none" ? ["kind"] :
    ["comparisonHash", "kind", "requestAuthorityHash", "report"];
  if (!hasExactKeys(value, keys))
    return "Previous performance evidence is malformed.";
  if (value.kind === "none") return;
  if (!hashPattern.test(value.comparisonHash) || value.report?.version !== 3 ||
    getToolcraftTargetedPerformanceReportError(value.report) ||
    createToolcraftTargetedPerformanceComparisonHash(value.report) !==
      value.comparisonHash)
    return "Previous targeted performance report is malformed.";
  if (!hashPattern.test(value.requestAuthorityHash) ||
    value.report.requestAuthorityHash !== value.requestAuthorityHash)
    return "Performance iteration report authority does not match.";
}

export const EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE = deepFreeze({
  consumedPerformanceRequestAuthorityHashes: [],
  performanceEscalationOffered: false,
});

export function createToolcraftDeliveryLifecycleState({
  performanceEscalationReached = false,
  previous = EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
  requestAuthorityHash = null,
} = {}) {
  const previousError = getToolcraftDeliveryLifecycleStateError(previous);
  if (
    previousError ||
    typeof performanceEscalationReached !== "boolean" ||
    (requestAuthorityHash !== null && !hashPattern.test(requestAuthorityHash))
  ) {
    throw new Error(
      previousError ??
        "Toolcraft delivery lifecycle state transition is malformed.",
    );
  }
  const hashes = requestAuthorityHash === null
    ? [...previous.consumedPerformanceRequestAuthorityHashes]
    : [
        ...previous.consumedPerformanceRequestAuthorityHashes,
        requestAuthorityHash,
      ].sort();
  return deepFreeze({
    consumedPerformanceRequestAuthorityHashes: [...new Set(hashes)],
    performanceEscalationOffered:
      previous.performanceEscalationOffered ||
      performanceEscalationReached,
  });
}

export function getToolcraftDeliveryLifecyclePlanningError({
  authority,
  hasComparison,
  previous,
}) {
  const error = getToolcraftDeliveryLifecycleStateError(previous);
  if (error) return error;
  if (
    !hasComparison &&
    JSON.stringify(previous) !==
      JSON.stringify(EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE)
  ) {
    return "Initial planning inputs contain changed-delivery lifecycle state.";
  }
  if (
    authority &&
    previous.consumedPerformanceRequestAuthorityHashes.includes(authority.hash)
  ) {
    return "Performance iteration authority has already been used.";
  }
}

export function createToolcraftDeliveryPlanLifecycle({
  kind,
  performanceComparison = null,
  previous,
  requestAuthorityHash = null,
}) {
  const performanceIteration = kind === "performance-iteration";
  if (
    !["functional", "performance-iteration"].includes(kind) ||
    performanceIteration !== (requestAuthorityHash !== null) ||
    (!performanceIteration && performanceComparison !== null)
  ) {
    throw new Error(
      "Toolcraft delivery lifecycle transition is malformed.",
    );
  }
  return createToolcraftDeliveryLifecycleState({
    performanceEscalationReached:
      performanceIteration &&
      performanceComparison?.kind === "compatible-targeted-report",
    previous,
    requestAuthorityHash,
  });
}

export function getToolcraftDeliveryPlanLifecycleError(plan) {
  const error = getToolcraftDeliveryLifecycleStateError(plan?.lifecycle);
  if (error) return error;
  if (plan.basis?.kind === "initial") {
    if (
      JSON.stringify(plan.lifecycle) !==
      JSON.stringify(EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE)
    )
      return "Initial delivery lifecycle state is invalid.";
  }
  if (
    plan.kind === "performance-iteration" &&
    (!plan.lifecycle.consumedPerformanceRequestAuthorityHashes.includes(
      plan.requestAuthorityHash,
    ) ||
      (plan.performanceComparison?.kind === "compatible-targeted-report" &&
        !plan.lifecycle.performanceEscalationOffered))
  ) {
    return "Performance iteration lifecycle state is invalid.";
  }
}

export function createToolcraftDeliveryAnchorState({
  files,
  functionalProofModel,
  functionalProofModelHash,
  lifecycle,
  performance,
  sourceHash,
}) {
  const lifecycleError = getToolcraftDeliveryLifecycleStateError(lifecycle);
  const performanceError = getToolcraftPreviousPerformanceError(performance);
  const modelError =
    getToolcraftFunctionalProofModelError(functionalProofModel);
  if (
    lifecycleError ||
    performanceError ||
    modelError ||
    !hashPattern.test(functionalProofModelHash ?? "") ||
    (!modelError &&
      createToolcraftFunctionalProofModelHash(functionalProofModel) !==
        functionalProofModelHash)
  ) {
    throw new Error(
      lifecycleError ??
        performanceError ??
        modelError ??
        "Toolcraft delivery anchor functional proof model hash is invalid.",
    );
  }
  return deepFreeze({
    files,
    functionalProofModel,
    functionalProofModelHash,
    lifecycle,
    performance,
    sourceHash,
  });
}
