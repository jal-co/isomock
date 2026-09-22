import {
  createToolcraftTargetedPerformanceEvidenceHash,
  getToolcraftTargetedPerformanceReportError,
} from "./toolcraft-targeted-performance-report.mjs";
import {
  getToolcraftVerificationInventoryError,
} from "./toolcraft-verification-inventory.mjs";

const evidenceKeys = Object.freeze({
  build: ["kind"],
  "browser-functional": ["kind", "testNames"],
  "browser-performance": [
    "kind",
    "passIds",
    "pathIds",
    "report",
    "evidenceHash",
    "testEvidence",
    "testNames",
  ],
  "code-health": ["kind"],
  dependencies: ["kind", "packageManager"],
  docs: ["kind"],
  "product-tests": ["files", "kind"],
});
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const canonicalExpected = [...expected].sort();
  return arraysEqual(actual, canonicalExpected);
}

function arraysEqual(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function getCanonicalTestEvidenceError(testEvidence, testNames) {
  if (
    !Array.isArray(testEvidence) ||
    !testEvidence.every(
      (entry) =>
        hasExactKeys(entry, ["fullTitle", "leafTitle"]) &&
        typeof entry.fullTitle === "string" &&
        typeof entry.leafTitle === "string" &&
        (entry.fullTitle === entry.leafTitle ||
          entry.fullTitle.endsWith(` › ${entry.leafTitle}`)),
    ) ||
    new Set(testEvidence.map(({ fullTitle }) => fullTitle)).size !==
      testEvidence.length ||
    !testEvidence.every(
      (entry, index) =>
        index === 0 ||
        testEvidence[index - 1].fullTitle < entry.fullTitle,
    )
  ) {
    return "Toolcraft performance proof resolved test evidence is malformed.";
  }
  const resolvedNames = [
    ...new Set(testEvidence.map(({ leafTitle }) => leafTitle)),
  ].sort();
  return arraysEqual(resolvedNames, testNames) &&
    resolvedNames.length === testEvidence.length
    ? undefined
    : "Toolcraft performance proof step evidence does not match its plan.";
}

function getPerformanceEvidenceError(step, evidence, plan) {
  if (plan.kind !== "performance-iteration") {
    return "Toolcraft browser performance evidence requires a performance-iteration plan.";
  }
  if (
    !arraysEqual(evidence.testNames, step.testNames) ||
    !arraysEqual(evidence.pathIds, step.pathIds) ||
    !arraysEqual(evidence.passIds, step.passIds)
  ) {
    return "Toolcraft performance proof step evidence does not match its plan.";
  }
  const testEvidenceError = getCanonicalTestEvidenceError(
    evidence.testEvidence,
    step.testNames,
  );
  if (testEvidenceError) return testEvidenceError;
  const reportError = getToolcraftTargetedPerformanceReportError(
    evidence.report,
    {
      fixtureResolutionMode: "strict-development",
      fixtureSelector: "development",
      performancePassIds: step.passIds,
      performancePathIds: step.pathIds,
      requestAuthorityHash: plan.requestAuthorityHash,
      sourceHash: plan.sourceHash,
      testNames: step.testNames,
      version: 3,
    },
  );
  if (reportError) return reportError;
  let evidenceHash;
  try {
    evidenceHash = createToolcraftTargetedPerformanceEvidenceHash({
      report: evidence.report,
      testEvidence: evidence.testEvidence,
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return evidenceHash === evidence.evidenceHash
    ? undefined
    : "Toolcraft targeted performance evidence hash does not match its evidence.";
}

export function getToolcraftProofStepEvidenceError(step, evidence, plan) {
  const expectedKeys = evidenceKeys[step?.kind];
  if (
    !expectedKeys ||
    !hasExactKeys(evidence, expectedKeys) ||
    evidence.kind !== step.kind
  ) {
    return "Toolcraft proof step evidence is malformed or unplanned.";
  }
  if (
    step.kind === "dependencies" &&
    evidence.packageManager !== step.packageManager
  ) {
    return "Toolcraft dependency proof step evidence does not match its plan.";
  }
  if (
    step.kind === "product-tests" &&
    !arraysEqual(evidence.files, step.files)
  ) {
    return "Toolcraft product-test proof step evidence does not match its plan.";
  }
  if (
    step.kind === "browser-functional" &&
    !arraysEqual(evidence.testNames, step.testNames)
  ) {
    return "Toolcraft browser proof step evidence does not match its plan.";
  }
  if (step.kind === "browser-performance") {
    return getPerformanceEvidenceError(step, evidence, plan);
  }
  return undefined;
}

export function getToolcraftExecutionEvidenceError({
  evidence,
  finalInventory,
  plan,
}) {
  if (!hasExactKeys(finalInventory, ["entries", "sourceHash"])) {
    return "Toolcraft delivery final inventory is malformed.";
  }
  const inventoryError = getToolcraftVerificationInventoryError({
    entries: finalInventory.entries,
    label: "Toolcraft delivery final inventory",
    sourceHash: finalInventory.sourceHash,
  });
  if (inventoryError) return inventoryError;
  if (
    finalInventory.sourceHash !== plan.sourceHash ||
    !Array.isArray(evidence) ||
    !evidence.every(isRecord) ||
    !arraysEqual(
      evidence.map(({ kind }) => kind),
      plan.steps.map(({ kind }) => kind),
    )
  ) {
    return "Toolcraft execution evidence does not exactly match its plan.";
  }
  for (const [index, step] of plan.steps.entries()) {
    const stepError = getToolcraftProofStepEvidenceError(
      step,
      evidence[index],
      plan,
    );
    if (stepError) return stepError;
  }
  return undefined;
}
