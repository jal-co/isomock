import type { ToolcraftGpuPassExecution } from "./renderer-gpu-contract";

export type ToolcraftRenderPassCost = Readonly<{
  dimensions: readonly string[];
  frequency: "once" | "discrete" | "interaction" | "frame" | "batch";
  relationship: "constant" | "linear" | "quadratic" | "product" | "benchmark";
}>;

export type ToolcraftRenderPassLifecycle = Readonly<{
  cache: "none" | "memoized" | "retained-resource";
  resourceScope: "call" | "interaction" | "renderer" | "source";
}>;

export type ToolcraftRenderPassKind =
  | "decode"
  | "preprocess"
  | "pixel-transform"
  | "vector-build"
  | "text-layout"
  | "rasterize"
  | "composite"
  | "handles"
  | "export";

export type ToolcraftRenderPassRunLocation =
  | "main"
  | "worker"
  | "gpu"
  | "worker-or-gpu"
  | "export-only";

export type ToolcraftRenderPassOutput =
  | "source"
  | "intermediate"
  | "preview"
  | "overlay"
  | "export";

export type ToolcraftRenderPassQuality = "preview" | "full" | "retina" | "export";

export type ToolcraftRenderPassSceneBounds =
  /** Authored finite domain, never an incidental generation/processing buffer. */
  | Readonly<{ kind: "intrinsic"; reason: string }>
  | Readonly<{ kind: "content"; proofIds: readonly string[] }>;

export type ToolcraftRenderPass = Readonly<{
  cacheKey?: readonly string[];
  cost?: ToolcraftRenderPassCost;
  gpu?: ToolcraftGpuPassExecution;
  id: string;
  inputs: readonly string[];
  invalidatedBy: readonly string[];
  kind: ToolcraftRenderPassKind;
  lifecycle?: ToolcraftRenderPassLifecycle;
  output: ToolcraftRenderPassOutput;
  quality: ToolcraftRenderPassQuality;
  runsOn: ToolcraftRenderPassRunLocation;
  /** Required by editable-product acceptance for source, intermediate and preview output. */
  sceneBounds?: ToolcraftRenderPassSceneBounds;
}>;

export type ToolcraftPipelineInteraction =
  | "initial-render"
  | "animation-frame"
  | "control-change"
  | "control-drag"
  | "media-import"
  | "mask-drag"
  | "viewport-drag"
  | "viewport-zoom"
  | "timeline-playback"
  | "timeline-scrub"
  | "export";

export type ToolcraftInteractionInvalidation = Readonly<{
  interaction: ToolcraftPipelineInteraction;
  invalidates: readonly string[];
  mustNotInvalidate?: readonly string[];
  preparationInvalidates?: readonly string[];
  retainedAccesses?: readonly string[];
  targets: readonly string[];
}>;

export type ToolcraftRendererPipeline = Readonly<{
  interactionInvalidation: readonly ToolcraftInteractionInvalidation[];
  passes: readonly ToolcraftRenderPass[];
  runtimeId?: string;
}>;

export type ToolcraftRendererPipelinePassContract<
  Result,
  Resource = never,
  ResourceKey extends readonly unknown[] = [Resource] extends [never]
    ? never
    : readonly unknown[],
> = Readonly<{
  resource: Resource;
  resourceKey: ResourceKey;
  result: Result;
}>;

export type AnyPassContract = ToolcraftRendererPipelinePassContract<any, any, any>;
export type ToolcraftRendererPipelinePassContracts = Readonly<
  Record<string, AnyPassContract>
>;

export const registrationType = Symbol("ToolcraftRendererPipelineRegistration");
export const passHandleType = Symbol("ToolcraftRendererPipelinePassHandle");

export type DescriptorPassId<Passes extends readonly ToolcraftRenderPass[]> =
  Passes[number]["id"];

export type ExecutableCacheKey<Pass extends ToolcraftRenderPass> =
  Pass extends { lifecycle: { cache: "none" } }
    ? undefined
    : Pass extends { cacheKey: infer CacheKey extends readonly string[] }
      ? CacheKey
      : undefined;

export type ToolcraftCompiledRendererPipelinePass<
  Pass extends ToolcraftRenderPass = ToolcraftRenderPass,
> = Readonly<{
  id: Pass["id"];
  inputs: readonly string[];
  invalidatedBy: readonly string[];
  kind: ToolcraftRenderPassKind;
  output: ToolcraftRenderPassOutput;
  quality: ToolcraftRenderPassQuality;
  runsOn: ToolcraftRenderPassRunLocation;
}> &
  (Pass extends { cacheKey: infer CacheKey extends readonly string[] }
    ? Readonly<{ cacheKey: CacheKey }>
    : Readonly<{ cacheKey?: never }>) &
  (Pass extends { cost: ToolcraftRenderPassCost }
    ? Readonly<{ cost: ToolcraftRenderPassCost }>
    : Readonly<{ cost?: never }>) &
  (Pass extends { gpu: ToolcraftGpuPassExecution }
    ? Readonly<{ gpu: ToolcraftGpuPassExecution }>
    : Readonly<{ gpu?: never }>) &
  (Pass extends { lifecycle: ToolcraftRenderPassLifecycle }
    ? Readonly<{ lifecycle: ToolcraftRenderPassLifecycle }>
    : Readonly<{ lifecycle?: never }>) &
  (Pass extends { sceneBounds: ToolcraftRenderPassSceneBounds }
    ? Readonly<{ sceneBounds: ToolcraftRenderPassSceneBounds }>
    : Readonly<{ sceneBounds?: never }>);

export type NormalizedPasses<Passes extends readonly ToolcraftRenderPass[]> =
  Readonly<{
    [Index in keyof Passes]: Passes[Index] extends ToolcraftRenderPass
      ? ToolcraftCompiledRendererPipelinePass<Passes[Index]>
      : never;
  }>;

export type ExactContractCoverage<
  Contracts extends ToolcraftRendererPipelinePassContracts,
  Passes extends readonly ToolcraftRenderPass[],
> = Exclude<DescriptorPassId<Passes>, Extract<keyof Contracts, string>> extends never
  ? Exclude<Extract<keyof Contracts, string>, DescriptorPassId<Passes>> extends never
    ? unknown
    : Readonly<{
        __undeclaredPassContracts: Exclude<
          Extract<keyof Contracts, string>,
          DescriptorPassId<Passes>
        >;
      }>
  : Readonly<{
      __missingPassContracts: Exclude<
        DescriptorPassId<Passes>,
        Extract<keyof Contracts, string>
      >;
    }>;

type ContractHasResource<Contract extends AnyPassContract> = [
  Contract["resource"],
] extends [never]
  ? false
  : Contract["resourceKey"] extends readonly unknown[]
    ? true
    : false;

type DescriptorHasResource<Pass extends ToolcraftRenderPass> = Pass extends {
  lifecycle: {
    cache: "retained-resource";
    resourceScope: "renderer" | "source";
  };
}
  ? true
  : false;

export type ExecutableResourceCapability<
  Pass extends ToolcraftRenderPass,
  Contract extends AnyPassContract,
> = DescriptorHasResource<Pass> extends true
  ? ContractHasResource<Contract> extends true
    ? Readonly<{
        resource: Contract["resource"];
        resourceKey: Contract["resourceKey"];
      }>
    : never
  : never;

export type PassCapabilityError<
  Pass extends ToolcraftRenderPass,
  Contract extends AnyPassContract,
> =
  | (Pass extends { lifecycle: { cache: "none" }; cacheKey: readonly string[] }
      ? `pass ${Pass["id"]}: cache none cannot declare cacheKey`
      : never)
  | (Pass extends { lifecycle: { cache: "memoized" | "retained-resource" } }
      ? Pass extends { cacheKey: readonly [string, ...string[]] }
        ? never
        : `pass ${Pass["id"]}: cached pass requires non-empty cacheKey`
      : Pass extends { cacheKey: infer CacheKey extends readonly string[] }
        ? CacheKey extends readonly [string, ...string[]]
          ? never
          : `pass ${Pass["id"]}: cached pass requires non-empty cacheKey`
        : never)
  | (Pass extends {
        lifecycle: {
          cache: "retained-resource";
          resourceScope: infer Scope;
        };
      }
      ? Scope extends "renderer" | "source"
        ? ContractHasResource<Contract> extends true
          ? never
          : `pass ${Pass["id"]}: retained resource requires contract`
        : `pass ${Pass["id"]}: unsupported retained resource scope`
      : ContractHasResource<Contract> extends true
        ? `pass ${Pass["id"]}: resource contract requires retained resource descriptor`
        : never)
  | (Pass extends { runsOn: "gpu" | "worker-or-gpu" }
      ? Pass extends { gpu: ToolcraftGpuPassExecution }
        ? never
        : `pass ${Pass["id"]}: gpu execution semantics required`
      : Pass extends { gpu: ToolcraftGpuPassExecution }
        ? `pass ${Pass["id"]}: gpu execution semantics forbidden`
        : never);

type PipelineCapabilityErrors<
  Contracts extends ToolcraftRendererPipelinePassContracts,
  Passes extends readonly ToolcraftRenderPass[],
> = Passes[number] extends infer Pass
  ? Pass extends ToolcraftRenderPass
    ? Pass["id"] extends keyof Contracts
      ? PassCapabilityError<Pass, Contracts[Pass["id"]]>
      : never
    : never
  : never;

export type ValidPipelineCapabilities<
  Contracts extends ToolcraftRendererPipelinePassContracts,
  Passes extends readonly ToolcraftRenderPass[],
> = [PipelineCapabilityErrors<Contracts, Passes>] extends [never]
  ? unknown
  : Readonly<{
      __invalidPipelineCapabilities: PipelineCapabilityErrors<Contracts, Passes>;
    }>;

export type ToolcraftRendererPipelinePassHandle<
  PassId extends string = string,
  Contract extends AnyPassContract = AnyPassContract,
  CacheKey extends readonly string[] | undefined = readonly string[] | undefined,
  ResourceCapability = never,
> = Readonly<{
  readonly [passHandleType]: Readonly<{
    cacheKey: CacheKey;
    contract: Contract;
    resource: ResourceCapability;
  }>;
  id: PassId;
}>;

export type AnyToolcraftRendererPipelinePassHandle =
  ToolcraftRendererPipelinePassHandle<string, any, any, any>;

type ContractForPass<
  Contracts extends ToolcraftRendererPipelinePassContracts,
  PassId extends keyof Contracts,
> = Contracts[PassId];

type PassForId<
  Passes extends readonly ToolcraftRenderPass[],
  PassId extends DescriptorPassId<Passes>,
> = Extract<Passes[number], { id: PassId }>;

export type ToolcraftRendererPipelineRegistration<
  Contracts extends ToolcraftRendererPipelinePassContracts =
    ToolcraftRendererPipelinePassContracts,
  Passes extends readonly ToolcraftRenderPass[] = readonly ToolcraftRenderPass[],
> = Readonly<{
  readonly [registrationType]: (contracts: Contracts) => Contracts;
  getPass: <PassId extends DescriptorPassId<Passes>>(
    passId: PassId,
  ) => ToolcraftRendererPipelinePassHandle<
    PassId,
    ContractForPass<Contracts, PassId & keyof Contracts>,
    ExecutableCacheKey<PassForId<Passes, PassId>>,
    ExecutableResourceCapability<
      PassForId<Passes, PassId>,
      ContractForPass<Contracts, PassId & keyof Contracts>
    >
  >;
  interactionInvalidation: readonly ToolcraftInteractionInvalidation[];
  passes: NormalizedPasses<Passes>;
  runtimeId: string;
}>;

export type AnyToolcraftRendererPipelineRegistration =
  ToolcraftRendererPipelineRegistration<any, any>;

export type ToolcraftRendererPipelinePassResult<
  Handle extends AnyToolcraftRendererPipelinePassHandle,
> = Handle extends ToolcraftRendererPipelinePassHandle<string, infer Contract, any, any>
  ? Contract["result"]
  : never;

export type ToolcraftRendererPipelinePassResource<
  Handle extends AnyToolcraftRendererPipelinePassHandle,
> = Handle extends ToolcraftRendererPipelinePassHandle<string, any, any, infer Capability>
  ? Capability extends { resource: infer Resource }
    ? Resource
    : never
  : never;

export type ToolcraftRendererPipelinePassResourceKey<
  Handle extends AnyToolcraftRendererPipelinePassHandle,
> = Handle extends ToolcraftRendererPipelinePassHandle<string, any, any, infer Capability>
  ? Capability extends { resourceKey: infer ResourceKey }
    ? ResourceKey
    : never
  : never;

type HandleCacheKey<Handle extends AnyToolcraftRendererPipelinePassHandle> =
  Handle extends ToolcraftRendererPipelinePassHandle<string, any, infer CacheKey, any>
    ? CacheKey
    : never;

export type ToolcraftRendererPipelinePassCacheInput<
  Handle extends AnyToolcraftRendererPipelinePassHandle,
> = HandleCacheKey<Handle> extends readonly string[]
  ? Readonly<{
      [Key in HandleCacheKey<Handle>[number]]: unknown;
    }>
  : undefined;
