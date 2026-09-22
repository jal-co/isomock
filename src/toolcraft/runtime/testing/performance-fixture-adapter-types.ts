export type ToolcraftPerformanceFixtureInverseCheckpoint = {
  measuredResult: string;
  normalizedPressure: number;
  passId: string;
  pathId: string;
  values: Readonly<Record<string, number>>;
};

type ToolcraftPerformanceFixtureAdapterBase<AppliedValue> = {
  apply(value: number): AppliedValue;
  dimensionId: string;
  observe(value: AppliedValue): number;
};

export type ToolcraftPerformanceContinuousFixtureAdapter<AppliedValue = unknown> =
  ToolcraftPerformanceFixtureAdapterBase<AppliedValue> & {
    domain?: never;
    entries?: never;
    kind?: "continuous";
  };

export type ToolcraftPerformanceDiscreteAppliedValue = boolean | number | string;

export type ToolcraftPerformanceDiscreteFixtureEntry<
  AppliedValue extends ToolcraftPerformanceDiscreteAppliedValue =
    ToolcraftPerformanceDiscreteAppliedValue,
> = {
  appliedValue: AppliedValue;
  value: number;
};

export type ToolcraftPerformanceDiscreteFixtureDomain =
  | {
      kind: "schema-options";
      optionValues: readonly string[];
      target: string;
    }
  | {
      attestation: string;
      kind: "runtime-state";
      path: string;
    }
  | {
      attestation: string;
      id: string;
      kind: "external-input";
    }
  | {
      attestation: string;
      inputs: readonly string[];
      kind: "derived";
    };

export type ToolcraftPerformanceDiscreteFixtureAdapter<
  AppliedValue extends ToolcraftPerformanceDiscreteAppliedValue =
    ToolcraftPerformanceDiscreteAppliedValue,
> = ToolcraftPerformanceFixtureAdapterBase<AppliedValue> & {
  domain: ToolcraftPerformanceDiscreteFixtureDomain;
  entries: readonly ToolcraftPerformanceDiscreteFixtureEntry<AppliedValue>[];
  kind: "exhaustive-discrete";
};

export type ToolcraftPerformanceFixtureAdapter<AppliedValue = unknown> =
  | ToolcraftPerformanceContinuousFixtureAdapter<AppliedValue>
  | ToolcraftPerformanceDiscreteFixtureAdapter<
      AppliedValue extends ToolcraftPerformanceDiscreteAppliedValue
        ? AppliedValue
        : ToolcraftPerformanceDiscreteAppliedValue
    >;

export type ToolcraftPerformanceFixtureAdapterRegistry = {
  dimensions: Readonly<Record<string, ToolcraftPerformanceFixtureAdapter>>;
  inverseCheckpoints?: readonly ToolcraftPerformanceFixtureInverseCheckpoint[];
};
