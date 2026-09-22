import {
  effect,
  frame as renderFrame,
  sampler,
  type Effect,
  type Target,
} from "vgpu";

import {
  createToolcraftVgpuTargetPresentation,
  getToolcraftVgpuRuntimeAttributes,
  renderToolcraftVgpuExportFrame,
  ToolcraftVgpuExportError,
  type ToolcraftVgpuExportFailureCode,
  type ToolcraftVgpuRuntimeAttributes,
  type ToolcraftVgpuSceneFrame,
} from "@/toolcraft/integrations/vgpu";
import {
  type PhysicalFeedbackComputeResource,
  type PhysicalFeedbackComputeSimulation,
} from "./feedback-compute";
import renderShader from "./render.wgsl";

export type PhysicalFeedbackPresentationSnapshot = Readonly<{
  frameCount: number;
  presentationAllocationId: number;
  renderedTime: number;
}>;

type PreviewInput = Readonly<{
  canvas: HTMLCanvasElement;
  frame: ToolcraftVgpuSceneFrame;
  isCurrent: () => boolean;
  simulation: PhysicalFeedbackComputeSimulation;
}>;

export type PhysicalFeedbackPresentation = Readonly<{
  dispose(): Promise<void>;
  getAttributes(): ToolcraftVgpuRuntimeAttributes;
  getSnapshot(): PhysicalFeedbackPresentationSnapshot;
  presentExport(input: Readonly<{
    context: CanvasRenderingContext2D;
    simulation: PhysicalFeedbackComputeSimulation;
  }>): Promise<void>;
  presentPreview(input: PreviewInput): Promise<void>;
}>;

let exportFailureCode: ToolcraftVgpuExportFailureCode | null = null;
let lastPresentationAllocationId = 0;
const exportFailureListeners = new Set<() => void>();

function allocatePresentationId(): number {
  if (lastPresentationAllocationId >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError(
      "Physical feedback presentation allocation ID is exhausted.",
    );
  }
  lastPresentationAllocationId += 1;
  return lastPresentationAllocationId;
}

export function getPhysicalFeedbackExportFailureCode(): ToolcraftVgpuExportFailureCode | null {
  return exportFailureCode;
}

export function subscribePhysicalFeedbackExportFailure(
  listener: () => void,
): () => void {
  exportFailureListeners.add(listener);
  return () => exportFailureListeners.delete(listener);
}

function publishExportFailure(code: ToolcraftVgpuExportFailureCode | null): void {
  exportFailureCode = code;
  for (const listener of exportFailureListeners) listener();
}

function freezeSnapshot(
  frameCount: number,
  presentationAllocationId: number,
  renderedTime: number,
): PhysicalFeedbackPresentationSnapshot {
  return Object.freeze({
    frameCount,
    presentationAllocationId,
    renderedTime,
  });
}

export function createPhysicalFeedbackPresentation(
  resource: PhysicalFeedbackComputeResource,
  onDispose: (presentationCount: number) => void = () => undefined,
): PhysicalFeedbackPresentation {
  const provider = resource.getProvider();
  const targetPresentation = createToolcraftVgpuTargetPresentation({ provider });
  const presentationAllocationId = allocatePresentationId();
  let disposal: Promise<void> | null = null;
  let disposed = false;
  let draw: Effect | undefined;
  let frameCount = 0;
  let renderedTime = 0;

  const renderSimulation = async (
    simulation: PhysicalFeedbackComputeSimulation,
    target: Target,
  ): Promise<void> => {
    const ready = simulation.resource.getReadyRenderState();
    draw ??= effect(ready.gpu, renderShader, {
      label: "toolcraft-feedback-presentation",
      set: { field: ready.field, fieldSampler: sampler(ready.gpu) },
    });
    draw.set({ field: ready.field });
    const submitted = renderFrame(ready.gpu, (currentFrame) =>
      currentFrame.pass(target, draw!),
    );
    await submitted.done;
    await ready.gpu.settled();
  };

  const presentPreviewNow = async ({
    canvas,
    frame,
    isCurrent,
    simulation,
  }: PreviewInput): Promise<void> => {
    if (disposed || simulation.status !== "ready" || !isCurrent()) return;
    const committed = await targetPresentation.commit({
      canvas,
      frame,
      render: (_gpu, target) => renderSimulation(simulation, target),
      shouldCommit: isCurrent,
    });
    if (disposed || !isCurrent() || committed.status !== "committed") return;
    frameCount += 1;
    renderedTime = simulation.time;
  };

  return Object.freeze({
    dispose() {
      if (disposal) return disposal;
      disposed = true;
      disposal = targetPresentation.dispose().finally(() => onDispose(1));
      return disposal;
    },
    getAttributes() {
      return getToolcraftVgpuRuntimeAttributes(provider.getState(), {
        mode: "target-readback",
        snapshot: targetPresentation.getSnapshot(),
      });
    },
    getSnapshot() {
      return freezeSnapshot(
        frameCount,
        presentationAllocationId,
        renderedTime,
      );
    },
    async presentExport({ context, simulation }) {
      try {
        await renderToolcraftVgpuExportFrame({
          context,
          height: simulation.height,
          provider,
          render: (currentFrame, output) => {
            const ready = simulation.resource.getReadyRenderState();
            draw ??= effect(ready.gpu, renderShader, {
              label: "toolcraft-feedback-presentation",
              set: { field: ready.field, fieldSampler: sampler(ready.gpu) },
            });
            draw.set({ field: ready.field });
            currentFrame.pass(output, draw);
          },
          width: simulation.width,
        });
        publishExportFailure(null);
      } catch (error) {
        if (error instanceof ToolcraftVgpuExportError) {
          publishExportFailure(error.code);
        }
        throw error;
      }
    },
    presentPreview(input) {
      return presentPreviewNow(input);
    },
  });
}
