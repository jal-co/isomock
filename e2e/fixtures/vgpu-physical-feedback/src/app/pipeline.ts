import type {
  ToolcraftRendererPipelineClient,
  ToolcraftRendererPipelinePassExecutionContext,
} from "@/toolcraft/runtime";
import type {
  ToolcraftVgpuRuntimeAttributes,
  ToolcraftVgpuSceneFrame,
} from "@/toolcraft/integrations/vgpu";
import {
  createPhysicalFeedbackComputeResource,
  type PhysicalFeedbackComputeResource,
  type PhysicalFeedbackComputeSimulation,
  type PhysicalFeedbackSimulationInput,
} from "./feedback-compute";
import {
  createPhysicalFeedbackPresentation,
  type PhysicalFeedbackPresentation,
  type PhysicalFeedbackPresentationSnapshot,
} from "./feedback-presentation";
import {
  createPhysicalFeedbackOperationQueue,
  getPhysicalFeedbackOperationQueue,
  type PhysicalFeedbackOperationQueue,
} from "./feedback-operations";
import {
  exportPresentPass,
  exportSimulatePass,
  previewPresentPass,
  previewSimulatePass,
  resourcesPass,
} from "./feedback-pipeline-contract";

export type { PhysicalFeedbackSimulationInput };

export type PhysicalFeedbackSnapshot = PhysicalFeedbackPresentationSnapshot &
  Readonly<{ resourceAllocationId: number }>;

export type PhysicalFeedbackSimulation = PhysicalFeedbackSimulationInput &
  Readonly<{
    simulationVersion: number;
    status: PhysicalFeedbackComputeSimulation["status"];
  }>;

export type PhysicalFeedbackOperationResult = PhysicalFeedbackSimulation &
  Readonly<{
    attributes: ToolcraftVgpuRuntimeAttributes;
    snapshot: PhysicalFeedbackSnapshot;
  }>;

export type PhysicalFeedbackResource = Readonly<{
  dispose(): Promise<void>;
  getAttributes(): ToolcraftVgpuRuntimeAttributes;
  getSnapshot(): PhysicalFeedbackSnapshot;
  presentExport(input: Readonly<{
    context: CanvasRenderingContext2D;
    simulation: PhysicalFeedbackSimulation;
  }>): Promise<void>;
  presentPreview(input: Readonly<{
    canvas: HTMLCanvasElement;
    frame: ToolcraftVgpuSceneFrame;
    isCurrent: () => boolean;
    simulation: PhysicalFeedbackSimulation;
  }>): Promise<void>;
  simulate(
    input: PhysicalFeedbackSimulationInput,
  ): Promise<PhysicalFeedbackSimulation>;
}>;

export type PhysicalFeedbackPassInput = Readonly<{
  createResource: (
    context: ToolcraftRendererPipelinePassExecutionContext<
      typeof resourcesPass
    >,
    operationQueue: PhysicalFeedbackOperationQueue,
  ) => PromiseLike<PhysicalFeedbackResource> | PhysicalFeedbackResource;
  destination: (
    resource: PhysicalFeedbackResource,
    simulation: PhysicalFeedbackSimulation,
  ) => PromiseLike<void> | void;
  rendererPipeline: ToolcraftRendererPipelineClient;
  simulationInput: PhysicalFeedbackSimulationInput;
  surface: "export" | "preview";
}>;

export async function executePhysicalFeedbackPasses({
  createResource,
  destination,
  rendererPipeline,
  simulationInput,
  surface,
}: PhysicalFeedbackPassInput): Promise<PhysicalFeedbackOperationResult> {
  const operationQueue = getPhysicalFeedbackOperationQueue(rendererPipeline);
  const presentPass = surface === "export" ? exportPresentPass : previewPresentPass;
  const simulatePass = surface === "export" ? exportSimulatePass : previewSimulatePass;
  let outcome: PhysicalFeedbackOperationResult | undefined;
  await rendererPipeline.runPass(presentPass, undefined, async () => {
    outcome = await operationQueue.run(async () => {
      const resource = await rendererPipeline.runPass(
        resourcesPass,
        { "renderer.resources": "physical-feedback" },
        (context) => createResource(context, operationQueue),
      );
      const simulation = await rendererPipeline.runPass(
        simulatePass,
        undefined,
        () => resource.simulate(simulationInput),
      );
      await destination(resource, simulation);
      return Object.freeze({
        ...simulation,
        attributes: resource.getAttributes(),
        snapshot: resource.getSnapshot(),
      });
    });
  });
  if (!outcome) {
    throw new Error("Physical feedback operation completed without evidence.");
  }
  return outcome;
}

let lastResourceAllocationId = 0;

function allocateResourceId(): number {
  if (lastResourceAllocationId >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError(
      "Physical feedback resource allocation ID is exhausted.",
    );
  }
  lastResourceAllocationId += 1;
  return lastResourceAllocationId;
}

function assemblePhysicalFeedbackResource(
  compute: PhysicalFeedbackComputeResource,
  operationQueue: PhysicalFeedbackOperationQueue,
  onDispose: (presentationCount: number, gpuCount: number) => void,
): PhysicalFeedbackResource {
  const resourceAllocationId = allocateResourceId();
  let currentSimulation: PhysicalFeedbackComputeSimulation | undefined;
  let disposal: Promise<void> | null = null;
  const gpuCount = compute.getProvider().getState().status === "ready" ? 1 : 0;
  let ownedCompute: PhysicalFeedbackComputeResource | undefined = compute;
  let ownedPresentation: PhysicalFeedbackPresentation | undefined;
  let simulationVersion = 0;
  const getPresentation = (): PhysicalFeedbackPresentation => {
    if (!ownedCompute) throw new Error("The feedback resource has been disposed.");
    ownedPresentation ??= createPhysicalFeedbackPresentation(ownedCompute);
    return ownedPresentation;
  };
  const getComputed = (
    simulation: PhysicalFeedbackSimulation,
  ): PhysicalFeedbackComputeSimulation => {
    if (
      !currentSimulation ||
      simulation.simulationVersion !== simulationVersion
    ) {
      throw new Error("The feedback simulation version is no longer current.");
    }
    return currentSimulation;
  };

  return Object.freeze({
    dispose() {
      if (disposal) return disposal;
      const currentCompute = ownedCompute;
      const currentPresentation = ownedPresentation;
      const presentationCount = currentPresentation ? 1 : 0;
      currentSimulation = undefined;
      ownedCompute = undefined;
      ownedPresentation = undefined;
      disposal = (async () => {
        await operationQueue.drain();
        const errors: unknown[] = [];
        for (const disposeOwned of [
          () => currentPresentation?.dispose(),
          () => currentCompute?.dispose(),
        ]) {
          try {
            await disposeOwned();
          } catch (error) {
            errors.push(error);
          }
        }
        if (errors.length) {
          throw new AggregateError(errors, "Physical feedback disposal failed.");
        }
      })().finally(() => onDispose(presentationCount, gpuCount));
      return disposal;
    },
    getAttributes: () => getPresentation().getAttributes(),
    getSnapshot: () =>
      Object.freeze({
        ...getPresentation().getSnapshot(),
        resourceAllocationId,
      }),
    presentExport({ context, simulation }) {
      return getPresentation().presentExport({
        context,
        simulation: getComputed(simulation),
      });
    },
    presentPreview({ canvas, frame, isCurrent, simulation }) {
      return getPresentation().presentPreview({
        canvas,
        frame,
        isCurrent,
        simulation: getComputed(simulation),
      });
    },
    async simulate(input) {
      if (!ownedCompute) throw new Error("The feedback resource has been disposed.");
      currentSimulation = await ownedCompute.simulate(input);
      simulationVersion += 1;
      return Object.freeze({
        ...input,
        simulationVersion,
        status: currentSimulation.status,
      });
    },
  });
}

export async function createPhysicalFeedbackResource(
  operationQueue: PhysicalFeedbackOperationQueue =
    createPhysicalFeedbackOperationQueue(),
  onDispose: (presentationCount: number, gpuCount: number) => void = () =>
    undefined,
): Promise<PhysicalFeedbackResource> {
  const compute = await createPhysicalFeedbackComputeResource();
  return assemblePhysicalFeedbackResource(compute, operationQueue, onDispose);
}
