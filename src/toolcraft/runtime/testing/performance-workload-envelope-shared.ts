import type { ToolcraftEnvelopePerformanceConfig } from "./performance-types";
import type { ToolcraftWorkloadDimension } from "./performance-workload-types";

export type UnknownRecord = Record<string, unknown>;

const supportedMappings = new Set<ToolcraftWorkloadDimension["mapping"]>([
  "direct",
  "area",
  "quadratic",
  "custom",
]);

export function isNonNullObject(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTrimmedNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatUnknownValue(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "<unprintable>";
  }
}

export function isSupportedMapping(
  value: unknown,
): value is ToolcraftWorkloadDimension["mapping"] {
  return supportedMappings.has(value as ToolcraftWorkloadDimension["mapping"]);
}

export function getDimensionLabel(
  dimension: UnknownRecord,
  index: number,
): string {
  return typeof dimension.id === "string" && dimension.id.length > 0
    ? `Workload dimension ${JSON.stringify(dimension.id)}`
    : `Workload dimension at index ${index}`;
}

export function getNumericErrors(
  dimension: UnknownRecord,
  label: string,
): string[] {
  const errors: string[] = [];

  if (!isFiniteNumber(dimension.defaultValue)) {
    errors.push(`${label} defaultValue must be a finite number.`);
  }

  if (dimension.interactiveMax !== undefined) {
    if (!isFiniteNumber(dimension.interactiveMax)) {
      errors.push(`${label} interactiveMax must be a finite number.`);
    }
  }

  if (dimension.batchMax !== undefined) {
    if (!isFiniteNumber(dimension.batchMax)) {
      errors.push(`${label} batchMax must be a finite number.`);
    }
  }

  if (dimension.interactiveMax === undefined && dimension.batchMax === undefined) {
    errors.push(`${label} must declare interactiveMax or batchMax.`);
  }

  return errors;
}

export function getEnvelopeDimensions(
  config: ToolcraftEnvelopePerformanceConfig,
):
  | { dimensions: readonly unknown[]; errors: readonly [] }
  | { dimensions: null; errors: readonly [string] } {
  if (!isNonNullObject(config) || !isNonNullObject(config.workloadEnvelope)) {
    return {
      dimensions: null,
      errors: ["workloadEnvelope must be a non-null object."],
    };
  }

  if (!Array.isArray(config.workloadEnvelope.dimensions)) {
    return {
      dimensions: null,
      errors: ["workloadEnvelope.dimensions must be an array."],
    };
  }

  return { dimensions: config.workloadEnvelope.dimensions, errors: [] };
}
