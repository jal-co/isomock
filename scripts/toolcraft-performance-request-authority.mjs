import fs from "node:fs/promises";
import path from "node:path";

import {
  createToolcraftPerformanceRequestAuthorityHash,
  validateToolcraftPerformanceAuthorityIteration,
} from "./toolcraft-performance-authority-policy.mjs";
import {
  selectToolcraftDecisionTrailIteration,
} from "./toolcraft-worklog-decision-trail.mjs";

function throwFirstError(errors) {
  if (errors.length > 0) throw new Error(errors[0]);
}

export function createToolcraftPerformanceRequestAuthority(source) {
  const latest = selectToolcraftDecisionTrailIteration(source);
  if (!latest) {
    throw new Error(
      "agent-worklog.md Decision Trail must include at least one iteration heading.",
    );
  }

  const validation =
    validateToolcraftPerformanceAuthorityIteration(latest);
  throwFirstError(validation.errors);
  if (validation.intent === "ordinary-product-work") return null;
  if (
    !validation.pathIds ||
    validation.request === undefined ||
    validation.requestEvidence === undefined
  ) {
    throw new Error(
      "Toolcraft performance request authority is incomplete.",
    );
  }

  const canonical = {
    heading: latest.heading,
    pathIds: Object.freeze(validation.pathIds),
    request: validation.request,
    requestEvidence: validation.requestEvidence,
  };
  return Object.freeze({
    hash: createToolcraftPerformanceRequestAuthorityHash(canonical),
    ...canonical,
  });
}

export async function readToolcraftPerformanceRequestAuthority(projectDir) {
  const worklogPath = path.join(
    path.resolve(projectDir),
    "docs",
    "toolcraft",
    "agent-worklog.md",
  );
  return createToolcraftPerformanceRequestAuthority(
    await fs.readFile(worklogPath, "utf8"),
  );
}
