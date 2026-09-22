import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import { areToolcraftFixtureValuesEqual } from "./performance-fixture-numeric";
import { getAllSchemaControls } from "./performance-schema-queries";
import { parseToolcraftPerformanceFixtureRegistry } from "./performance-fixture-registry-validation";
import type {
  ToolcraftEnvelopePerformanceConfig,
  ToolcraftPerformanceDiscreteAppliedValue,
  ToolcraftPerformanceDiscreteFixtureAdapter,
  ToolcraftPerformanceDiscreteFixtureEntry,
  ToolcraftPerformanceDiscreteFixtureDomain,
  ToolcraftPerformanceFixtureAdapter,
} from "./performance-types";

type DiscreteAdapterDefinition<
  AppliedValue extends ToolcraftPerformanceDiscreteAppliedValue,
> = {
  dimensionId: string;
  domain: ToolcraftPerformanceDiscreteFixtureDomain;
  entries: readonly ToolcraftPerformanceDiscreteFixtureEntry<AppliedValue>[];
};

function createDiscreteAdapter<
  AppliedValue extends ToolcraftPerformanceDiscreteAppliedValue,
>(
  definition: DiscreteAdapterDefinition<AppliedValue>,
): ToolcraftPerformanceDiscreteFixtureAdapter<AppliedValue> {
  const requireByValue = (value: number) => {
    const entry = definition.entries.find((candidate) =>
      areToolcraftFixtureValuesEqual(candidate.value, value),
    );
    if (!entry)
      throw new Error(
        `Discrete workload value ${value} is not in the exhaustive domain.`,
      );
    return entry;
  };
  const requireByAppliedValue = (appliedValue: AppliedValue) => {
    const entry = definition.entries.find((candidate) =>
      Object.is(candidate.appliedValue, appliedValue),
    );
    if (!entry) {
      throw new Error(
        `Applied value ${JSON.stringify(appliedValue)} is not in the exhaustive domain.`,
      );
    }
    return entry;
  };
  return {
    ...definition,
    apply: (value) => requireByValue(value).appliedValue,
    kind: "exhaustive-discrete",
    observe: (value) => requireByAppliedValue(value).value,
  };
}

export function defineToolcraftDiscreteFixtureAdapter<
  AppliedValue extends ToolcraftPerformanceDiscreteAppliedValue,
>(
  definition: DiscreteAdapterDefinition<AppliedValue>,
): ToolcraftPerformanceDiscreteFixtureAdapter<AppliedValue> {
  return createDiscreteAdapter(definition);
}

export function defineToolcraftSchemaDiscreteFixtureAdapter<
  AppliedValue extends string,
>(
  schema: ResolvedToolcraftAppSchema,
  definition: Omit<DiscreteAdapterDefinition<AppliedValue>, "domain"> & {
    target: string;
  },
): ToolcraftPerformanceDiscreteFixtureAdapter<AppliedValue> {
  const controls = getAllSchemaControls(schema).filter(
    (control) => control.target === definition.target,
  );
  const optionValues = controls.flatMap((control) =>
    control.type === "select" ||
    control.type === "segmented" ||
    control.type === "tabs"
      ? (control.options ?? []).map(({ value }) => value)
      : [],
  );
  return createDiscreteAdapter({
    dimensionId: definition.dimensionId,
    domain: {
      kind: "schema-options",
      optionValues,
      target: definition.target,
    },
    entries: definition.entries,
  });
}

export function isToolcraftDiscreteFixtureAdapter(
  adapter: ToolcraftPerformanceFixtureAdapter,
): adapter is ToolcraftPerformanceDiscreteFixtureAdapter {
  return adapter.kind === "exhaustive-discrete";
}

export function getToolcraftDiscreteFixtureValues(
  adapter: ToolcraftPerformanceFixtureAdapter,
): readonly number[] | undefined {
  return isToolcraftDiscreteFixtureAdapter(adapter)
    ? adapter.entries.map(({ value }) => value)
    : undefined;
}

export function getToolcraftSchemaDiscreteSnapshotErrors(
  schema: ResolvedToolcraftAppSchema,
  config: ToolcraftEnvelopePerformanceConfig,
): string[] {
  const controls = getAllSchemaControls(schema);
  const parsed = parseToolcraftPerformanceFixtureRegistry(config, false);
  if (!parsed.registry) return [];
  return parsed.workloadDimensions.flatMap((dimension) => {
    if (dimension.source.kind !== "schema-target") return [];
    const sourceTarget = dimension.source.target;
    const finiteControls = controls.filter(
      (control) =>
        control.target === sourceTarget &&
        (control.type === "select" ||
          control.type === "segmented" ||
          control.type === "tabs"),
    );
    if (finiteControls.length === 0) return [];
    const dimensionId = dimension.id;
    const adapter = parsed.registry!.dimensions[dimensionId];
    if (!adapter) return [];
    if (!isToolcraftDiscreteFixtureAdapter(adapter)) {
      return [
        `workload dimension "${dimensionId}" targets finite schema control "${sourceTarget}" and must use an exhaustive-discrete schema-options adapter.`,
      ];
    }
    if (adapter.domain.kind !== "schema-options") {
      return [
        `workload dimension "${dimensionId}" targets finite schema control "${sourceTarget}" and must use an exhaustive-discrete schema-options adapter.`,
      ];
    }
    const domain = adapter.domain;
    const actual = finiteControls.flatMap((control) =>
      control.type === "select" ||
      control.type === "segmented" ||
      control.type === "tabs"
        ? (control.options ?? []).map(({ value }) => value)
        : [],
    );
    return actual.length === domain.optionValues.length &&
      actual.every((value, index) => value === domain.optionValues[index])
      ? []
      : [
          `fixtureAdapters.dimensions[${JSON.stringify(dimensionId)}].domain schema option snapshot must match every current select/segmented/tabs option for target "${domain.target}" in schema order.`,
        ];
  });
}
