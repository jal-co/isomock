import {
  getToolcraftDeliveryReceiptShapeError,
} from "./toolcraft-delivery-receipt.mjs";
import {
  getToolcraftDeliveryLifecycleStateError,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  TOOLCRAFT_FULL_PERFORMANCE_VERIFICATION_COMMAND,
} from "./toolcraft-performance-authority-policy.mjs";

const fullAuditRecommendation = Object.freeze({
  command: TOOLCRAFT_FULL_PERFORMANCE_VERIFICATION_COMMAND,
  kind: "offer-full-performance-audit",
  reason: "two-consecutive-compatible-performance-iterations",
  requiresExplicitUserConsent: true,
});

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

export function getToolcraftPerformanceEscalationRecommendation({
  currentReceipt,
  previousAnchor,
}) {
  if (
    getToolcraftDeliveryReceiptShapeError(currentReceipt) ||
    currentReceipt.plan.kind !== "performance-iteration" ||
    getToolcraftDeliveryLifecycleStateError(previousAnchor?.lifecycle) ||
    previousAnchor.lifecycle.performanceEscalationOffered ||
    !currentReceipt.plan.lifecycle.performanceEscalationOffered ||
    previousAnchor?.performance?.kind !== "performance-iteration-report"
  ) {
    return null;
  }

  const currentPerformance = currentReceipt.evidence.find(
    ({ kind }) => kind === "browser-performance",
  );
  const currentReport = currentPerformance?.report;
  const previousReport = previousAnchor.performance.report;
  const comparisonHash = previousAnchor.performance.comparisonHash;
  const comparison = currentReceipt.plan.performanceComparison;
  const comparisonMatches =
    comparison.kind === "compatible-targeted-report" &&
    comparison.comparisonHash === comparisonHash;

  if (
    !comparisonMatches ||
    !isSha256(currentReport?.requestAuthorityHash) ||
    !isSha256(previousReport?.requestAuthorityHash) ||
    !isSha256(comparisonHash) ||
    currentReport.requestAuthorityHash === previousReport.requestAuthorityHash
  ) {
    return null;
  }

  return fullAuditRecommendation;
}

export function formatToolcraftPerformanceEscalationRecommendation(
  recommendation,
) {
  if (recommendation?.kind !== "offer-full-performance-audit") return "";

  return [
    "Toolcraft performance recommendation:",
    "two consecutive compatible targeted iterations have passed.",
    "Offer the user a slower complete performance audit if performance is still unacceptable.",
    `Do not run ${TOOLCRAFT_FULL_PERFORMANCE_VERIFICATION_COMMAND} without explicit user consent; the user does not need to know the command name.`,
  ].join(" ");
}
