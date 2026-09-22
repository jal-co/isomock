import {
  target as createVgpuTarget,
  type Gpu,
  type Target,
} from "vgpu";

import type { ToolcraftVgpuProvider } from "./provider";
import {
  resolveToolcraftVgpuBackingSize,
  type ToolcraftVgpuSceneFrame,
} from "./surface";
import {
  createTargetPresentationLifecycleSnapshot,
  materializeToolcraftVgpuTargetReadback,
  toolcraftVgpuSizesMatch,
  type ToolcraftVgpuTargetPresentationSnapshot,
} from "./target-readback-materialization";

export type {
  ToolcraftVgpuTargetPresentationSnapshot,
} from "./target-readback-materialization";

type ToolcraftVgpuTargetFactory = typeof createVgpuTarget;

export type ToolcraftVgpuTargetPresentationCommitInput = Readonly<{
  canvas: HTMLCanvasElement;
  frame: ToolcraftVgpuSceneFrame;
  render: (gpu: Gpu, target: Target) => PromiseLike<void> | void;
  shouldCommit?: () => boolean;
}>;

export type ToolcraftVgpuTargetPresentation = Readonly<{
  commit(
    input: ToolcraftVgpuTargetPresentationCommitInput,
  ): Promise<ToolcraftVgpuTargetPresentationSnapshot>;
  dispose(): Promise<void>;
  getSnapshot(): ToolcraftVgpuTargetPresentationSnapshot;
}>;

export type ToolcraftVgpuTargetPresentationOptions = Readonly<{
  imageDataConstructor?: typeof ImageData;
  provider: Pick<ToolcraftVgpuProvider, "getState">;
  target?: ToolcraftVgpuTargetFactory;
}>;

function assertReadyGpu(
  provider: Pick<ToolcraftVgpuProvider, "getState">,
): Gpu {
  const state = provider.getState();
  if (state.status !== "ready") {
    throw new Error(
      `The VGPU provider cannot present a target (status: ${state.status}).`,
    );
  }
  return state.gpu;
}

export function createToolcraftVgpuTargetPresentation({
  imageDataConstructor,
  provider,
  target: targetFactory = createVgpuTarget,
}: ToolcraftVgpuTargetPresentationOptions): ToolcraftVgpuTargetPresentation {
  let committedFrames = 0;
  let disposed = false;
  let disposal: Promise<void> | null = null;
  let queue = Promise.resolve<void>(undefined);
  let retainedTarget: Target | undefined;
  let snapshot: ToolcraftVgpuTargetPresentationSnapshot =
    createTargetPresentationLifecycleSnapshot("idle", committedFrames, false);

  const commitNow = async ({
    canvas,
    frame,
    render,
    shouldCommit,
  }: ToolcraftVgpuTargetPresentationCommitInput) => {
    if (disposed) {
      throw new Error("The VGPU target-readback presentation has been disposed.");
    }
    const backingSize = resolveToolcraftVgpuBackingSize(frame);
    if (!backingSize) {
      throw new RangeError(
        "VGPU target presentation requires a valid Toolcraft scene frame.",
      );
    }
    if (shouldCommit && !shouldCommit()) {
      snapshot = createTargetPresentationLifecycleSnapshot(
        "idle",
        committedFrames,
        false,
      );
      return snapshot;
    }
    const gpu = assertReadyGpu(provider);
    if (!retainedTarget) {
      retainedTarget = targetFactory(gpu, {
        format: "rgba8unorm",
        size: [...backingSize],
      });
    } else if (!toolcraftVgpuSizesMatch(retainedTarget.size, backingSize)) {
      retainedTarget.resize([...backingSize]);
    }
    if (!toolcraftVgpuSizesMatch(retainedTarget.size, backingSize)) {
      throw new Error(
        "VGPU target presentation backing does not match the Toolcraft scene.",
      );
    }

    snapshot = createTargetPresentationLifecycleSnapshot(
      "idle",
      committedFrames,
      false,
    );
    await render(gpu, retainedTarget);
    if (disposed) {
      throw new Error(
        "The VGPU target-readback presentation was disposed before the frame committed.",
      );
    }
    const pixels = await retainedTarget.color.read({ mipLevel: 0, region: "all" });
    if (disposed) {
      throw new Error(
        "The VGPU target-readback presentation was disposed before the frame committed.",
      );
    }
    const settledState = provider.getState();
    if (settledState.status !== "ready" || settledState.gpu !== gpu) {
      throw new Error(
        "The VGPU provider changed before target presentation committed.",
      );
    }
    if (shouldCommit && !shouldCommit()) {
      snapshot = createTargetPresentationLifecycleSnapshot(
        "idle",
        committedFrames,
        false,
      );
      return snapshot;
    }
    snapshot = materializeToolcraftVgpuTargetReadback({
      backingSize,
      canvas,
      committedFrames,
      frame,
      imageDataConstructor,
      pixels,
      target: retainedTarget,
    });
    committedFrames = snapshot.committedFrames;
    return snapshot;
  };

  return Object.freeze({
    commit(input) {
      if (disposed) {
        return Promise.reject(
          new Error("The VGPU target-readback presentation has been disposed."),
        );
      }
      const result = queue.then(() => commitNow(input));
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    dispose() {
      if (disposal) return disposal;
      disposed = true;
      snapshot = createTargetPresentationLifecycleSnapshot(
        "disposing",
        committedFrames,
        true,
      );
      disposal = queue.then(() => {
        retainedTarget = undefined;
        snapshot = createTargetPresentationLifecycleSnapshot(
          "disposed",
          committedFrames,
          true,
        );
      });
      return disposal;
    },
    getSnapshot() {
      return snapshot;
    },
  });
}
