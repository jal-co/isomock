import {
  assertRendererPipelineDescriptorShape,
  normalizeToolcraftInteractionInvalidation,
  normalizeToolcraftRenderPass,
} from "./renderer-pipeline-normalization";
import {
  passHandleType,
  registrationType,
  type AnyToolcraftRendererPipelinePassHandle,
  type AnyToolcraftRendererPipelineRegistration,
  type ExactContractCoverage,
  type NormalizedPasses,
  type ToolcraftRenderPass,
  type ToolcraftRendererPipeline,
  type ToolcraftRendererPipelinePassContracts,
  type ToolcraftRendererPipelineRegistration,
  type ValidPipelineCapabilities,
} from "./renderer-pipeline-types";

export type {
  AnyToolcraftRendererPipelineRegistration,
  ToolcraftCompiledRendererPipelinePass,
  ToolcraftInteractionInvalidation,
  ToolcraftPipelineInteraction,
  ToolcraftRendererPipeline,
  ToolcraftRendererPipelinePassCacheInput,
  ToolcraftRendererPipelinePassContract,
  ToolcraftRendererPipelinePassHandle,
  ToolcraftRendererPipelinePassResource,
  ToolcraftRendererPipelinePassResourceKey,
  ToolcraftRendererPipelinePassResult,
  ToolcraftRendererPipelineRegistration,
  ToolcraftRenderPass,
  ToolcraftRenderPassCost,
  ToolcraftRenderPassKind,
  ToolcraftRenderPassLifecycle,
  ToolcraftRenderPassOutput,
  ToolcraftRenderPassQuality,
  ToolcraftRenderPassRunLocation,
  ToolcraftRenderPassSceneBounds,
} from "./renderer-pipeline-types";

type RegistrationInternals = {
  definitionsByHandle: Map<AnyToolcraftRendererPipelinePassHandle, ToolcraftRenderPass>;
  handlesById: Map<string, AnyToolcraftRendererPipelinePassHandle>;
};

const registrationInternals = new WeakMap<object, RegistrationInternals>();

export function registerToolcraftRendererPipeline<
  Contracts extends ToolcraftRendererPipelinePassContracts,
>() {
  return <const Descriptor extends ToolcraftRendererPipeline>(
    descriptor: Descriptor &
      ExactContractCoverage<Contracts, Descriptor["passes"]> &
      ValidPipelineCapabilities<Contracts, Descriptor["passes"]>,
  ): ToolcraftRendererPipelineRegistration<Contracts, Descriptor["passes"]> => {
    assertRendererPipelineDescriptorShape(descriptor);
    if (
      typeof descriptor.runtimeId !== "string" ||
      !descriptor.runtimeId ||
      descriptor.runtimeId.trim() !== descriptor.runtimeId
    ) {
      throw new Error(
        "Executable renderer pipeline registration requires a non-empty trimmed runtimeId.",
      );
    }
    const runtimeId = descriptor.runtimeId;
    const passIds = new Set<string>();
    const handlesById = new Map<string, AnyToolcraftRendererPipelinePassHandle>();
    const definitionsByHandle = new Map<
      AnyToolcraftRendererPipelinePassHandle,
      ToolcraftRenderPass
    >();
    const normalizedPasses = descriptor.passes.map((sourcePass, index) => {
      const pass = normalizeToolcraftRenderPass(sourcePass, index);
      if (passIds.has(pass.id)) {
        throw new Error(`Renderer pipeline pass id "${pass.id}" must be unique.`);
      }
      passIds.add(pass.id);
      const handle: AnyToolcraftRendererPipelinePassHandle = Object.freeze({
        [passHandleType]: Object.freeze({
          cacheKey: undefined,
          contract: undefined,
          resource: undefined,
        }),
        id: pass.id,
      });
      handlesById.set(pass.id, handle);
      definitionsByHandle.set(handle, pass);
      return pass;
    });
    const passes = Object.freeze(normalizedPasses) as NormalizedPasses<
      Descriptor["passes"]
    >;
    const passesById = new Map(
      normalizedPasses.map((pass) => [pass.id, pass] as const),
    );
    const interactionInvalidation = descriptor.interactionInvalidation.map(
      (invalidation, index) =>
        normalizeToolcraftInteractionInvalidation(invalidation, index, passesById),
    );
    const getPass = ((passId: string) => {
      const handle = handlesById.get(passId);
      if (!handle) {
        throw new Error(
          `Renderer pipeline registration "${runtimeId}" has no pass "${passId}".`,
        );
      }
      return handle;
    }) as ToolcraftRendererPipelineRegistration<
      Contracts,
      Descriptor["passes"]
    >["getPass"];
    const registration: ToolcraftRendererPipelineRegistration<
      Contracts,
      Descriptor["passes"]
    > = Object.freeze({
      [registrationType]: (contracts: Contracts) => contracts,
      getPass,
      interactionInvalidation: Object.freeze(interactionInvalidation),
      passes,
      runtimeId,
    });
    registrationInternals.set(registration, { definitionsByHandle, handlesById });
    return registration;
  };
}

export function isToolcraftRendererPipelineRegistration(
  value: unknown,
): value is AnyToolcraftRendererPipelineRegistration {
  return typeof value === "object" && value !== null && registrationInternals.has(value);
}

export function getToolcraftRendererPipelinePassDefinition<
  Registration extends AnyToolcraftRendererPipelineRegistration,
  Handle extends AnyToolcraftRendererPipelinePassHandle,
>(registration: Registration, handle: Handle): ToolcraftRenderPass {
  const definition = registrationInternals
    .get(registration)
    ?.definitionsByHandle.get(handle);
  if (!definition) {
    throw new Error(
      `Renderer pipeline pass "${handle.id}" does not belong to registration "${registration.runtimeId}".`,
    );
  }
  return definition;
}
