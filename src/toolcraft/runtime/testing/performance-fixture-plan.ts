import {
  createToolcraftGenericDevelopmentCheckpoint,
  toolcraftDevelopmentPressure,
} from "./performance-fixture-cost-model";
import { analyzeToolcraftPerformanceFixturePath } from "./performance-fixture-plan-analysis";
import { getToolcraftDiscreteFixtureValues } from "./performance-fixture-discrete-adapters";
import { createToolcraftFixtureRecord } from "./performance-fixture-record";
import type { ToolcraftPerformancePath } from "./performance-path-model";
import type {
  ToolcraftEnvelopePerformanceConfig,
  ToolcraftPerformanceCompiledDevelopment,
  ToolcraftPerformanceCompiledFixtureCheckpoint,
  ToolcraftPerformanceCompiledFixturePlan,
} from "./performance-types";

function createDevelopment(
  path: ToolcraftPerformancePath,
  analysis: ReturnType<typeof analyzeToolcraftPerformanceFixturePath>,
): ToolcraftPerformanceCompiledDevelopment {
  if (analysis.developmentEvidenceValues) {
    return {
      checkpoint: {
        kind: "development",
        normalizedPressure: toolcraftDevelopmentPressure,
        values: createToolcraftFixtureRecord(
          path.workloadDimensions.map((dimensionId) => [
            dimensionId,
            analysis.developmentEvidenceValues![dimensionId]!,
          ]),
        ),
      },
      status: "available",
    };
  }

  const result = createToolcraftGenericDevelopmentCheckpoint(
    path.id,
    analysis.dimensions,
    analysis.passes,
    analysis.boundaries,
    new Map(
      Object.entries(analysis.registry?.dimensions ?? {}).flatMap(
        ([dimensionId, adapter]) =>
          getToolcraftDiscreteFixtureValues(adapter)
            ? [[dimensionId, getToolcraftDiscreteFixtureValues(adapter)!] as const]
            : [],
      ),
    ),
  );
  if ("planningError" in result) throw new Error(result.planningError);
  if ("reason" in result) return { reason: result.reason, status: "unavailable" };
  return {
    checkpoint: {
      kind: "development",
      normalizedPressure: result.normalizedPressure,
      values: result.values,
    },
    status: "available",
  };
}

function createMaximum(
  path: ToolcraftPerformancePath,
  boundaries: ReadonlyMap<string, number>,
): ToolcraftPerformanceCompiledFixtureCheckpoint {
  return {
    kind: path.profile === "batch-responsive" ? "batch-max" : "interactive-max",
    normalizedPressure: 1,
    values: createToolcraftFixtureRecord(
      path.workloadDimensions.map((dimensionId) => [
        dimensionId,
        boundaries.get(dimensionId)!,
      ]),
    ),
  };
}

export function compileToolcraftPerformanceFixturePlan(
  config: ToolcraftEnvelopePerformanceConfig,
  path: ToolcraftPerformancePath,
): ToolcraftPerformanceCompiledFixturePlan {
  const analysis = analyzeToolcraftPerformanceFixturePath(config, path, true);
  if (analysis.errors.length > 0) {
    throw new Error(analysis.errors.join("\n"));
  }

  const dimensionIds = [...path.workloadDimensions];
  const development = createDevelopment(path, analysis);
  const maximum = createMaximum(path, analysis.boundaries);
  return path.profile === "batch-responsive"
    ? {
        development,
        dimensionIds,
        kind: "batch",
        maximum: { ...maximum, kind: "batch-max" },
        pathId: path.id,
      }
    : {
        development,
        dimensionIds,
        kind: "interactive",
        maximum: { ...maximum, kind: "interactive-max" },
        pathId: path.id,
      };
}
