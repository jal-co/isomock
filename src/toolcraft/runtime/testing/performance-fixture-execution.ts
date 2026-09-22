import { compileToolcraftPerformanceFixturePlan } from "./performance-fixture-plan";
import { areToolcraftFixtureValuesEqual } from "./performance-fixture-numeric";
import {
  createToolcraftFixtureRecord,
  hasOwnToolcraftFixtureKey,
} from "./performance-fixture-record";
import { deriveToolcraftPerformancePathsFromParsedPipeline } from "./performance-paths";
import { parseToolcraftRendererPipeline } from "./performance-renderer-pipeline-parser";
import type {
  ToolcraftEnvelopePerformanceConfig,
  ToolcraftPerformanceCompiledFixtureCheckpoint,
  ToolcraftPerformanceCompiledFixturePlan,
  ToolcraftPerformanceExecutedFixtureCheckpoint,
} from "./performance-types";

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function getCheckpoint(
  plan: ToolcraftPerformanceCompiledFixturePlan,
  selector: "development" | "maximum",
): ToolcraftPerformanceCompiledFixtureCheckpoint {
  if (selector === "maximum") return plan.maximum;
  if (plan.development.status === "unavailable") {
    throw new Error(plan.development.reason);
  }
  return plan.development.checkpoint;
}

export function executeToolcraftPerformanceFixtureCheckpoint(
  config: ToolcraftEnvelopePerformanceConfig,
  plan: ToolcraftPerformanceCompiledFixturePlan,
  selector: "development" | "maximum",
): ToolcraftPerformanceExecutedFixtureCheckpoint {
  const paths = deriveToolcraftPerformancePathsFromParsedPipeline(
    parseToolcraftRendererPipeline(config.rendererPipeline as unknown),
  );
  const path = paths.find((candidate) => candidate.id === plan.pathId);
  if (!path) {
    throw new Error(
      "The compiled fixture plan does not match the current config and path.",
    );
  }
  const canonicalPlan = compileToolcraftPerformanceFixturePlan(config, path);
  if (stableSerialize(canonicalPlan) !== stableSerialize(plan)) {
    throw new Error(
      "The compiled fixture plan does not match the current config and path.",
    );
  }

  const checkpoint = getCheckpoint(canonicalPlan, selector);
  const checkpointKeys = Object.keys(checkpoint.values).sort();
  const dimensionIds = [...canonicalPlan.dimensionIds].sort();
  if (
    checkpointKeys.length !== dimensionIds.length ||
    checkpointKeys.some((key, index) => key !== dimensionIds[index])
  ) {
    throw new Error(
      `Compiled fixture checkpoint for path "${plan.pathId}" must contain every path dimension exactly once.`,
    );
  }

  const adapters = config.fixtureAdapters!.dimensions;
  const applied = createToolcraftFixtureRecord<unknown>([]);
  const observed = createToolcraftFixtureRecord<number>([]);
  for (const dimensionId of dimensionIds) {
    const exactValue = checkpoint.values[dimensionId]!;
    if (!hasOwnToolcraftFixtureKey(adapters, dimensionId)) {
      throw new Error(
        `Fixture adapter registry does not own workload dimension "${dimensionId}".`,
      );
    }
    const adapter = adapters[dimensionId]!;
    let appliedValue: unknown;
    let observedValue: number;
    try {
      appliedValue = adapter.apply(exactValue);
      observedValue = (adapter.observe as (value: unknown) => number)(appliedValue);
    } catch (error) {
      throw new Error(
        `Fixture adapter "${dimensionId}" failed while executing exact compiled value ${exactValue}: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
    if (!Number.isFinite(observedValue)) {
      throw new Error(
        `Fixture adapter "${dimensionId}" observed a non-finite result after applying exact compiled value ${exactValue}.`,
      );
    }
    if (!areToolcraftFixtureValuesEqual(observedValue, exactValue)) {
      throw new Error(
        `Fixture adapter "${dimensionId}" observed ${observedValue} after applying exact compiled value ${exactValue}.`,
      );
    }
    applied[dimensionId] = appliedValue;
    observed[dimensionId] = observedValue;
  }

  return { ...checkpoint, applied, observed };
}
