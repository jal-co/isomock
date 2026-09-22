import {
  classifyToolcraftPerformanceRequest,
  describeToolcraftPerformanceRequestReason,
  validateToolcraftPerformanceRequestEvidence,
} from "@/toolcraft/runtime";

import {
  getToolcraftDecisionTrailVerificationErrors,
  TOOLCRAFT_DELIVERY_VERIFICATION_NARRATIVE,
  validateToolcraftPerformanceAuthorityIteration,
} from "../../scripts/toolcraft-performance-authority-policy.mjs";
import type { ToolcraftDecisionTrailIteration } from "../../scripts/toolcraft-worklog-decision-trail.mjs";
import type { AgentWorklogFixtureOptions } from "./app-acceptance.worklog-test-utils";

export const clearPerformanceSignalError =
  'agent-worklog.md Decision Trail iteration "Delivery 1 - Product build" contains a clear user performance signal and must use performance-iteration.';

export const fixturePerformancePathId =
  "performance-path:%5B%22interactive-discrete%22%2C%22control-change%22%2C%5B%22composite%22%5D%2C%5B%5D%2C%5B%5D%2C%5B%22main%22%5D%2C%5B%5D%5D";

type PerformanceIterationFixtureOptions = AgentWorklogFixtureOptions & {
  evidence?: string;
  pathIds?: readonly string[];
  request: string;
};

export function createPerformanceIterationWorklogFixture(
  createFixture: (options?: AgentWorklogFixtureOptions) => string,
  {
    evidence,
    pathIds = [fixturePerformancePathId],
    request,
    ...options
  }: PerformanceIterationFixtureOptions,
): string {
  const worklog = createFixture({
    ...options,
    trailFields: {
      ...options.trailFields,
      "Performance intent": "performance-iteration",
      Request: request,
      Verification:
        options.trailFields?.Verification ??
        TOOLCRAFT_DELIVERY_VERIFICATION_NARRATIVE,
    },
    verificationLines:
      options.verificationLines ??
      ["Protected receipts own executed checks and measurements."],
  });
  return worklog.replace(
    "- Performance intent: performance-iteration",
    [
      "- Performance intent: performance-iteration",
      `- Performance request evidence: "${evidence ?? request}"`,
      `- Performance paths: ${JSON.stringify(pathIds)}`,
    ].join("\n"),
  );
}

export function getDecisionTrailVerificationErrors(
  iteration: ToolcraftDecisionTrailIteration,
): string[] {
  return getToolcraftDecisionTrailVerificationErrors(iteration);
}

export function getPerformanceIntentErrors(
  iteration: ToolcraftDecisionTrailIteration,
): string[] {
  const validation =
    validateToolcraftPerformanceAuthorityIteration(iteration);
  const errors = [...validation.errors];
  if (
    validation.intent === "ordinary-product-work" &&
    validation.request !== undefined &&
    classifyToolcraftPerformanceRequest(validation.request).intent ===
      "performance-iteration"
  ) {
    errors.push(
      `agent-worklog.md Decision Trail iteration "${iteration.heading}" contains a clear user performance signal and must use performance-iteration.`,
    );
  }
  if (
    validation.intent === "performance-iteration" &&
    validation.request !== undefined &&
    validation.requestEvidence !== undefined
  ) {
    const result = validateToolcraftPerformanceRequestEvidence(
      validation.request,
      validation.requestEvidence,
    );
    if (!result.valid) {
      errors.push(
        `agent-worklog.md Decision Trail iteration "${iteration.heading}" has invalid performance iteration Request evidence: ${describeToolcraftPerformanceRequestReason(result.reason)}`,
      );
    }
  }
  return errors;
}
