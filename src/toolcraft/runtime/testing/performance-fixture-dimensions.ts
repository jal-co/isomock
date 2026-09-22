import { hasOwnToolcraftFixtureKey } from "./performance-fixture-record";
import {
  getEnvelopeDimensions,
  isFiniteNumber,
  isNonNullObject,
  isSupportedMapping,
  isTrimmedNonEmptyString,
} from "./performance-workload-envelope-shared";
import type { ToolcraftEnvelopePerformanceConfig } from "./performance-types";
import type { ToolcraftWorkloadDimension } from "./performance-workload-types";

export type ToolcraftParsedPerformanceFixtureDimensions = {
  dimensions: readonly ToolcraftWorkloadDimension[];
  errors: readonly string[];
};

export function parseToolcraftPerformanceFixtureDimensions(
  config: ToolcraftEnvelopePerformanceConfig,
): ToolcraftParsedPerformanceFixtureDimensions {
  const envelope = getEnvelopeDimensions(config);
  if (!envelope.dimensions) {
    return { dimensions: [], errors: envelope.errors };
  }

  const dimensions: ToolcraftWorkloadDimension[] = [];
  const errors: string[] = [];
  for (const [index, rawDimension] of envelope.dimensions.entries()) {
    if (!isNonNullObject(rawDimension)) {
      errors.push(
        `workloadEnvelope.dimensions[${index}] must be a non-null object.`,
      );
      continue;
    }
    if (
      !hasOwnToolcraftFixtureKey(rawDimension, "id") ||
      !isTrimmedNonEmptyString(rawDimension.id)
    ) {
      errors.push(
        `workloadEnvelope.dimensions[${index}].id must be trimmed and non-empty.`,
      );
      continue;
    }

    const label = `Workload dimension ${JSON.stringify(rawDimension.id)}`;
    const errorCount = errors.length;
    if (
      !hasOwnToolcraftFixtureKey(rawDimension, "defaultValue") ||
      !isFiniteNumber(rawDimension.defaultValue)
    ) {
      errors.push(`${label} defaultValue must be a finite number.`);
    }

    const hasInteractiveMax =
      hasOwnToolcraftFixtureKey(rawDimension, "interactiveMax") &&
      rawDimension.interactiveMax !== undefined;
    const hasBatchMax =
      hasOwnToolcraftFixtureKey(rawDimension, "batchMax") &&
      rawDimension.batchMax !== undefined;
    if (!hasInteractiveMax && !hasBatchMax) {
      errors.push(`${label} must declare interactiveMax or batchMax.`);
    }
    if (
      hasInteractiveMax &&
      !isFiniteNumber(rawDimension.interactiveMax)
    ) {
      errors.push(`${label} interactiveMax must be a finite number.`);
    }
    if (hasBatchMax && !isFiniteNumber(rawDimension.batchMax)) {
      errors.push(`${label} batchMax must be a finite number.`);
    }
    if (
      !hasOwnToolcraftFixtureKey(rawDimension, "mapping") ||
      !isSupportedMapping(rawDimension.mapping)
    ) {
      errors.push(`${label} mapping must be supported.`);
    }

    if (errors.length === errorCount) {
      dimensions.push(rawDimension as unknown as ToolcraftWorkloadDimension);
    }
  }
  return { dimensions, errors };
}
