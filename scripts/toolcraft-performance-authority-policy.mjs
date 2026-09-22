import { createHash } from "node:crypto";

import { decodeToolcraftPerformancePathId } from "../src/toolcraft/runtime/testing/performance-path-codec.mjs";
import { validateToolcraftPerformanceRequestEvidenceMatch } from "../src/toolcraft/runtime/contracts/performance-request-evidence-policy.mjs";

export const TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND =
  "npm run verify:delivery";
export const TOOLCRAFT_FULL_PERFORMANCE_VERIFICATION_COMMAND =
  TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND.replace(
    "verify:delivery",
    "verify:perf",
  );
export const TOOLCRAFT_DELIVERY_VERIFICATION_NARRATIVE =
  `One bare \`${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND}\` will derive and run the protected proof.`;

const forbiddenAuthorityFieldPattern =
  /^(?:command|performance command|verification command|run|tier|verification tier|test selectors?|unit test(?: selector)?|browser test(?: selector)?|performance test(?: selector)?)$/iu;

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createToolcraftPerformanceRequestAuthorityHash({
  heading,
  pathIds,
  request,
  requestEvidence,
}) {
  return createHash("sha256")
    .update(JSON.stringify({ heading, pathIds, request, requestEvidence }))
    .digest("hex");
}

export function getToolcraftPerformanceRequestAuthorityError(value) {
  const keys = ["hash", "heading", "pathIds", "request", "requestEvidence"];
  if (
    !isRecord(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key)) ||
    !/^[a-f0-9]{64}$/u.test(value.hash) ||
    typeof value.heading !== "string" ||
    !value.heading.trim() ||
    value.heading.trim() !== value.heading ||
    typeof value.request !== "string" ||
    !value.request.trim() ||
    value.request.trim() !== value.request ||
    typeof value.requestEvidence !== "string" ||
    !value.requestEvidence ||
    !Array.isArray(value.pathIds) ||
    value.pathIds.length === 0 ||
    !value.pathIds.every((pathId) =>
      typeof pathId === "string" &&
      decodeToolcraftPerformancePathId(pathId)
    ) ||
    value.pathIds.some((pathId, index) =>
      index > 0 && compareCodeUnits(value.pathIds[index - 1], pathId) >= 0
    )
  ) {
    return "Performance iteration authority is malformed.";
  }
  if (
    !validateToolcraftPerformanceRequestEvidenceMatch(
      value.request,
      value.requestEvidence,
    ).valid
  ) {
    return "Performance iteration authority request evidence is invalid.";
  }
  if (
    createToolcraftPerformanceRequestAuthorityHash(value) !== value.hash
  ) {
    return "Performance iteration authority hash does not match its exact request.";
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function getToolcraftDecisionTrailFieldMatches(iteration, field) {
  return [
    ...iteration.body.matchAll(
      new RegExp(
        `^-[ \\t]*${escapeRegExp(field)}:[ \\t]*(.*?)[ \\t]*$`,
        "gimu",
      ),
    ),
  ].map((match) => match[1].trim());
}

function getSingleField(iteration, field, error) {
  const matches = getToolcraftDecisionTrailFieldMatches(iteration, field);
  return matches.length === 1
    ? { value: matches[0] }
    : { error };
}

function getForbiddenAuthorityFields(body) {
  return [...body.matchAll(/^-[ \t]*([^:\r\n]+):/gimu)]
    .map((match) => match[1].trim())
    .filter((field) => forbiddenAuthorityFieldPattern.test(field));
}

function parsePerformancePaths(value) {
  let pathIds;
  try {
    pathIds = JSON.parse(value);
  } catch {
    return {
      error: "Performance paths must be a JSON array of canonical path IDs",
    };
  }
  if (
    !Array.isArray(pathIds) ||
    pathIds.length === 0 ||
    !pathIds.every((pathId) => typeof pathId === "string") ||
    new Set(pathIds).size !== pathIds.length
  ) {
    return {
      error: "Performance paths must be a non-empty unique JSON array",
    };
  }
  if (!pathIds.every((pathId) => decodeToolcraftPerformancePathId(pathId))) {
    return {
      error: "Performance paths must contain only canonical path IDs",
    };
  }
  return { pathIds: pathIds.slice().sort(compareCodeUnits) };
}

function parseRequestEvidence(value, request) {
  const match = /^(?:"([^"\r\n]+)"|“([^”\r\n]+)”)$/u.exec(value);
  const requestEvidence = match?.[1] ?? match?.[2];
  if (!requestEvidence) {
    return {
      error:
        "Performance request evidence must be one exact quoted raw Request substring",
    };
  }
  const result = validateToolcraftPerformanceRequestEvidenceMatch(
    request,
    requestEvidence,
  );
  if (!result.valid) {
    return {
      error:
        result.reason === "evidence-too-short"
          ? "Performance request evidence must be a nontrivial quote"
          : "Performance request evidence must be one exact quoted raw Request substring",
    };
  }
  return { requestEvidence };
}

export function getToolcraftDecisionTrailVerificationErrors(iteration) {
  const field = getSingleField(
    iteration,
    "Verification",
    `agent-worklog.md Decision Trail iteration "${iteration.heading}" must include exactly one "Verification:".`,
  );
  if (field.error) return [field.error];
  // Human results never select commands or confer execution authority.
  return field.value ? [] : [`agent-worklog.md Decision Trail iteration "${iteration.heading}" Verification must describe the selected checks and their result.`];
}

export function validateToolcraftPerformanceAuthorityIteration(iteration) {
  const requestField = getSingleField(
    iteration,
    "Request",
    `agent-worklog.md Decision Trail iteration "${iteration.heading}" must include exactly one "Request:" before performance authority can be evaluated.`,
  );
  const intentFields = getToolcraftDecisionTrailFieldMatches(iteration, "Performance intent");
  const intentField = intentFields.length === 0
    ? { value: "ordinary-product-work" }
    : getSingleField(iteration, "Performance intent",
      `agent-worklog.md Decision Trail iteration "${iteration.heading}" must include exactly one "Performance intent:".`);
  const errors = [
    ...(requestField.error ? [requestField.error] : []),
    ...(intentField.error ? [intentField.error] : []),
  ];
  const request = requestField.value;
  const intent = intentField.value;
  const evidenceFields = getToolcraftDecisionTrailFieldMatches(
    iteration,
    "Performance request evidence",
  );
  const pathFields = getToolcraftDecisionTrailFieldMatches(
    iteration,
    "Performance paths",
  );
  const hasForbiddenAuthority =
    getForbiddenAuthorityFields(iteration.body).length > 0;

  if (!request || !intent) {
    return { errors, intent, request };
  }
  if (intent === "ordinary-product-work") {
    if (
      evidenceFields.length > 0 ||
      pathFields.length > 0 ||
      hasForbiddenAuthority
    ) {
      errors.push(
        `agent-worklog.md Decision Trail iteration "${iteration.heading}" ordinary-product-work cannot carry performance request authority.`,
      );
    }
    return { errors, intent, request };
  }
  if (intent !== "performance-iteration") {
    errors.push(
      `agent-worklog.md Decision Trail iteration "${iteration.heading}" has an unknown Performance intent.`,
    );
    return { errors, intent, request };
  }

  if (hasForbiddenAuthority) {
    errors.push(
      `agent-worklog.md Decision Trail iteration "${iteration.heading}" cannot use command, tier, or test-selector fields as performance authority.`,
    );
  }
  if (evidenceFields.length !== 1) {
    errors.push(
      `agent-worklog.md Decision Trail iteration "${iteration.heading}" must include exactly one "Performance request evidence:".`,
    );
  }
  if (pathFields.length !== 1) {
    errors.push(
      `agent-worklog.md Decision Trail iteration "${iteration.heading}" must include exactly one "Performance paths:".`,
    );
  }

  const evidenceResult =
    evidenceFields.length === 1
      ? parseRequestEvidence(evidenceFields[0], request)
      : {};
  if (evidenceResult.error) {
    errors.push(
      `agent-worklog.md Decision Trail iteration "${iteration.heading}" ${evidenceResult.error}.`,
    );
  }
  const pathsResult =
    pathFields.length === 1 ? parsePerformancePaths(pathFields[0]) : {};
  if (pathsResult.error) {
    errors.push(
      `agent-worklog.md Decision Trail iteration "${iteration.heading}" ${pathsResult.error}.`,
    );
  }
  return {
    errors,
    intent,
    pathIds: pathsResult.pathIds,
    request,
    requestEvidence: evidenceResult.requestEvidence,
  };
}
