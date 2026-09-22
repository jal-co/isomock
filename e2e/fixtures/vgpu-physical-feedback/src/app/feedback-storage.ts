import type { Gpu, ShaderSource } from "vgpu";
import type { Texture } from "vgpu/core";

type DisposableStep = () => PromiseLike<void> | void;

export type PhysicalFeedbackAssetOwner = Readonly<{
  dispose(): Promise<void>;
  getOwnedStepCount(): number;
}>;

export function createPhysicalFeedbackAssetOwner(
  initialSteps: readonly DisposableStep[],
): PhysicalFeedbackAssetOwner {
  let steps = [...initialSteps];
  let disposal: Promise<void> | null = null;
  return Object.freeze({
    dispose() {
      if (disposal) return disposal;
      const owned = steps;
      steps = [];
      disposal = (async () => {
        const results = await Promise.allSettled(
          owned.map((dispose) => Promise.resolve().then(dispose)),
        );
        const errors = results.flatMap((result) =>
          result.status === "rejected" ? [result.reason] : [],
        );
        if (errors.length > 0) {
          throw new AggregateError(
            errors,
            "Physical feedback resource disposal failed.",
          );
        }
      })();
      return disposal;
    },
    getOwnedStepCount() {
      return steps.length;
    },
  });
}

type FeedbackTextureOptions = Readonly<{
  format: "rgba8unorm";
  label: string;
  size: readonly [number, number];
  usage: readonly ["copy_src", "storage_binding", "texture_binding"];
}>;

export function createPhysicalFeedbackTexturePair<
  TextureHandle extends Readonly<{ destroy(): void }>,
>(
  device: Readonly<{
    createTexture(options: FeedbackTextureOptions): TextureHandle;
  }>,
  width: number,
  height: number,
  label: string,
): Readonly<{ read: TextureHandle; write: TextureHandle }> {
  let read: TextureHandle | undefined;
  let write: TextureHandle | undefined;
  try {
    read = device.createTexture({
      format: "rgba8unorm",
      label: `${label}.read`,
      size: [width, height],
      usage: ["copy_src", "storage_binding", "texture_binding"],
    });
    write = device.createTexture({
      format: "rgba8unorm",
      label: `${label}.write`,
      size: [width, height],
      usage: ["copy_src", "storage_binding", "texture_binding"],
    });
    return Object.freeze({ read, write });
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    for (const texture of [write, read]) {
      if (!texture) continue;
      try {
        texture.destroy();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        "Physical feedback texture construction failed.",
      );
    }
    throw error;
  }
}

export type StorageFeedbackCompute = Readonly<{
  dispatch(input: Readonly<{
    decay: number;
    height: number;
    impulse: number;
    nextField: Texture;
    previousField: Texture;
    reset: boolean;
    time: number;
    width: number;
  }>): void;
  dispose(): void;
}>;

export function createStorageFeedbackCompute(
  gpu: Gpu,
  shader: ShaderSource,
): StorageFeedbackCompute {
  const device = gpu.gpu;
  const parameters = gpu.device.createBuffer({
    label: "toolcraft-feedback-parameters",
    size: 32,
    usage: ["copy_dst", "uniform"],
  });
  let disposed = false;
  try {
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          texture: { sampleType: "float", viewDimension: "2d" },
          visibility: 4,
        },
        {
          binding: 1,
          storageTexture: {
            access: "write-only",
            format: "rgba8unorm",
            viewDimension: "2d",
          },
          visibility: 4,
        },
        {
          binding: 2,
          buffer: { minBindingSize: 32, type: "uniform" },
          visibility: 4,
        },
      ],
      label: "toolcraft-feedback-layout",
    });
    const pipeline = device.createComputePipeline({
      compute: {
        entryPoint: "simulate",
        module: device.createShaderModule({ code: shader.wgsl }),
      },
      label: "toolcraft-feedback-simulate",
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    });
    return Object.freeze({
      dispatch({
        decay,
        height,
        impulse,
        nextField,
        previousField,
        reset,
        time,
        width,
      }) {
        const bytes = new ArrayBuffer(32);
        const integers = new Uint32Array(bytes);
        const floats = new Float32Array(bytes);
        integers[0] = width;
        integers[1] = height;
        floats[2] = impulse;
        floats[3] = decay;
        floats[4] = reset ? 1 : 0;
        floats[5] = time;
        device.queue.writeBuffer(parameters.gpu, 0, bytes);
        const bindGroup = device.createBindGroup({
          entries: [
            { binding: 0, resource: previousField.createView() },
            { binding: 1, resource: nextField.createView() },
            { binding: 2, resource: { buffer: parameters.gpu } },
          ],
          layout: bindGroupLayout,
        });
        const encoder = device.createCommandEncoder({
          label: "toolcraft-feedback-command",
        });
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
        pass.end();
        device.queue.submit([encoder.finish()]);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        parameters.destroy();
      },
    });
  } catch (error) {
    try {
      parameters.destroy();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Physical feedback compute construction failed.",
      );
    }
    throw error;
  }
}
