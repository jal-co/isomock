import {
  validateToolcraftDeliveryCatalog,
} from "./toolcraft-delivery-catalog-validation.mjs";
import {
  createToolcraftCanonicalJsonHash,
  deepFreezeToolcraftValue,
  hasToolcraftExactRecordKeys,
  isToolcraftCanonicalTargetArray,
  isToolcraftDeeplyFrozen,
  serializeToolcraftCanonicalJson,
} from "./toolcraft-functional-proof-primitives.mjs";
import {
  getToolcraftDeliveryLifecyclePlanningError,
  getToolcraftDeliveryPlanLifecycleError,
  getToolcraftPreviousPerformanceError,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  constructToolcraftDeliveryPlan,
} from "./toolcraft-delivery-plan-construction.mjs";
import {
  getToolcraftFunctionalProofModelError,
} from "./toolcraft-functional-proof-model.mjs";
import {
  getToolcraftPerformanceRequestAuthorityError,
} from "./toolcraft-performance-authority-policy.mjs";
import {
  createToolcraftTargetedPerformanceComparisonHash,
  getToolcraftTargetedPerformanceReportError,
} from "./toolcraft-targeted-performance-report.mjs";
import {
  getToolcraftVerificationInventoryError,
} from "./toolcraft-verification-inventory.mjs";

export const TOOLCRAFT_DELIVERY_PLAN_VERSION = 6;

const hashPattern = /^[a-f0-9]{64}$/u;
const managers = new Set(["npm", "pnpm", "yarn", "bun"]);
const stepOrder = [
  "docs",
  "code-health",
  "product-tests",
  "build",
  "browser-functional",
  "browser-performance",
];
const inputKeys = [
  "allProductTestFiles",
  "authority",
  "catalog",
  "currentFunctionalProofModel",
  "currentInventory",
  "initialProof",
  "integrity",
  "packageManager",
  "previousLifecycle",
  "previousPerformance",
];
const stepKeys = {
  docs: ["kind"],
  "code-health": ["kind"],
  "product-tests": ["acceptanceIds", "files", "kind"],
  build: ["kind"],
  "browser-functional": ["kind", "testNames"],
  "browser-performance": ["kind", "passIds", "pathIds", "testNames"],
};
const planKeys = {
  functional: [
    "basis",
    "functionalProofModelHash",
    "kind",
    "lifecycle",
    "manifestHash",
    "sourceHash",
    "steps",
  ],
  "performance-iteration": [
    "basis",
    "functionalProofModelHash",
    "kind",
    "lifecycle",
    "manifestHash",
    "performanceComparison",
    "requestAuthorityHash",
    "sourceHash",
    "steps",
  ],
};

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const canonicallySame = (left, right) =>
  serializeToolcraftCanonicalJson(left) ===
  serializeToolcraftCanonicalJson(right);

function inventoryError(value, label) {
  if (
    !hasToolcraftExactRecordKeys(value, ["entries", "sourceHash"]) ||
    !Array.isArray(value.entries) ||
    !value.entries.every((entry) =>
      hasToolcraftExactRecordKeys(entry, ["path", "sha256"]),
    )
  ) {
    return `${label} is malformed.`;
  }
  return getToolcraftVerificationInventoryError({
    entries: value.entries,
    label,
    sourceHash: value.sourceHash,
  });
}

function authorityError(authority, catalog) {
  const error = getToolcraftPerformanceRequestAuthorityError(authority);
  if (error) return error;
  const knownPathIds = catalog.performance.map(({ pathId }) => pathId);
  if (!authority.pathIds.every((pathId) => knownPathIds.includes(pathId))) {
    return "Performance iteration authority selects an unknown path.";
  }
  return undefined;
}

function inputError(inputs) {
  if (!hasToolcraftExactRecordKeys(inputs, inputKeys)) {
    return "Delivery planning inputs are malformed.";
  }
  if (!isToolcraftCanonicalTargetArray(inputs.allProductTestFiles, {
    paths: true,
  })) {
    return "Product test inventory is malformed.";
  }
  const checkedCatalog = validateToolcraftDeliveryCatalog(inputs.catalog);
  if (checkedCatalog.errors.length > 0) {
    return checkedCatalog.errors.join("\n");
  }
  if (!canonicallySame(inputs.catalog, checkedCatalog.catalog)) {
    return "Delivery catalog must already be canonical.";
  }
  const modelError = getToolcraftFunctionalProofModelError(
    inputs.currentFunctionalProofModel,
  );
  if (modelError) return `Current functional proof model is invalid: ${modelError}`;
  if (!same(
    inputs.currentFunctionalProofModel.acceptance,
    checkedCatalog.catalog.acceptance,
  )) {
    return "Current functional proof model does not match the delivery catalog.";
  }
  const currentInventoryError = inventoryError(
    inputs.currentInventory,
    "Current inventory",
  );
  if (currentInventoryError) return currentInventoryError;
  if (
    !hasToolcraftExactRecordKeys(inputs.integrity, ["manifestHash", "sourceHash"]) ||
    !hashPattern.test(inputs.integrity.manifestHash ?? "") ||
    inputs.integrity.sourceHash !== inputs.currentInventory.sourceHash ||
    !managers.has(inputs.packageManager)
  ) {
    return "Delivery integrity or package-manager policy is invalid.";
  }
  const performanceError = getToolcraftPreviousPerformanceError(
    inputs.previousPerformance,
  );
  if (performanceError) return performanceError;
  const hasInitialProof = inputs.initialProof !== null;
  const lifecycleError = getToolcraftDeliveryLifecyclePlanningError({
    authority: inputs.authority,
    hasComparison: hasInitialProof,
    previous: inputs.previousLifecycle,
  });
  if (lifecycleError) return lifecycleError;
  if (!hasInitialProof) {
    if (inputs.authority !== null) {
      return "Toolcraft first delivery must be functional.";
    }
    return inputs.previousPerformance.kind === "none"
      ? undefined
      : "Initial planning inputs cannot contain prior performance evidence.";
  }
  if (
    !hasToolcraftExactRecordKeys(inputs.initialProof, [
      "functionalProofModelHash",
      "sourceHash",
    ]) ||
    !hashPattern.test(inputs.initialProof.functionalProofModelHash ?? "") ||
    !hashPattern.test(inputs.initialProof.sourceHash ?? "")
  ) {
    return "Initial product proof identity is malformed.";
  }
  if (inputs.authority === null) {
    return "A proven product does not create later functional delivery plans.";
  }
  return authorityError(inputs.authority, inputs.catalog);
}

function stepError(step) {
  const keys = stepKeys[step?.kind];
  if (!keys || !hasToolcraftExactRecordKeys(step, keys)) {
    return "Delivery proof step is malformed.";
  }
  if (
    step.kind === "product-tests" &&
    step.acceptanceIds !== null
  ) {
    return "Initial product proof requires complete product-test selection.";
  }
  const badTarget = ["files", "testNames", "pathIds", "passIds"].find(
    (key) => Object.hasOwn(step, key) &&
      !isToolcraftCanonicalTargetArray(step[key], {
        empty: step.kind === "browser-performance" && key === "passIds",
        paths: key === "files",
      }),
  );
  return badTarget
    ? `Delivery proof ${badTarget} must be nonempty, sorted, and unique.`
    : undefined;
}

function performanceComparisonError(plan, performanceStep) {
  const comparison = plan.performanceComparison;
  if (
    hasToolcraftExactRecordKeys(comparison, ["kind"]) &&
    comparison.kind === "none"
  ) {
    return undefined;
  }
  if (
    !hasToolcraftExactRecordKeys(comparison, [
      "comparisonHash",
      "kind",
      "report",
    ]) ||
    comparison.kind !== "compatible-targeted-report" ||
    !hashPattern.test(comparison.comparisonHash ?? "") ||
    getToolcraftTargetedPerformanceReportError(comparison.report) ||
    createToolcraftTargetedPerformanceComparisonHash(comparison.report) !==
      comparison.comparisonHash ||
    comparison.report.sourceHash !== plan.sourceHash ||
    comparison.report.fixtureResolutionMode !== "strict-development" ||
    !same(comparison.report.performancePathIds, performanceStep.pathIds) ||
    !same(comparison.report.performancePassIds, performanceStep.passIds) ||
    !same(comparison.report.testNames, performanceStep.testNames)
  ) {
    return "Performance comparison is malformed or incompatible.";
  }
  return undefined;
}

export function getToolcraftDeliveryPlanError(plan) {
  if (!isToolcraftDeeplyFrozen(plan)) {
    return "Toolcraft delivery plans must be deeply immutable.";
  }
  const keys = planKeys[plan?.kind];
  if (
    !keys ||
    !hasToolcraftExactRecordKeys(plan, keys) ||
    !hashPattern.test(plan.sourceHash ?? "") ||
    !hashPattern.test(plan.functionalProofModelHash ?? "") ||
    !hashPattern.test(plan.manifestHash ?? "") ||
    !Array.isArray(plan.steps) ||
    plan.steps.length === 0
  ) {
    return "Toolcraft delivery plan is malformed.";
  }
  const lifecycleError = getToolcraftDeliveryPlanLifecycleError(plan);
  if (lifecycleError) return lifecycleError;
  const kinds = plan.steps.map(({ kind }) => kind);
  const stepProblem = plan.steps.map(stepError).find(Boolean);
  if (stepProblem) return stepProblem;
  if (
    new Set(kinds).size !== kinds.length ||
    kinds.some((kind, index) => index > 0 &&
      stepOrder.indexOf(kinds[index - 1]) >= stepOrder.indexOf(kind))
  ) {
    return "Delivery proof steps are duplicate or out of canonical order.";
  }
  const buildIndex = kinds.indexOf("build");
  if (kinds.some((kind, index) =>
    kind.startsWith("browser-") && (buildIndex < 0 || buildIndex > index),
  )) {
    return "Browser proof requires a preceding build.";
  }
  if (plan.kind === "functional") {
    const expected = [
      "docs",
      "code-health",
      "product-tests",
      "build",
      "browser-functional",
    ];
    if (
      !hasToolcraftExactRecordKeys(plan.basis, ["kind"]) ||
      plan.basis.kind !== "initial" ||
      !same(kinds, expected)
    ) {
      return "Initial delivery proof is not the fixed complete functional proof.";
    }
    return undefined;
  }
  if (
    !hasToolcraftExactRecordKeys(plan.basis, [
      "initialFunctionalProofModelHash",
      "initialSourceHash",
      "kind",
    ]) ||
    plan.basis.kind !== "performance-request" ||
    !hashPattern.test(plan.basis.initialFunctionalProofModelHash ?? "") ||
    !hashPattern.test(plan.basis.initialSourceHash ?? "") ||
    !hashPattern.test(plan.requestAuthorityHash ?? "") ||
    !same(kinds, ["build", "browser-performance"])
  ) {
    return "Performance iteration plan is malformed or expands beyond exact performance work.";
  }
  return performanceComparisonError(
    plan,
    plan.steps.find(({ kind }) => kind === "browser-performance"),
  );
}

export function createToolcraftDeliveryPlan(inputs) {
  const problem = inputError(inputs);
  if (problem) throw new Error(problem);
  const plan = deepFreezeToolcraftValue(
    JSON.parse(JSON.stringify(constructToolcraftDeliveryPlan(inputs))),
  );
  const planProblem = getToolcraftDeliveryPlanError(plan);
  if (planProblem) throw new Error(planProblem);
  return plan;
}

export function createToolcraftDeliveryPlanHash(plan) {
  const problem = getToolcraftDeliveryPlanError(plan);
  if (problem) throw new Error(problem);
  return createToolcraftCanonicalJsonHash(plan);
}

export function getToolcraftDeliveryDiagnosticTier(plan) {
  const problem = getToolcraftDeliveryPlanError(plan);
  if (problem) throw new Error(problem);
  return plan.kind === "functional" ? 4 : 3;
}
