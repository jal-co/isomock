import type {
  ToolcraftEnvelopePerformanceConfig,
  ToolcraftRenderPass,
  ToolcraftRendererStrategy,
} from "./performance-types";
import type {
  ToolcraftRenderPassCost,
  ToolcraftRenderPassLifecycle,
} from "./performance-workload-types";
import type { ToolcraftRenderPlanBenchmarkRequirement } from "./performance-render-plan-model";
import {
  compareCodeUnits,
  formatValue,
  isRecord,
  isTrimmedNonEmptyString,
  rendererStrategies,
  type UnknownRecord,
} from "./performance-render-plan-utils";

export type ToolcraftRenderPassAssessment = {
  errors: readonly string[];
  requirements: readonly ToolcraftRenderPlanBenchmarkRequirement[];
};

const renderPassFrequencies = new Set<ToolcraftRenderPassCost["frequency"]>([
  "once",
  "discrete",
  "interaction",
  "frame",
  "batch",
]);

const renderPassRelationships = new Set<ToolcraftRenderPassCost["relationship"]>([
  "constant",
  "linear",
  "quadratic",
  "product",
  "benchmark",
]);

const renderPassCaches = new Set<ToolcraftRenderPassLifecycle["cache"]>([
  "none",
  "memoized",
  "retained-resource",
]);

const renderPassResourceScopes = new Set<
  ToolcraftRenderPassLifecycle["resourceScope"]
>(["call", "interaction", "renderer", "source"]);

const benchmarkRelationships = new Set<ToolcraftRenderPassCost["relationship"]>([
  "quadratic",
  "product",
  "benchmark",
]);

const gpuCandidatePassKinds = new Set<ToolcraftRenderPass["kind"]>([
  "pixel-transform",
  "rasterize",
  "composite",
]);

function getCostErrors(
  pass: ToolcraftRenderPass,
  passLabel: string,
  dimensionIds: ReadonlySet<string>,
): string[] {
  const cost = pass.cost as unknown;
  if (!isRecord(cost)) {
    return [`${passLabel} must declare cost for envelope render-plan assessment.`];
  }

  const errors: string[] = [];
  if (!renderPassFrequencies.has(cost.frequency as ToolcraftRenderPassCost["frequency"])) {
    errors.push(
      `${passLabel} cost.frequency "${formatValue(cost.frequency)}" is not supported.`,
    );
  }
  if (
    !renderPassRelationships.has(
      cost.relationship as ToolcraftRenderPassCost["relationship"],
    )
  ) {
    errors.push(
      `${passLabel} cost.relationship "${formatValue(cost.relationship)}" is not supported.`,
    );
  }

  if (!Array.isArray(cost.dimensions)) {
    errors.push(`${passLabel} cost.dimensions must be an array.`);
    return errors;
  }

  const seenDimensions = new Set<string>();
  for (const [index, dimensionId] of cost.dimensions.entries()) {
    if (!isTrimmedNonEmptyString(dimensionId)) {
      errors.push(
        `${passLabel} cost dimension at index ${index} must be a non-empty trimmed workload dimension id.`,
      );
      continue;
    }
    if (seenDimensions.has(dimensionId)) {
      errors.push(
        `${passLabel} cost dimensions must be unique; received duplicate "${dimensionId}".`,
      );
    } else {
      seenDimensions.add(dimensionId);
    }
    if (!dimensionIds.has(dimensionId)) {
      errors.push(
        `${passLabel} cost dimension "${dimensionId}" does not exist in workloadEnvelope.dimensions.`,
      );
    }
  }

  if (
    renderPassRelationships.has(
      cost.relationship as ToolcraftRenderPassCost["relationship"],
    ) &&
    cost.relationship !== "constant" &&
    cost.dimensions.length === 0
  ) {
    errors.push(
      `${passLabel} non-constant cost relationship "${cost.relationship}" requires at least one dimension.`,
    );
  }
  return errors;
}

function getInteractiveCeilingErrors(
  config: ToolcraftEnvelopePerformanceConfig,
  pass: ToolcraftRenderPass,
  passLabel: string,
): string[] {
  const cost = pass.cost;
  if (
    !cost ||
    (cost.frequency !== "frame" && cost.frequency !== "interaction") ||
    !Array.isArray(cost.dimensions)
  ) {
    return [];
  }

  const dimensionsById = new Map(
    config.workloadEnvelope.dimensions.flatMap((dimension) =>
      isRecord(dimension) && isTrimmedNonEmptyString(dimension.id)
        ? [[dimension.id, dimension] as const]
        : [],
    ),
  );
  return cost.dimensions.flatMap((dimensionId) => {
    if (!isTrimmedNonEmptyString(dimensionId)) {
      return [];
    }
    const dimension = dimensionsById.get(dimensionId);
    return dimension && dimension.interactiveMax === undefined
      ? [
          `${passLabel} cost dimension "${dimensionId}" must declare interactiveMax because frame and interaction work is assessed at the interactive ceiling.`,
        ]
      : [];
  });
}

function getLifecycleErrors(
  pass: ToolcraftRenderPass,
  passLabel: string,
): string[] {
  const lifecycle = pass.lifecycle as unknown;
  if (!isRecord(lifecycle)) {
    return [
      `${passLabel} must declare lifecycle for envelope render-plan assessment.`,
    ];
  }

  const errors: string[] = [];
  if (!renderPassCaches.has(lifecycle.cache as ToolcraftRenderPassLifecycle["cache"])) {
    errors.push(
      `${passLabel} lifecycle.cache "${formatValue(lifecycle.cache)}" is not supported.`,
    );
  }
  if (
    !renderPassResourceScopes.has(
      lifecycle.resourceScope as ToolcraftRenderPassLifecycle["resourceScope"],
    )
  ) {
    errors.push(
      `${passLabel} lifecycle.resourceScope "${formatValue(lifecycle.resourceScope)}" is not supported.`,
    );
  }
  if (
    lifecycle.cache === "retained-resource" &&
    lifecycle.resourceScope === "call"
  ) {
    errors.push(
      `${passLabel} retains a resource with call scope. Retained resources must outlive an individual render call.`,
    );
  }
  return errors;
}

function getStructuralPassErrors(
  pass: ToolcraftRenderPass,
  passLabel: string,
): string[] {
  if (
    (pass.cost?.frequency === "frame" || pass.cost?.frequency === "interaction") &&
    (pass.kind === "decode" || pass.kind === "preprocess")
  ) {
    const retentionBoundary =
      pass.cost.frequency === "frame"
        ? "outside the frame loop"
        : "outside high-frequency paths";
    return [
      `${passLabel} must not run ${pass.kind} work at ${pass.cost.frequency} frequency. Decode and source preprocessing must be retained ${retentionBoundary}.`,
    ];
  }
  return [];
}

function getCandidateSet(
  config: ToolcraftEnvelopePerformanceConfig,
  pass: ToolcraftRenderPass,
): readonly ToolcraftRendererStrategy[] {
  if (!gpuCandidatePassKinds.has(pass.kind)) {
    return [config.rendererStrategy];
  }
  return [
    ...new Set([
      "canvas-2d",
      "webgl",
      config.rendererStrategy,
    ] satisfies ToolcraftRendererStrategy[]),
  ];
}

function requiresKernelBenchmark(
  pass: ToolcraftRenderPass,
  cost: ToolcraftRenderPassCost,
): boolean {
  if (cost.frequency !== "frame" && cost.frequency !== "interaction") {
    return false;
  }
  if (benchmarkRelationships.has(cost.relationship)) return true;
  return (
    cost.relationship !== "constant" && gpuCandidatePassKinds.has(pass.kind)
  );
}

function getRequiredWorkload(
  config: ToolcraftEnvelopePerformanceConfig,
  cost: ToolcraftRenderPassCost,
): Readonly<Record<string, number>> | null {
  const dimensionsById = new Map<string, UnknownRecord>(
    config.workloadEnvelope.dimensions.flatMap((dimension) =>
      isRecord(dimension) && isTrimmedNonEmptyString(dimension.id)
        ? [[dimension.id, dimension] as const]
        : [],
    ),
  );

  const entries: [string, number][] = [];
  for (const dimensionId of [...cost.dimensions].sort(compareCodeUnits)) {
    const dimension = dimensionsById.get(dimensionId);
    if (!dimension) {
      return null;
    }
    const maximum =
      cost.frequency === "batch"
        ? (dimension.batchMax ?? dimension.interactiveMax)
        : dimension.interactiveMax;
    if (typeof maximum !== "number" || !Number.isFinite(maximum)) {
      return null;
    }
    entries.push([dimensionId, maximum]);
  }
  return Object.fromEntries(entries);
}

function getBenchmarkRequirement(
  config: ToolcraftEnvelopePerformanceConfig,
  pass: ToolcraftRenderPass,
): ToolcraftRenderPlanBenchmarkRequirement | null {
  const cost = pass.cost;
  if (
    !cost ||
    !Array.isArray(cost.dimensions) ||
    !cost.dimensions.every(isTrimmedNonEmptyString) ||
    !requiresKernelBenchmark(pass, cost) ||
    !isTrimmedNonEmptyString(pass.id) ||
    !rendererStrategies.has(config.rendererStrategy) ||
    config.rendererStrategy === "none"
  ) {
    return null;
  }

  const workload = getRequiredWorkload(config, cost);
  if (!workload) {
    return null;
  }

  return {
    candidates: getCandidateSet(config, pass),
    passId: pass.id,
    workload,
  };
}

export function assessToolcraftRenderPasses(
  config: ToolcraftEnvelopePerformanceConfig,
  passes: readonly ToolcraftRenderPass[],
): ToolcraftRenderPassAssessment {
  const dimensionIds = new Set(
    config.workloadEnvelope.dimensions.flatMap((dimension) =>
      isRecord(dimension) && isTrimmedNonEmptyString(dimension.id)
        ? [dimension.id]
        : [],
    ),
  );
  const errors: string[] = [];
  const requirements: ToolcraftRenderPlanBenchmarkRequirement[] = [];
  const seenPassIds = new Set<string>();

  for (const [index, pass] of passes.entries()) {
    const hasValidId = isTrimmedNonEmptyString(pass.id);
    const passLabel = hasValidId
      ? `rendererPipeline pass "${pass.id}"`
      : `rendererPipeline pass at index ${index}`;
    if (!hasValidId) {
      errors.push(`${passLabel} must have a non-empty trimmed id.`);
    } else if (seenPassIds.has(pass.id)) {
      errors.push(
        `rendererPipeline pass id "${pass.id}" must be unique for render-plan assessment.`,
      );
    } else {
      seenPassIds.add(pass.id);
    }

    const metadataPassLabel =
      typeof pass.id === "string"
        ? `rendererPipeline pass "${pass.id}"`
        : passLabel;
    errors.push(...getCostErrors(pass, metadataPassLabel, dimensionIds));
    errors.push(...getInteractiveCeilingErrors(config, pass, metadataPassLabel));
    errors.push(...getLifecycleErrors(pass, passLabel));
    errors.push(...getStructuralPassErrors(pass, passLabel));

    const requirement = getBenchmarkRequirement(config, pass);
    if (requirement) {
      requirements.push(requirement);
    }
  }
  return { errors, requirements };
}
