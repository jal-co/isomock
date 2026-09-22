import type { ToolcraftRenderPass } from "./performance-types";
import type { ToolcraftWorkloadDimension } from "./performance-workload-types";
import {
  createToolcraftFixtureRecord,
  hasOwnToolcraftFixtureKey,
} from "./performance-fixture-record";
import { areToolcraftFixtureValuesEqual } from "./performance-fixture-numeric";
import {
  getToolcraftDiscreteCombinationPlanningError,
  searchToolcraftDiscreteCombinations,
} from "./performance-fixture-discrete-search";

export const toolcraftDevelopmentPressure = 0.8;
export const toolcraftFixturePressureTolerance = 1e-4;

export function getToolcraftDiscretePathDomainValues(
  dimension: ToolcraftWorkloadDimension,
  boundary: number,
  domainValues: readonly number[],
): number[] {
  const direction = Math.sign(boundary - dimension.defaultValue) || 1;
  return domainValues
    .filter((value) => {
      const progress = (value - dimension.defaultValue) * direction;
      const boundaryProgress = (boundary - dimension.defaultValue) * direction;
      return (
        (progress >= 0 || areToolcraftFixtureValuesEqual(progress, 0)) &&
        (progress <= boundaryProgress ||
          areToolcraftFixtureValuesEqual(progress, boundaryProgress))
      );
    })
    .sort(
      (left, right) =>
        (left - dimension.defaultValue) * direction -
        (right - dimension.defaultValue) * direction,
    );
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function getDimensionCost(
  dimension: ToolcraftWorkloadDimension,
  boundary: number,
  value: number,
): number {
  const range = boundary - dimension.defaultValue;
  const ratio =
    areToolcraftFixtureValuesEqual(boundary, dimension.defaultValue)
      ? 1
      : clampUnit((value - dimension.defaultValue) / range);

  return dimension.mapping === "area" || dimension.mapping === "quadratic"
    ? ratio ** 2
    : ratio;
}

export function getToolcraftGenericPassPressure(
  pass: ToolcraftRenderPass,
  dimensionsById: ReadonlyMap<string, ToolcraftWorkloadDimension>,
  boundaries: ReadonlyMap<string, number>,
  values: Readonly<Record<string, number>>,
): number {
  const cost = pass.cost;
  if (!cost || cost.relationship === "constant") return 0;
  if (cost.relationship === "benchmark") return Number.NaN;

  const dimensionCosts = cost.dimensions.flatMap((dimensionId) => {
    const dimension = dimensionsById.get(dimensionId);
    const boundary = boundaries.get(dimensionId);
    const value = values[dimensionId];
    return dimension &&
      boundary !== undefined &&
      hasOwnToolcraftFixtureKey(values, dimensionId)
      ? [getDimensionCost(dimension, boundary, value)]
      : [];
  });
  if (dimensionCosts.length === 0) return 0;

  if (cost.relationship === "product") {
    return dimensionCosts.reduce((product, value) => product * value, 1);
  }

  const average =
    dimensionCosts.reduce((sum, value) => sum + value, 0) /
    dimensionCosts.length;
  return cost.relationship === "quadratic" ? average ** 2 : average;
}

export function getToolcraftGenericPathPressure(
  passes: readonly ToolcraftRenderPass[],
  dimensionsById: ReadonlyMap<string, ToolcraftWorkloadDimension>,
  boundaries: ReadonlyMap<string, number>,
  values: Readonly<Record<string, number>>,
): number {
  const pressures = passes.map((pass) =>
    getToolcraftGenericPassPressure(pass, dimensionsById, boundaries, values),
  );
  return pressures.length === 0 ? 0 : Math.max(...pressures);
}

export function createToolcraftGenericDevelopmentCheckpoint(
  pathId: string,
  dimensions: readonly ToolcraftWorkloadDimension[],
  passes: readonly ToolcraftRenderPass[],
  boundaries: ReadonlyMap<string, number>,
  discreteValuesById: ReadonlyMap<string, readonly number[]> = new Map(),
):
  | { normalizedPressure: number; values: Readonly<Record<string, number>> }
  | { planningError: string }
  | { reason: string } {
  const sortedDimensions = [...dimensions].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  const dimensionsById = new Map(
    sortedDimensions.map((dimension) => [dimension.id, dimension] as const),
  );
  const createValues = (
    scalar: number,
    discreteValues: Readonly<Record<string, number>> = {},
  ): Readonly<Record<string, number>> =>
    createToolcraftFixtureRecord(
      sortedDimensions.map((dimension) => {
        if (hasOwnToolcraftFixtureKey(discreteValues, dimension.id)) {
          return [dimension.id, discreteValues[dimension.id]!];
        }
        const boundary = boundaries.get(dimension.id)!;
        return [
          dimension.id,
          dimension.defaultValue + (boundary - dimension.defaultValue) * scalar,
        ];
      }),
    );
  const getPressure = (values: Readonly<Record<string, number>>) =>
    getToolcraftGenericPathPressure(
      passes,
      dimensionsById,
      boundaries,
      values,
    );
  const discreteDimensions = sortedDimensions.flatMap((dimension) => {
    const domainValues = discreteValuesById.get(dimension.id);
    if (!domainValues) return [];
    const boundary = boundaries.get(dimension.id)!;
    const candidates = getToolcraftDiscretePathDomainValues(
      dimension,
      boundary,
      domainValues,
    );
    return [{ dimension, domainValues: candidates }];
  });
  const planningError = getToolcraftDiscreteCombinationPlanningError(
    pathId,
    discreteDimensions.map(({ domainValues }) => domainValues.length),
  );
  if (planningError) return { planningError };

  let checkpoint:
    | { normalizedPressure: number; values: Readonly<Record<string, number>> }
    | undefined;
  searchToolcraftDiscreteCombinations(
    discreteDimensions.map(({ domainValues }) => domainValues),
    (combination) => {
      const discreteValues = createToolcraftFixtureRecord(
        discreteDimensions.map(({ dimension }, index) => [
          dimension.id,
          combination[index]!,
        ]),
      );
      const lowerPressure = getPressure(createValues(0, discreteValues));
      const upperPressure = getPressure(createValues(1, discreteValues));
      if (
        !Number.isFinite(lowerPressure) ||
        !Number.isFinite(upperPressure) ||
        lowerPressure >
          toolcraftDevelopmentPressure + toolcraftFixturePressureTolerance ||
        upperPressure <
          toolcraftDevelopmentPressure - toolcraftFixturePressureTolerance
      ) {
        return false;
      }

      let lower = 0;
      let upper = 1;
      for (let iteration = 0; iteration < 60; iteration += 1) {
        const midpoint = (lower + upper) / 2;
        if (
          getPressure(createValues(midpoint, discreteValues)) <
          toolcraftDevelopmentPressure
        ) {
          lower = midpoint;
        } else {
          upper = midpoint;
        }
      }

      const values = createValues((lower + upper) / 2, discreteValues);
      const normalizedPressure = getPressure(values);
      if (
        Number.isFinite(normalizedPressure) &&
        Math.abs(normalizedPressure - toolcraftDevelopmentPressure) <=
          toolcraftFixturePressureTolerance
      ) {
        checkpoint = { normalizedPressure, values };
        return true;
      }
      return false;
    },
  );
  if (checkpoint) return checkpoint;

  return {
    reason: `Performance path "${pathId}" cannot reach exact normalized development pressure ${toolcraftDevelopmentPressure} within tolerance ${toolcraftFixturePressureTolerance} using its declared boundaries and exhaustive discrete domains.`,
  };
}
