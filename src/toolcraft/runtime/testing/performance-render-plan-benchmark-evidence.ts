import type {
  ToolcraftEnvelopePerformanceConfig,
  ToolcraftRendererStrategy,
} from "./performance-types";
import type { ToolcraftRenderPlanBenchmarkRequirement } from "./performance-render-plan-model";
import {
  formatValue,
  isRecord,
  isTrimmedNonEmptyString,
  rendererStrategies,
  type UnknownRecord,
} from "./performance-render-plan-utils";

export type ToolcraftBenchmarkDecisionValidation = {
  errors: readonly string[];
  resolvedPassIds: ReadonlySet<string>;
};

function getDecisionShapeErrors(
  decision: UnknownRecord,
  index: number,
): string[] {
  const errors: string[] = [];
  if (!isTrimmedNonEmptyString(decision.id)) {
    errors.push(
      `kernelBenchmarkDecisions[${index}].id must be a non-empty trimmed render pass id.`,
    );
  }
  const label = isTrimmedNonEmptyString(decision.id)
    ? `kernelBenchmarkDecisions "${decision.id}"`
    : `kernelBenchmarkDecisions[${index}]`;
  if (!isTrimmedNonEmptyString(decision.decision)) {
    errors.push(`${label} decision must be non-empty and trimmed.`);
  }
  if (!Array.isArray(decision.candidates)) {
    errors.push(`${label} candidates must be an array.`);
  }
  if (!rendererStrategies.has(decision.selected as ToolcraftRendererStrategy)) {
    errors.push(
      `${label} selected strategy "${formatValue(decision.selected)}" is not supported.`,
    );
  }
  if (Object.prototype.hasOwnProperty.call(decision, "measurements")) {
    errors.push(
      `${label} must not contain authored measurements; run the protected kernel benchmark command for execution evidence.`,
    );
  }
  return errors;
}

function getCandidateErrors(
  decision: UnknownRecord,
  label: string,
  requirement: ToolcraftRenderPlanBenchmarkRequirement,
): string[] {
  if (!Array.isArray(decision.candidates)) return [];

  const errors: string[] = [];
  const seen = new Set<string>();
  for (const candidate of decision.candidates) {
    if (!rendererStrategies.has(candidate as ToolcraftRendererStrategy)) {
      errors.push(
        `${label} candidate "${formatValue(candidate)}" is not a supported renderer strategy.`,
      );
      continue;
    }
    if (seen.has(candidate)) {
      errors.push(
        `${label} candidates must be unique; received duplicate "${candidate}".`,
      );
    } else {
      seen.add(candidate);
    }
  }

  if (
    decision.candidates.length !== requirement.candidates.length ||
    requirement.candidates.some((candidate) => !seen.has(candidate))
  ) {
    errors.push(
      `${label} candidates must exactly match required candidates ${requirement.candidates.join(
        ", ",
      )}.`,
    );
  }
  if (
    rendererStrategies.has(decision.selected as ToolcraftRendererStrategy) &&
    !decision.candidates.includes(decision.selected)
  ) {
    errors.push(
      `${label} selected strategy "${decision.selected}" must be declared in candidates.`,
    );
  }
  return errors;
}

export function validateToolcraftBenchmarkDecisions(
  config: ToolcraftEnvelopePerformanceConfig,
  requirements: readonly ToolcraftRenderPlanBenchmarkRequirement[],
): ToolcraftBenchmarkDecisionValidation {
  const rawDecisions = config.kernelBenchmarkDecisions as unknown;
  if (rawDecisions === undefined) {
    return { errors: [], resolvedPassIds: new Set() };
  }
  if (!Array.isArray(rawDecisions)) {
    return {
      errors: ["kernelBenchmarkDecisions must be an array when provided."],
      resolvedPassIds: new Set(),
    };
  }

  const errors: string[] = [];
  const requirementByPassId = new Map<
    string,
    ToolcraftRenderPlanBenchmarkRequirement
  >();
  const requirementIdCounts = new Map<string, number>();
  for (const requirement of requirements) {
    requirementIdCounts.set(
      requirement.passId,
      (requirementIdCounts.get(requirement.passId) ?? 0) + 1,
    );
    if (!requirementByPassId.has(requirement.passId)) {
      requirementByPassId.set(requirement.passId, requirement);
    }
  }
  const decisionIdCounts = new Map<string, number>();
  for (const rawEntry of rawDecisions) {
    if (isRecord(rawEntry) && isTrimmedNonEmptyString(rawEntry.id)) {
      decisionIdCounts.set(
        rawEntry.id,
        (decisionIdCounts.get(rawEntry.id) ?? 0) + 1,
      );
    }
  }
  const seenIds = new Set<string>();
  const resolvedPassIds = new Set<string>();

  for (const [index, rawEntry] of rawDecisions.entries()) {
    if (!isRecord(rawEntry)) {
      errors.push(`kernelBenchmarkDecisions[${index}] must be a non-null object.`);
      continue;
    }

    const entryErrors = getDecisionShapeErrors(rawEntry, index);
    const id = rawEntry.id;
    if (!isTrimmedNonEmptyString(id)) {
      errors.push(...entryErrors);
      continue;
    }
    const label = `kernelBenchmarkDecisions "${id}"`;
    if (seenIds.has(id)) {
      entryErrors.push(`kernelBenchmarkDecisions id "${id}" must be unique.`);
    } else {
      seenIds.add(id);
    }
    const requirement = requirementByPassId.get(id);
    if (!requirement) {
      entryErrors.push(
        `${label} does not map to a required render pass benchmark.`,
      );
      errors.push(...entryErrors);
      continue;
    }

    entryErrors.push(...getCandidateErrors(rawEntry, label, requirement));
    if (rawEntry.selected !== config.rendererStrategy) {
      entryErrors.push(
        `${label} selected strategy "${formatValue(
          rawEntry.selected,
        )}" must match rendererStrategy "${config.rendererStrategy}".`,
      );
    }
    if (
      entryErrors.length === 0 &&
      decisionIdCounts.get(id) === 1 &&
      requirementIdCounts.get(id) === 1
    ) {
      resolvedPassIds.add(id);
    }
    errors.push(...entryErrors);
  }

  return { errors, resolvedPassIds };
}
