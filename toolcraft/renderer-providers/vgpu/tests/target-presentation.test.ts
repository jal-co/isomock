import type { Gpu, Target } from "vgpu";
import { describe, expect, it, vi } from "vitest";

import {
  createToolcraftVgpuTargetPresentation,
  getToolcraftVgpuExportRuntimeAttributes,
  getToolcraftVgpuRuntimeAttributes,
} from "../../../../src/toolcraft/integrations/vgpu/index";

class ImageDataDouble {
  readonly colorSpace = "srgb" as const;
  readonly data: Uint8ClampedArray;
  readonly height: number;
  readonly width: number;

  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createTargetDouble(initialSize: readonly [number, number]) {
  let size = initialSize;
  let pixels = new Uint8Array(size[0] * size[1] * 4).fill(17);
  return {
    color: { read: vi.fn(async () => pixels) },
    resize: vi.fn((nextSize: readonly [number, number]) => {
      size = nextSize;
      pixels = new Uint8Array(size[0] * size[1] * 4).fill(29);
    }),
    get size() {
      return size;
    },
  } as unknown as Target;
}

function createCanvasDouble() {
  const putImageData = vi.fn();
  const context = { putImageData } as unknown as CanvasRenderingContext2D;
  const canvas = {
    getContext: vi.fn(() => context),
    height: 0,
    style: { height: "", width: "" },
    width: 0,
  } as unknown as HTMLCanvasElement;
  return { canvas, putImageData };
}

describe("Toolcraft VGPU target-readback presentation", () => {
  it("publishes an exact accessible export failure code", () => {
    expect(getToolcraftVgpuExportRuntimeAttributes(null)).toEqual({
      "aria-live": "polite",
    });
    expect(
      getToolcraftVgpuExportRuntimeAttributes("vgpu-export-unsupported"),
    ).toEqual({
      "aria-live": "polite",
      "data-toolcraft-gpu-export-status": "vgpu-export-unsupported",
    });
  });

  it("owns one retained target and commits matching pixels to a visible Canvas2D", async () => {
    const gpu = {} as Gpu;
    const target = createTargetDouble([1600, 900]);
    const targetFactory = vi.fn(() => target);
    const provider = { getState: () => ({ gpu, status: "ready" }) as const };
    const presentation = createToolcraftVgpuTargetPresentation({
      imageDataConstructor: ImageDataDouble as unknown as typeof ImageData,
      provider,
      target: targetFactory,
    });
    const { canvas, putImageData } = createCanvasDouble();
    const render = vi.fn(async (_gpu: Gpu, output: Target) => {
      expect(output).toBe(target);
    });

    expect(
      getToolcraftVgpuRuntimeAttributes(provider.getState(), {
        mode: "target-readback",
        snapshot: presentation.getSnapshot(),
      }),
    ).toEqual({
      "aria-label": "The VGPU target-readback presentation is not committed.",
      "data-toolcraft-gpu-status": "presentation-unavailable",
    });

    const first = await presentation.commit({
      canvas,
      frame: {
        cssHeight: 450,
        cssWidth: 800,
        devicePixelRatio: 1,
        renderScale: 2,
      },
      render,
    });

    expect(targetFactory).toHaveBeenCalledWith(gpu, {
      format: "rgba8unorm",
      size: [1600, 900],
    });
    expect(render).toHaveBeenCalledWith(gpu, target);
    expect(target.color.read).toHaveBeenCalledWith({ mipLevel: 0, region: "all" });
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(900);
    expect(canvas.style).toEqual({ height: "450px", width: "800px" });
    expect(putImageData).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({
      backingSize: [1600, 900],
      committedFrames: 1,
      disposed: false,
      mode: "target-readback",
      status: "committed",
    });
    expect(first.canvas).toBe(canvas);
    expect(first.target).toBe(target);
    expect(
      getToolcraftVgpuRuntimeAttributes(provider.getState(), {
        mode: "target-readback",
        snapshot: first,
      }),
    ).toEqual({
      "data-toolcraft-gpu-backend": "webgpu",
      "data-toolcraft-gpu-backing": "1600x900",
      "data-toolcraft-gpu-presentation": "target-readback",
      "data-toolcraft-gpu-provider": "vgpu",
      "data-toolcraft-gpu-status": "ready",
    });

    await presentation.commit({
      canvas,
      frame: {
        cssHeight: 300,
        cssWidth: 400,
        devicePixelRatio: 1,
        renderScale: 2,
      },
      render,
    });
    expect(targetFactory).toHaveBeenCalledTimes(1);
    expect(target.resize).toHaveBeenCalledWith([800, 600]);
    expect(presentation.getSnapshot()).toMatchObject({
      backingSize: [800, 600],
      committedFrames: 2,
      status: "committed",
    });
  });

  it("rejects invalid readback bytes and a missing Canvas2D context through the public API", async () => {
    const gpu = {} as Gpu;
    const provider = { getState: () => ({ gpu, status: "ready" }) as const };
    const frame = {
      cssHeight: 2,
      cssWidth: 2,
      devicePixelRatio: 1,
      renderScale: 1,
    };
    const malformedTarget = {
      color: { read: vi.fn(async () => new Uint8Array(15)) },
      resize: vi.fn(),
      size: [2, 2] as const,
    } as unknown as Target;
    const malformed = createToolcraftVgpuTargetPresentation({
      imageDataConstructor: ImageDataDouble as unknown as typeof ImageData,
      provider,
      target: vi.fn(() => malformedTarget),
    });
    await expect(
      malformed.commit({
        canvas: createCanvasDouble().canvas,
        frame,
        render: async () => undefined,
      }),
    ).rejects.toThrow("returned 15 bytes; expected 16");

    const missingContext = createToolcraftVgpuTargetPresentation({
      imageDataConstructor: ImageDataDouble as unknown as typeof ImageData,
      provider,
      target: vi.fn(() => createTargetDouble([2, 2])),
    });
    await expect(
      missingContext.commit({
        canvas: {
          getContext: () => null,
          style: {},
        } as unknown as HTMLCanvasElement,
        frame,
        render: async () => undefined,
      }),
    ).rejects.toThrow("no Canvas2D presentation context");
  });

  it("withholds ready evidence when the committed target or live canvas backing drifts", async () => {
    const gpu = {} as Gpu;
    const target = createTargetDouble([64, 32]);
    const provider = { getState: () => ({ gpu, status: "ready" }) as const };
    const presentation = createToolcraftVgpuTargetPresentation({
      imageDataConstructor: ImageDataDouble as unknown as typeof ImageData,
      provider,
      target: vi.fn(() => target),
    });
    const { canvas } = createCanvasDouble();
    const committed = await presentation.commit({
      canvas,
      frame: {
        cssHeight: 32,
        cssWidth: 64,
        devicePixelRatio: 1,
        renderScale: 1,
      },
      render: async () => undefined,
    });

    canvas.width = 63;
    expect(
      getToolcraftVgpuRuntimeAttributes(provider.getState(), {
        mode: "target-readback",
        snapshot: committed,
      }),
    ).toEqual({
      "aria-label": "The VGPU target-readback backing does not match the live presentation.",
      "data-toolcraft-gpu-status": "presentation-mismatch",
    });

    await presentation.dispose();
    expect(presentation.getSnapshot()).toMatchObject({
      disposed: true,
      mode: "target-readback",
      status: "disposed",
    });
  });

  it("discards stale malformed readback before Canvas2D materialization", async () => {
    const gpu = {} as Gpu;
    const readStarted = deferred<void>();
    const releaseRead = deferred<void>();
    const pixels = new Uint8Array(1).fill(41);
    const target = {
      color: {
        read: vi.fn(async () => {
          readStarted.resolve();
          await releaseRead.promise;
          return pixels;
        }),
      },
      resize: vi.fn(),
      size: [16, 16] as const,
    } as unknown as Target;
    const presentation = createToolcraftVgpuTargetPresentation({
      imageDataConstructor: ImageDataDouble as unknown as typeof ImageData,
      provider: { getState: () => ({ gpu, status: "ready" }) as const },
      target: vi.fn(() => target),
    });
    const { canvas, putImageData } = createCanvasDouble();
    let current = true;
    const commit = presentation.commit({
      canvas,
      frame: {
        cssHeight: 16,
        cssWidth: 16,
        devicePixelRatio: 1,
        renderScale: 1,
      },
      render: async () => undefined,
      shouldCommit: () => current,
    });
    await readStarted.promise;
    current = false;
    releaseRead.resolve();

    await expect(commit).resolves.toMatchObject({
      committedFrames: 0,
      status: "idle",
    });
    expect(putImageData).not.toHaveBeenCalled();
    expect(canvas).toMatchObject({ height: 0, width: 0 });
  });

  it("waits for an active commit before disposing presentation ownership", async () => {
    const gpu = {} as Gpu;
    const target = createTargetDouble([16, 16]);
    const renderStarted = deferred<void>();
    const releaseRender = deferred<void>();
    const presentation = createToolcraftVgpuTargetPresentation({
      imageDataConstructor: ImageDataDouble as unknown as typeof ImageData,
      provider: { getState: () => ({ gpu, status: "ready" }) as const },
      target: vi.fn(() => target),
    });
    const commit = presentation.commit({
      canvas: createCanvasDouble().canvas,
      frame: {
        cssHeight: 16,
        cssWidth: 16,
        devicePixelRatio: 1,
        renderScale: 1,
      },
      render: async () => {
        renderStarted.resolve();
        await releaseRender.promise;
      },
    });
    await renderStarted.promise;
    let disposalSettled = false;
    const disposal = presentation.dispose().then(() => {
      disposalSettled = true;
    });
    await Promise.resolve();
    expect(disposalSettled).toBe(false);

    releaseRender.resolve();
    await expect(commit).rejects.toThrow("disposed before the frame committed");
    await disposal;
    expect(target.color.read).not.toHaveBeenCalled();
    await expect(
      presentation.commit({
        canvas: createCanvasDouble().canvas,
        frame: {
          cssHeight: 16,
          cssWidth: 16,
          devicePixelRatio: 1,
          renderScale: 1,
        },
        render: async () => undefined,
      }),
    ).rejects.toThrow("disposed");
  });
});
