import { compareCodeUnits, isRecord } from "./performance-render-plan-utils";
import { areToolcraftFixtureValuesEqual } from "./performance-fixture-numeric";
import { parseToolcraftPerformanceFixtureDimensions } from "./performance-fixture-dimensions";
import {
  createToolcraftFixtureRecord,
  hasOwnToolcraftFixtureKey,
} from "./performance-fixture-record";
import type {
  ToolcraftEnvelopePerformanceConfig,
  ToolcraftPerformanceFixtureAdapter,
  ToolcraftPerformanceFixtureInverseCheckpoint,
} from "./performance-types";
import type { ToolcraftWorkloadDimension } from "./performance-workload-types";

export type ToolcraftParsedPerformanceFixtureRegistry = {
  dimensions: Readonly<Record<string, ToolcraftPerformanceFixtureAdapter>>;
  inverseCheckpoints: readonly ToolcraftPerformanceFixtureInverseCheckpoint[];
};

function adapterLabel(dimensionId: string): string {
  return `fixtureAdapters.dimensions[${JSON.stringify(dimensionId)}]`;
}

function primitiveKey(value: unknown): string {
  return `${typeof value}:${JSON.stringify(value)}`;
}

function hasAdjacentDuplicate<T>(
  values: readonly T[],
  compare: (left: T, right: T) => number,
  equal: (left: T, right: T) => boolean,
): boolean {
  const sorted = [...values].sort(compare);
  return sorted.some(
    (value, index) => index > 0 && equal(sorted[index - 1]!, value),
  );
}

function validateDiscreteDomain(
  adapter: Record<string, unknown>,
  dimension: ToolcraftWorkloadDimension,
): string[] {
  const adapterPath = adapterLabel(dimension.id);
  if (adapter.reachableValues !== undefined) {
    return [
      `${adapterPath}.reachableValues is disconnected metadata; use an exhaustive-discrete adapter with canonical entries and domain provenance.`,
    ];
  }
  if (
    adapter.kind !== undefined &&
    adapter.kind !== "continuous" &&
    adapter.kind !== "exhaustive-discrete"
  ) {
    return [
      `${adapterPath}.kind must be "continuous" or "exhaustive-discrete".`,
    ];
  }
  if (adapter.kind !== "exhaustive-discrete") {
    const errors: string[] = [];
    if (adapter.entries !== undefined) {
      errors.push(`${adapterPath}.entries is valid only for an exhaustive-discrete adapter.`);
    }
    if (adapter.domain !== undefined) {
      errors.push(`${adapterPath}.domain is valid only for an exhaustive-discrete adapter.`);
    }
    return errors;
  }
  const entriesLabel = `${adapterPath}.entries`;
  if (!Array.isArray(adapter.entries) || adapter.entries.length === 0) {
    return [`${entriesLabel} must be a non-empty exhaustive mapping.`];
  }
  const errors: string[] = [];
  const entries = adapter.entries.filter(isRecord);
  if (entries.length !== adapter.entries.length) {
    errors.push(`${entriesLabel} must contain only entry objects.`);
  }
  const numericValues = entries.flatMap((entry) =>
    typeof entry.value === "number" && Number.isFinite(entry.value)
      ? [entry.value]
      : [],
  );
  if (numericValues.length !== entries.length) {
    errors.push(`${entriesLabel} must contain only finite numeric values.`);
  }
  const appliedValues = entries.flatMap((entry) =>
    typeof entry.appliedValue === "string" ||
    typeof entry.appliedValue === "number" ||
    typeof entry.appliedValue === "boolean"
      ? [entry.appliedValue]
      : [],
  );
  if (appliedValues.length !== entries.length) {
    errors.push(`${entriesLabel} appliedValue must be a string, number, or boolean.`);
  }
  if (
    hasAdjacentDuplicate(
      numericValues,
      (left, right) => left - right,
      areToolcraftFixtureValuesEqual,
    )
  ) {
    errors.push(`${entriesLabel} must not contain duplicate numeric values.`);
  }
  if (
    hasAdjacentDuplicate(
      appliedValues.map(primitiveKey),
      compareCodeUnits,
      (left, right) => left === right,
    )
  ) {
    errors.push(`${entriesLabel} must not contain duplicate applied values.`);
  }
  const requiredValues = [
    ["defaultValue", dimension.defaultValue],
    ...(dimension.interactiveMax === undefined
      ? []
      : [["interactiveMax", dimension.interactiveMax] as const]),
    ...(dimension.batchMax === undefined
      ? []
      : [["batchMax", dimension.batchMax] as const]),
  ] as const;
  for (const [boundaryName, requiredValue] of requiredValues) {
    if (
      !numericValues.some((value) =>
        areToolcraftFixtureValuesEqual(value, requiredValue),
      )
    ) {
      errors.push(
        `${entriesLabel} must include dimension ${boundaryName} ${requiredValue}.`,
      );
    }
  }

  if (!isRecord(adapter.domain)) {
    errors.push(`${adapterPath}.domain must declare exhaustive provenance.`);
    return errors;
  }
  const domain = adapter.domain;
  const source = dimension.source;
  if (domain.kind !== source.kind && domain.kind !== "schema-options") {
    errors.push(
      `${adapterPath}.domain kind ${JSON.stringify(domain.kind)} must match workload dimension source kind ${JSON.stringify(source.kind)}.`,
    );
    return errors;
  }
  if (domain.kind === "schema-options") {
    if (source.kind !== "schema-target" || domain.target !== source.target) {
      errors.push(
        `${adapterPath}.domain target ${JSON.stringify(domain.target)} must match workload dimension source target ${JSON.stringify(source.kind === "schema-target" ? source.target : undefined)}.`,
      );
    }
    if (!Array.isArray(domain.optionValues)) {
      errors.push(`${adapterPath}.domain.optionValues must be an array.`);
      return errors;
    }
    const optionValues = domain.optionValues.filter(
      (value): value is string => typeof value === "string",
    );
    if (optionValues.length !== domain.optionValues.length) {
      errors.push(`${adapterPath}.domain.optionValues must contain only strings.`);
      return errors;
    }
    if (
      hasAdjacentDuplicate(
        optionValues,
        compareCodeUnits,
        (left, right) => left === right,
      )
    ) {
      errors.push(`${adapterPath}.domain.optionValues must not contain duplicates.`);
    }
    const appliedStrings = appliedValues.filter(
      (value): value is string => typeof value === "string",
    );
    if (appliedStrings.length !== appliedValues.length) {
      errors.push(`${entriesLabel} schema option appliedValue must be a string.`);
    }
    const optionSet = new Set(optionValues);
    const appliedSet = new Set(appliedStrings);
    for (const optionValue of optionSet) {
      if (!appliedSet.has(optionValue)) {
        errors.push(`${entriesLabel} is missing schema option ${JSON.stringify(optionValue)}.`);
      }
    }
    for (const appliedValue of appliedSet) {
      if (!optionSet.has(appliedValue)) {
        errors.push(`${entriesLabel} has extra applied value ${JSON.stringify(appliedValue)}.`);
      }
    }
    return errors;
  }

  if (typeof domain.attestation !== "string" || !domain.attestation.trim()) {
    errors.push(`${adapterPath}.domain.attestation must explain why the finite domain is exhaustive.`);
  }
  const sourceField = domain.kind === "runtime-state"
    ? "path"
    : domain.kind === "external-input"
      ? "id"
      : "inputs";
  const domainValue = domain.kind === "runtime-state"
    ? domain.path
    : domain.kind === "external-input"
      ? domain.id
      : domain.inputs;
  const sourceValue = domain.kind === "runtime-state" && source.kind === "runtime-state"
    ? source.path
    : domain.kind === "external-input" && source.kind === "external-input"
      ? source.id
      : domain.kind === "derived" && source.kind === "derived"
        ? source.inputs
        : undefined;
  if (JSON.stringify(domainValue) !== JSON.stringify(sourceValue)) {
    errors.push(
      `${adapterPath}.domain ${sourceField} ${JSON.stringify(domainValue)} must match workload dimension source ${sourceField} ${JSON.stringify(sourceValue)}.`,
    );
  }
  return errors;
}

export function parseToolcraftPerformanceFixtureRegistry(
  config: ToolcraftEnvelopePerformanceConfig,
  requireRegistry: boolean,
): {
  errors: string[];
  registry?: ToolcraftParsedPerformanceFixtureRegistry;
  workloadDimensions: readonly ToolcraftWorkloadDimension[];
} {
  const parsedDimensions = parseToolcraftPerformanceFixtureDimensions(config);
  const errors = [...parsedDimensions.errors];
  const raw = config.fixtureAdapters as unknown;
  if (raw === undefined) {
    if (requireRegistry) {
      errors.push("fixtureAdapters must be defined to compile a fixture plan.");
    }
    return { errors, workloadDimensions: parsedDimensions.dimensions };
  }
  if (!isRecord(raw)) {
    errors.push("fixtureAdapters must be a non-null object.");
    return { errors, workloadDimensions: parsedDimensions.dimensions };
  }

  if (!isRecord(raw.dimensions)) {
    errors.push("fixtureAdapters.dimensions must be a non-null object.");
    if (
      raw.inverseCheckpoints !== undefined &&
      !Array.isArray(raw.inverseCheckpoints)
    ) {
      errors.push("fixtureAdapters.inverseCheckpoints must be an array.");
    }
    return { errors, workloadDimensions: parsedDimensions.dimensions };
  }

  const dimensionsById = new Map(
    parsedDimensions.dimensions.map((dimension) => [dimension.id, dimension]),
  );
  const adapters = createToolcraftFixtureRecord<ToolcraftPerformanceFixtureAdapter>(
    [],
  );
  for (const registryKey of Object.keys(raw.dimensions).sort(compareCodeUnits)) {
    const adapter = raw.dimensions[registryKey];
    const label = adapterLabel(registryKey);
    if (!dimensionsById.has(registryKey)) {
      errors.push(`${label} does not match a workload dimension.`);
    }
    if (!isRecord(adapter)) {
      errors.push(`${label} must be a non-null object.`);
      continue;
    }
    const adapterErrors: string[] = [];
    if (adapter.dimensionId !== registryKey) {
      adapterErrors.push(
        `${label}.dimensionId must equal its registry key "${registryKey}".`,
      );
    }
    if (typeof adapter.apply !== "function") {
      adapterErrors.push(`${label}.apply must be a function.`);
    }
    if (typeof adapter.observe !== "function") {
      adapterErrors.push(`${label}.observe must be a function.`);
    }
    const dimension = dimensionsById.get(registryKey);
    if (dimension) {
      adapterErrors.push(...validateDiscreteDomain(adapter, dimension));
    }
    errors.push(...adapterErrors);
    if (
      adapterErrors.length === 0 &&
      adapter.dimensionId === registryKey &&
      typeof adapter.apply === "function" &&
      typeof adapter.observe === "function"
    ) {
      adapters[registryKey] = adapter as ToolcraftPerformanceFixtureAdapter;
    }
  }

  for (const dimension of [...parsedDimensions.dimensions].sort((left, right) =>
    compareCodeUnits(left.id, right.id),
  )) {
    if (!hasOwnToolcraftFixtureKey(raw.dimensions, dimension.id)) {
      errors.push(
        `${adapterLabel(dimension.id)} must apply and observe workload dimension "${dimension.id}".`,
      );
    }
  }

  const checkpoints: ToolcraftPerformanceFixtureInverseCheckpoint[] = [];
  if (
    raw.inverseCheckpoints !== undefined &&
    !Array.isArray(raw.inverseCheckpoints)
  ) {
    errors.push("fixtureAdapters.inverseCheckpoints must be an array.");
  } else {
    for (const [index, value] of (raw.inverseCheckpoints ?? []).entries()) {
      const label = `fixtureAdapters.inverseCheckpoints[${index}]`;
      if (!isRecord(value)) {
        errors.push(`${label} must be a non-null object.`);
        continue;
      }
      const validShape =
        typeof value.pathId === "string" &&
        typeof value.passId === "string" &&
        typeof value.normalizedPressure === "number" &&
        typeof value.measuredResult === "string" &&
        isRecord(value.values);
      if (!validShape) {
        errors.push(
          `${label} must declare pathId, passId, normalizedPressure, measuredResult, and a values object.`,
        );
        continue;
      }
      checkpoints.push(value as ToolcraftPerformanceFixtureInverseCheckpoint);
    }
  }

  return {
    errors,
    registry: { dimensions: adapters, inverseCheckpoints: checkpoints },
    workloadDimensions: parsedDimensions.dimensions,
  };
}
