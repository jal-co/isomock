import type {
  Gpu,
  Target,
  target as createVgpuTarget,
} from "vgpu";

type ToolcraftVgpuExportTargetOperation<Result> = (
  gpu: Gpu,
  target: Target,
) => Result | Promise<Result>;

type ToolcraftVgpuExportTargetFactory = typeof createVgpuTarget;

export function createToolcraftVgpuExportOwnership({
  getReadyGpu,
  targetFactory,
}: {
  getReadyGpu: () => Gpu;
  targetFactory: ToolcraftVgpuExportTargetFactory;
}) {
  let disposed = false;
  let queue = Promise.resolve<unknown>(undefined);
  let target: Target | undefined;

  const withTarget = <Result>(
    backingSize: readonly [number, number],
    operation: ToolcraftVgpuExportTargetOperation<Result>,
  ): Promise<Result> => {
    if (disposed) {
      return Promise.reject(new Error("The VGPU provider has been disposed."));
    }

    const run = async () => {
      if (disposed) {
        throw new Error("The VGPU provider has been disposed.");
      }
      const gpu = getReadyGpu();
      if (!target) {
        target = targetFactory(gpu, {
          format: "rgba8unorm",
          size: [...backingSize],
        });
      } else if (
        target.size[0] !== backingSize[0] ||
        target.size[1] !== backingSize[1]
      ) {
        target.resize([...backingSize]);
      }
      return operation(gpu, target);
    };

    const result = queue.then(run);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return Object.freeze({
    dispose() {
      disposed = true;
      target = undefined;
    },
    withTarget,
  });
}
