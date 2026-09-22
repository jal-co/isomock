import {
  getToolcraftDiscretePathDomainValues,
  getToolcraftGenericPassPressure,
  toolcraftDevelopmentPressure,
  toolcraftFixturePressureTolerance,
} from "./performance-fixture-cost-model";
import {
  areToolcraftFixtureValuesEqual,
  isToolcraftFixtureValueWithinRange,
} from "./performance-fixture-numeric";
import { getToolcraftDiscreteFixtureValues } from "./performance-fixture-discrete-adapters";
import { getToolcraftDiscreteCombinationPlanningError } from "./performance-fixture-discrete-search";
import {
  parseToolcraftPerformanceFixtureRegistry,
  type ToolcraftParsedPerformanceFixtureRegistry,
} from "./performance-fixture-registry-validation";
import { hasOwnToolcraftFixtureKey } from "./performance-fixture-record";
import type { ToolcraftPerformancePath } from "./performance-path-model";
import { deriveToolcraftPerformancePathsFromParsedPipeline } from "./performance-paths";
import { parseToolcraftRendererPipeline } from "./performance-renderer-pipeline-parser";
import { compareCodeUnits } from "./performance-render-plan-utils";
import type {
  ToolcraftEnvelopePerformanceConfig,
  ToolcraftPerformanceFixtureInverseCheckpoint,
  ToolcraftRenderPass,
} from "./performance-types";
import type { ToolcraftWorkloadDimension } from "./performance-workload-types";

export type ToolcraftFixturePathAnalysis = {
  boundaries: ReadonlyMap<string, number>;
  developmentEvidenceValues?: Readonly<Record<string, number>>;
  dimensions: readonly ToolcraftWorkloadDimension[];
  errors: readonly string[];
  passes: readonly ToolcraftRenderPass[];
  registry?: ToolcraftParsedPerformanceFixtureRegistry;
};

function sameNumbers(left: number, right: number): boolean {
  return areToolcraftFixtureValuesEqual(left, right);
}

function sameVector(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
  dimensionIds: readonly string[],
): boolean {
  return dimensionIds.every(
    (dimensionId) =>
      hasOwnToolcraftFixtureKey(left, dimensionId) &&
      hasOwnToolcraftFixtureKey(right, dimensionId) &&
      typeof left[dimensionId] === "number" &&
      typeof right[dimensionId] === "number" &&
      sameNumbers(left[dimensionId]!, right[dimensionId]!),
  );
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function samePath(
  left: ToolcraftPerformancePath,
  right: ToolcraftPerformancePath,
): boolean {
  return (
    left.id === right.id &&
    left.interaction === right.interaction &&
    left.profile === right.profile &&
    sameStrings(left.invalidates, right.invalidates) &&
    sameStrings(left.preparationInvalidates, right.preparationInvalidates) &&
    sameStrings(left.retainedAccesses, right.retainedAccesses) &&
    sameStrings(left.runsOn, right.runsOn) &&
    sameStrings(left.targets, right.targets) &&
    sameStrings(left.workloadDimensions, right.workloadDimensions)
  );
}

function passRequiresEvidence(
  pass: ToolcraftRenderPass,
  dimensionsById: ReadonlyMap<string, ToolcraftWorkloadDimension>,
): boolean {
  return Boolean(
    pass.cost &&
      (pass.cost.relationship === "benchmark" ||
        pass.cost.dimensions.some(
          (dimensionId) => dimensionsById.get(dimensionId)?.mapping === "custom",
        )),
  );
}

function getBoundary(
  dimension: ToolcraftWorkloadDimension,
  path: ToolcraftPerformancePath,
): number | undefined {
  return path.profile === "batch-responsive"
    ? dimension.batchMax
    : dimension.interactiveMax;
}

function validatePathEvidence(
  path: ToolcraftPerformancePath,
  dimensions: readonly ToolcraftWorkloadDimension[],
  passes: readonly ToolcraftRenderPass[],
  registry: ToolcraftParsedPerformanceFixtureRegistry,
  boundaries: ReadonlyMap<string, number>,
): { errors: string[]; values?: Readonly<Record<string, number>> } {
  const errors: string[] = [];
  const unexpectedKeyErrors: string[] = [];
  const dimensionIds = [...path.workloadDimensions].sort(compareCodeUnits);
  const dimensionsById = new Map(
    dimensions.map((dimension) => [dimension.id, dimension] as const),
  );
  const requiredPasses = passes
    .filter((pass) => passRequiresEvidence(pass, dimensionsById))
    .sort((left, right) => compareCodeUnits(left.id, right.id));
  const pathCheckpoints = registry.inverseCheckpoints.filter(
    (checkpoint) => checkpoint.pathId === path.id,
  );
  const requiredCheckpoints: ToolcraftPerformanceFixtureInverseCheckpoint[] = [];

  for (const pass of requiredPasses) {
    const matches = pathCheckpoints.filter(
      (checkpoint) => checkpoint.passId === pass.id,
    );
    if (matches.length !== 1) {
      errors.push(
        `Performance path "${path.id}" requires exactly one measured inverse checkpoint for pass "${pass.id}" at normalizedPressure ${toolcraftDevelopmentPressure}.`,
      );
      continue;
    }
    const checkpoint = matches[0]!;
    requiredCheckpoints.push(checkpoint);
    const label = `Performance path "${path.id}" checkpoint for pass "${pass.id}"`;
    if (
      !Number.isFinite(checkpoint.normalizedPressure) ||
      Math.abs(checkpoint.normalizedPressure - toolcraftDevelopmentPressure) >
        toolcraftFixturePressureTolerance
    ) {
      errors.push(`${label} must have normalizedPressure ${toolcraftDevelopmentPressure}.`);
    }
    if (!checkpoint.measuredResult.trim()) {
      errors.push(`${label} must describe its measuredResult.`);
    }
    const keys = Object.keys(checkpoint.values).sort(compareCodeUnits);
    for (const dimensionId of dimensionIds) {
      if (!keys.includes(dimensionId)) {
        errors.push(`${label} is missing dimension key "${dimensionId}".`);
      }
    }
    for (const key of keys) {
      if (!dimensionIds.includes(key)) {
        unexpectedKeyErrors.push(`${label} has unexpected dimension key "${key}".`);
      }
    }
    for (const dimensionId of dimensionIds) {
      if (!hasOwnToolcraftFixtureKey(checkpoint.values, dimensionId)) continue;
      const value = checkpoint.values[dimensionId];
      const dimension = dimensionsById.get(dimensionId);
      const boundary = boundaries.get(dimensionId);
      if (value === undefined || !dimension || boundary === undefined) continue;
      if (!Number.isFinite(value)) {
        errors.push(`${label} value for dimension "${dimensionId}" must be finite.`);
        continue;
      }
      const minimum = Math.min(dimension.defaultValue, boundary);
      const maximum = Math.max(dimension.defaultValue, boundary);
      if (!isToolcraftFixtureValueWithinRange(value, minimum, maximum)) {
        errors.push(
          `${label} value ${value} for dimension "${dimensionId}" is outside declared path boundaries ${minimum}..${maximum}.`,
        );
      }
      const reachableValues = registry.dimensions[dimensionId]
        ? getToolcraftDiscreteFixtureValues(registry.dimensions[dimensionId]!)
        : undefined;
      if (
        reachableValues &&
        !reachableValues.some((reachableValue) =>
          areToolcraftFixtureValuesEqual(value, reachableValue),
        )
      ) {
        errors.push(
          `${label} value ${value} for dimension "${dimensionId}" is not present in fixtureAdapters.dimensions[${JSON.stringify(dimensionId)}].entries.`,
        );
      }
    }
  }

  errors.push(...unexpectedKeyErrors);

  const requiredPassIds = new Set(requiredPasses.map((pass) => pass.id));
  for (const checkpoint of [...pathCheckpoints].sort((left, right) =>
    compareCodeUnits(left.passId, right.passId),
  )) {
    if (!requiredPassIds.has(checkpoint.passId)) {
      errors.push(
        `Performance path "${path.id}" has an orphan inverse checkpoint for pass "${checkpoint.passId}".`,
      );
    }
  }

  const first = requiredCheckpoints[0];
  if (
    first &&
    requiredCheckpoints.some(
      (checkpoint) => !sameVector(first.values, checkpoint.values, dimensionIds),
    )
  ) {
    errors.push(
      `Performance path "${path.id}" inverse checkpoints must describe the same combined values vector.`,
    );
  }

  const values = first?.values;
  if (
    values &&
    dimensionIds.every(
      (dimensionId) =>
        hasOwnToolcraftFixtureKey(values, dimensionId) &&
        Number.isFinite(values[dimensionId]),
    )
  ) {
    for (const pass of passes.filter(
      (candidate) => !requiredPassIds.has(candidate.id),
    )) {
      const pressure = getToolcraftGenericPassPressure(
        pass,
        dimensionsById,
        boundaries,
        values,
      );
      if (
        Number.isFinite(pressure) &&
        pressure > toolcraftDevelopmentPressure + toolcraftFixturePressureTolerance
      ) {
        errors.push(
          `Performance path "${path.id}" generic pass "${pass.id}" pressure ${pressure} exceeds development target ${toolcraftDevelopmentPressure}.`,
        );
      }
    }
  }

  return values && errors.length === 0 ? { errors, values } : { errors };
}

export function analyzeToolcraftPerformanceFixturePath(
  config: ToolcraftEnvelopePerformanceConfig,
  path: ToolcraftPerformancePath,
  requireRegistry: boolean,
): ToolcraftFixturePathAnalysis {
  const parsedPipeline = parseToolcraftRendererPipeline(
    config.rendererPipeline as unknown,
  );
  const canonicalPaths =
    deriveToolcraftPerformancePathsFromParsedPipeline(parsedPipeline);
  const canonicalPath = canonicalPaths.find((candidate) => candidate.id === path.id);
  const registryResult = parseToolcraftPerformanceFixtureRegistry(
    config,
    requireRegistry,
  );
  const errors = [...registryResult.errors];
  if (!canonicalPath || !samePath(canonicalPath, path)) {
    errors.push(
      `Performance path "${path.id}" does not match a canonical path derived from rendererPipeline.interactionInvalidation.`,
    );
  }

  const selectedPath = canonicalPath ?? path;
  const dimensionsById = new Map(
    registryResult.workloadDimensions.map((dimension) => [dimension.id, dimension]),
  );
  const passesById = new Map(
    (parsedPipeline.pipeline?.passes ?? []).map((pass) => [pass.id, pass] as const),
  );
  const dimensions = selectedPath.workloadDimensions.flatMap((dimensionId) => {
    const dimension = dimensionsById.get(dimensionId);
    return dimension ? [dimension] : [];
  });
  const passes = selectedPath.invalidates.flatMap((passId) => {
    const pass = passesById.get(passId);
    return pass ? [pass] : [];
  });
  const boundaries = new Map<string, number>();
  for (const dimensionId of selectedPath.workloadDimensions) {
    const dimension = dimensionsById.get(dimensionId);
    if (!dimension) {
      errors.push(
        `Performance path "${selectedPath.id}" references unknown workload dimension "${dimensionId}".`,
      );
      continue;
    }
    const boundary = getBoundary(dimension, selectedPath);
    if (boundary === undefined) {
      errors.push(
        `${selectedPath.profile === "batch-responsive" ? "Batch" : "Interactive"} performance path "${selectedPath.id}" requires workload dimension "${dimensionId}" to declare ${selectedPath.profile === "batch-responsive" ? "batchMax" : "interactiveMax"}.`,
      );
    } else {
      boundaries.set(dimensionId, boundary);
    }
  }

  let developmentEvidenceValues: Readonly<Record<string, number>> | undefined;
  if (registryResult.registry) {
    const canonicalPathIds = new Set(
      canonicalPaths.map((candidate) => candidate.id),
    );
    for (const checkpoint of [...registryResult.registry.inverseCheckpoints]
      .filter((candidate) => !canonicalPathIds.has(candidate.pathId))
      .sort((left, right) => {
        const pathOrder = compareCodeUnits(left.pathId, right.pathId);
        return pathOrder === 0
          ? compareCodeUnits(left.passId, right.passId)
          : pathOrder;
      })) {
      errors.push(
        `fixtureAdapters.inverseCheckpoints for path "${checkpoint.pathId}" pass "${checkpoint.passId}" does not match a canonical evidence-required pass.`,
      );
    }
    const evidence = validatePathEvidence(
      selectedPath,
      dimensions,
      passes,
      registryResult.registry,
      boundaries,
    );
    errors.push(...evidence.errors);
    developmentEvidenceValues = evidence.values;
    if (developmentEvidenceValues === undefined) {
      const planningError = getToolcraftDiscreteCombinationPlanningError(
        selectedPath.id,
        selectedPath.workloadDimensions.flatMap((dimensionId) => {
          const adapter = registryResult.registry!.dimensions[dimensionId];
          const domainValues = adapter
            ? getToolcraftDiscreteFixtureValues(adapter)
            : undefined;
          const dimension = dimensionsById.get(dimensionId);
          const boundary = boundaries.get(dimensionId);
          return domainValues && dimension && boundary !== undefined
            ? [
                getToolcraftDiscretePathDomainValues(
                  dimension,
                  boundary,
                  domainValues,
                ).length,
              ]
            : [];
        }),
      );
      if (planningError) errors.push(planningError);
    }
  }

  return {
    boundaries,
    ...(developmentEvidenceValues ? { developmentEvidenceValues } : {}),
    dimensions,
    errors,
    passes,
    ...(registryResult.registry ? { registry: registryResult.registry } : {}),
  };
}

export function getToolcraftPerformanceFixtureRegistryErrors(
  config: ToolcraftEnvelopePerformanceConfig,
  paths: readonly ToolcraftPerformancePath[],
): string[] {
  if (paths.length === 0) {
    return parseToolcraftPerformanceFixtureRegistry(config, false).errors;
  }
  const errors: string[] = [];
  const registryErrors = parseToolcraftPerformanceFixtureRegistry(
    config,
    false,
  ).errors;
  errors.push(...registryErrors);
  if (registryErrors.length > 0 || config.fixtureAdapters === undefined) return errors;

  for (const path of [...paths].sort((left, right) =>
    compareCodeUnits(left.id, right.id),
  )) {
    const analysis = analyzeToolcraftPerformanceFixturePath(config, path, false);
    errors.push(...analysis.errors.filter((error) => !registryErrors.includes(error)));
  }
  return [...new Set(errors)];
}
