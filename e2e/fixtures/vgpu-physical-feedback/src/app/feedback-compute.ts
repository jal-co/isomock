import type { Gpu } from "vgpu";
import type { Texture } from "vgpu/core";

import {
  createToolcraftVgpuProvider,
  type ToolcraftVgpuProvider,
} from "@/toolcraft/integrations/vgpu";
import {
  createPhysicalFeedbackAssetOwner,
  createPhysicalFeedbackTexturePair,
  createStorageFeedbackCompute,
  type StorageFeedbackCompute,
} from "./feedback-storage";
import { getPhysicalFeedbackReplaySteps } from "./feedback-values";
import feedbackShader from "./feedback.wgsl";
import {
  assertPhysicalFeedbackBackingSize,
  PHYSICAL_FEEDBACK_MAX_BACKING_PIXELS,
} from "./feedback-limits";

export {
  createPhysicalFeedbackAssetOwner,
  createPhysicalFeedbackTexturePair,
} from "./feedback-storage";
export {
  assertPhysicalFeedbackBackingSize,
  assertPhysicalFeedbackInteractiveBackingSize,
  PHYSICAL_FEEDBACK_MAX_BACKING_PIXELS,
} from "./feedback-limits";

type FeedbackPair = Readonly<{ read: Texture; write: Texture }>;

export type PhysicalFeedbackSimulationInput = Readonly<{
  height: number;
  impulse: number;
  time: number;
  width: number;
}>;

export type PhysicalFeedbackComputeSimulation = PhysicalFeedbackSimulationInput &
  Readonly<{
    resource: PhysicalFeedbackComputeResource;
    status: "ready" | "unavailable";
  }>;

export type PhysicalFeedbackComputeResource = Readonly<{
  dispose(): Promise<void>;
  getProvider(): ToolcraftVgpuProvider;
  getReadyRenderState(): Readonly<{
    field: Texture;
    gpu: Gpu;
  }>;
  simulate(
    input: PhysicalFeedbackSimulationInput,
  ): Promise<PhysicalFeedbackComputeSimulation>;
}>;

function swap(pair: FeedbackPair): FeedbackPair {
  return Object.freeze({ read: pair.write, write: pair.read });
}

export async function createPhysicalFeedbackComputeResource(
  onDispose: (gpuCount: number) => void = () => undefined,
): Promise<PhysicalFeedbackComputeResource> {
  let provider: ToolcraftVgpuProvider | undefined = createToolcraftVgpuProvider();
  let pair: FeedbackPair | undefined;
  let compute: StorageFeedbackCompute | undefined;
  let disposal: Promise<void> | null = null;
  let disposed = false;
  let state: Awaited<ReturnType<ToolcraftVgpuProvider["whenInitialized"]>>;
  try {
    state = await provider.whenInitialized();
  } catch (error) {
    const ownedProvider = provider;
    provider = undefined;
    try {
      ownedProvider.dispose();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Physical feedback provider initialization failed.",
      );
    }
    throw error;
  }

  const replacePair = async (
    gpu: Gpu,
    width: number,
    height: number,
  ): Promise<void> => {
    if (pair?.read.size[0] === width && pair.read.size[1] === height) return;
    const next = createPhysicalFeedbackTexturePair(
      gpu.device,
      width,
      height,
      "toolcraft-feedback",
    );
    const previous = pair;
    pair = next;
    if (previous) {
      await createPhysicalFeedbackAssetOwner([
        () => previous.read.destroy(),
        () => previous.write.destroy(),
      ]).dispose();
    }
  };

  if (state.status === "ready") {
    try {
      await replacePair(state.gpu, 1, 1);
      compute = createStorageFeedbackCompute(state.gpu, feedbackShader);
    } catch (error) {
      const ownedCompute = compute;
      const ownedPair = pair;
      const ownedProvider = provider;
      compute = undefined;
      pair = undefined;
      provider = undefined;
      const owner = createPhysicalFeedbackAssetOwner([
        () => ownedCompute?.dispose(),
        () => ownedPair?.read.destroy(),
        () => ownedPair?.write.destroy(),
        () => ownedProvider?.dispose(),
      ]);
      try {
        await owner.dispose();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Physical feedback resource construction failed.",
        );
      }
      throw error;
    }
  }

  const resource: PhysicalFeedbackComputeResource = Object.freeze({
    dispose() {
      if (disposal) return disposal;
      disposed = true;
      const ownedCompute = compute;
      const ownedPair = pair;
      const ownedProvider = provider;
      compute = undefined;
      pair = undefined;
      provider = undefined;
      const owner = createPhysicalFeedbackAssetOwner([
        () => ownedCompute?.dispose(),
        () => ownedPair?.read.destroy(),
        () => ownedPair?.write.destroy(),
        () => ownedProvider?.dispose(),
      ]);
      disposal = owner.dispose().finally(() => {
        onDispose(state.status === "ready" ? 1 : 0);
      });
      return disposal;
    },
    getProvider() {
      if (!provider) {
        throw new Error("The physical feedback provider has been disposed.");
      }
      return provider;
    },
    getReadyRenderState() {
      const current = provider?.getState();
      if (!current) {
        throw new Error("The physical feedback provider has been disposed.");
      }
      if (current.status !== "ready" || !pair) {
        throw new Error(`The physical feedback resource is ${current.status}.`);
      }
      return Object.freeze({ field: pair.read, gpu: current.gpu });
    },
    async simulate(input) {
      if (disposed) {
        throw new Error("The physical feedback resource has been disposed.");
      }
      assertPhysicalFeedbackBackingSize(input.width, input.height);
      const current = provider?.getState();
      if (!current) {
        throw new Error("The physical feedback provider has been disposed.");
      }
      if (current.status !== "ready" || !compute) {
        return Object.freeze({ ...input, resource, status: "unavailable" });
      }
      await replacePair(current.gpu, input.width, input.height);
      if (!pair) throw new Error("Physical feedback textures are unavailable.");
      const dispatch = (time: number, reset: boolean) => {
        compute?.dispatch({
          decay: 0.955,
          height: input.height,
          impulse: input.impulse,
          nextField: pair!.write,
          previousField: pair!.read,
          reset,
          time,
          width: input.width,
        });
        pair = swap(pair!);
      };
      dispatch(0, true);
      const steps = getPhysicalFeedbackReplaySteps(input.time) - 1;
      for (let index = 1; index <= steps; index += 1) {
        dispatch(index / 12, false);
      }
      await current.gpu.gpu.queue.onSubmittedWorkDone();
      await current.gpu.settled();
      if (disposed) {
        throw new Error("The physical feedback resource was disposed during compute.");
      }
      return Object.freeze({ ...input, resource, status: "ready" });
    },
  });
  return resource;
}
