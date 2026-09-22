import type { Frame, Gpu, Target } from "vgpu";
import { beforeEach, describe, expect, it, vi } from "vitest";

const vgpu = vi.hoisted(() => ({ frame: vi.fn() }));

vi.mock("vgpu", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vgpu")>()),
  frame: vgpu.frame,
}));

import {
  createToolcraftVgpuProvider,
  renderToolcraftVgpuExportFrame,
  ToolcraftVgpuExportError,
  type ToolcraftVgpuProvider,
  type ToolcraftVgpuProviderState,
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

function createGpuDouble(order: string[] = []) {
  return {
    dispose: vi.fn(() => order.push("dispose")),
    disposed: false,
    gpu: { lost: new Promise<unknown>(() => undefined) },
    onError: vi.fn(() => vi.fn()),
    settled: vi.fn(async () => {
      order.push("settled");
    }),
  } as unknown as Gpu;
}

function deferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });
  return { promise, reject, resolve };
}

function createTargetDouble(
  order: string[] = [],
  initialRgba = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
) {
  let size: readonly [number, number] = [2, 1];
  let rgba = initialRgba;
  return {
    color: {
      read: vi.fn(async () => {
        order.push("read");
        return rgba;
      }),
    },
    resize: vi.fn((nextSize: readonly [number, number]) => {
      size = nextSize;
      rgba = new Uint8Array(nextSize[0] * nextSize[1] * 4).fill(9);
    }),
    get size() {
      return size;
    },
  } as unknown as Target;
}

function createContextDouble(
  order: string[] = [],
  initialDestination?: Uint8ClampedArray,
) {
  const canvas = {
    convertToBlob: vi.fn(),
    toBlob: vi.fn(),
    toDataURL: vi.fn(),
  };
  let destination = initialDestination?.slice();
  return {
    canvas,
    context: {
      canvas,
      getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => {
        order.push("getImageData");
        const expectedLength = width * height * 4;
        const data =
          destination?.byteLength === expectedLength
            ? destination.slice()
            : new Uint8ClampedArray(expectedLength);
        return new ImageDataDouble(data, width, height) as unknown as ImageData;
      }),
      putImageData: vi.fn((imageData: ImageData) => {
        order.push("putImageData");
        destination = imageData.data.slice();
      }),
    } as unknown as CanvasRenderingContext2D,
    readPixels: () => destination,
  };
}

function providerWithState(
  state: ToolcraftVgpuProviderState,
): Pick<ToolcraftVgpuProvider, "getState" | "withExportTarget"> {
  return {
    getState: () => state,
    withExportTarget: vi.fn(() => {
      throw new Error("target must not be requested");
    }),
  };
}

describe("Toolcraft VGPU export", () => {
  beforeEach(() => {
    vgpu.frame.mockReset();
  });

  it("renders, settles, reads, and writes one deterministic ImageData", async () => {
    const order: string[] = [];
    const gpu = createGpuDouble(order);
    const target = createTargetDouble(order);
    const createTarget = vi.fn(() => target);
    const provider = createToolcraftVgpuProvider({
      init: vi.fn(async () => gpu),
      navigator: { gpu: {} },
      target: createTarget,
    });
    await provider.whenInitialized();
    vgpu.frame.mockImplementation((_gpu, callback) => {
      order.push("frame");
      callback({ marker: "submitted-frame" } as unknown as Frame);
      return {
        done: Promise.resolve().then(() => {
          order.push("done");
        }),
      };
    });
    const { canvas, context } = createContextDouble(order);
    const render = vi.fn((currentFrame: Frame, output: Target) => {
      order.push("render");
      expect(currentFrame).toMatchObject({ marker: "submitted-frame" });
      expect(output).toBe(target);
    });

    await renderToolcraftVgpuExportFrame({
      context,
      height: 1,
      imageDataConstructor: ImageDataDouble as unknown as typeof ImageData,
      provider,
      render,
      width: 2,
    });

    expect(vgpu.frame).toHaveBeenCalledWith(gpu, expect.any(Function));
    expect(createTarget).toHaveBeenCalledWith(gpu, {
      format: "rgba8unorm",
      size: [2, 1],
    });
    expect(render).toHaveBeenCalledTimes(1);
    expect(target.color.read).toHaveBeenCalledWith({ mipLevel: 0, region: "all" });
    expect(order).toEqual([
      "frame",
      "render",
      "done",
      "settled",
      "read",
      "getImageData",
      "putImageData",
    ]);
    const [imageData, x, y] = vi.mocked(context.putImageData).mock.calls[0];
    expect(imageData).toMatchObject({
      data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]),
      height: 1,
      width: 2,
    });
    expect([x, y]).toEqual([0, 0]);
    expect(canvas.toBlob).not.toHaveBeenCalled();
    expect(canvas.toDataURL).not.toHaveBeenCalled();
    expect(canvas.convertToBlob).not.toHaveBeenCalled();
  });

  it("composites translucent and opaque output over existing runtime pixels", async () => {
    const gpu = createGpuDouble();
    const target = createTargetDouble(
      [],
      new Uint8Array([255, 0, 0, 128, 5, 6, 7, 255]),
    );
    const provider = createToolcraftVgpuProvider({
      init: vi.fn(async () => gpu),
      navigator: { gpu: {} },
      target: vi.fn(() => target),
    });
    await provider.whenInitialized();
    vgpu.frame.mockImplementation((_gpu, callback) => {
      callback({} as Frame);
      return { done: Promise.resolve() };
    });
    const { context, readPixels } = createContextDouble(
      [],
      new Uint8ClampedArray([0, 0, 255, 255, 200, 100, 50, 120]),
    );

    await renderToolcraftVgpuExportFrame({
      context,
      height: 1,
      imageDataConstructor: ImageDataDouble as unknown as typeof ImageData,
      provider,
      render: vi.fn(),
      width: 2,
    });

    expect(readPixels()).toEqual(
      new Uint8ClampedArray([128, 0, 127, 255, 5, 6, 7, 255]),
    );
  });

  it("preserves destination pixels under fully transparent VGPU output", async () => {
    const gpu = createGpuDouble();
    const target = createTargetDouble([], new Uint8Array([240, 120, 60, 0]));
    const provider = createToolcraftVgpuProvider({
      init: vi.fn(async () => gpu),
      navigator: { gpu: {} },
      target: vi.fn(() => target),
    });
    await provider.whenInitialized();
    vgpu.frame.mockImplementation((_gpu, callback) => {
      callback({} as Frame);
      return { done: Promise.resolve() };
    });
    const destination = new Uint8ClampedArray([11, 22, 33, 0]);
    const { context, readPixels } = createContextDouble([], destination);

    await renderToolcraftVgpuExportFrame({
      context,
      height: 1,
      imageDataConstructor: ImageDataDouble as unknown as typeof ImageData,
      provider,
      render: vi.fn(),
      width: 1,
    });

    expect(readPixels()).toEqual(destination);
  });

  it("reuses and resizes the provider-owned export target", async () => {
    const gpu = createGpuDouble();
    const target = createTargetDouble();
    const createTarget = vi.fn(() => target);
    const provider = createToolcraftVgpuProvider({
      init: vi.fn(async () => gpu),
      navigator: { gpu: {} },
      target: createTarget,
    });
    await provider.whenInitialized();
    vgpu.frame.mockImplementation((_gpu, callback) => {
      callback({} as Frame);
      return { done: Promise.resolve() };
    });
    const { context } = createContextDouble();
    const shared = {
      context,
      imageDataConstructor: ImageDataDouble as unknown as typeof ImageData,
      provider,
      render: vi.fn(),
    };

    await renderToolcraftVgpuExportFrame({ ...shared, height: 1, width: 2 });
    await renderToolcraftVgpuExportFrame({ ...shared, height: 2, width: 1 });
    provider.dispose();

    expect(createTarget).toHaveBeenCalledTimes(1);
    expect(target.resize).toHaveBeenCalledTimes(1);
    expect(target.resize).toHaveBeenCalledWith([1, 2]);
    expect(gpu.dispose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["same dimensions", 2, 1, 0],
    ["different dimensions", 1, 1, 1],
  ])("serializes unresolved exports with %s", async (_case, width, height, resizeCount) => {
    const gpu = createGpuDouble();
    const firstRead = deferred<Uint8Array>();
    const firstReadStarted = deferred<void>();
    const secondRead = deferred<Uint8Array>();
    const secondReadStarted = deferred<void>();
    const target = createTargetDouble();
    vi.mocked(target.color.read)
      .mockImplementationOnce(() => {
        firstReadStarted.resolve();
        return firstRead.promise;
      })
      .mockImplementationOnce(() => {
        secondReadStarted.resolve();
        return secondRead.promise;
      });
    const provider = createToolcraftVgpuProvider({
      init: vi.fn(async () => gpu),
      navigator: { gpu: {} },
      target: vi.fn(() => target),
    });
    await provider.whenInitialized();
    vgpu.frame.mockImplementation((_gpu, callback) => {
      callback({} as Frame);
      return { done: Promise.resolve() };
    });
    const firstContext = createContextDouble().context;
    const secondContext = createContextDouble().context;
    const shared = {
      height: 1,
      imageDataConstructor: ImageDataDouble as unknown as typeof ImageData,
      provider,
      render: vi.fn(),
    };

    const first = renderToolcraftVgpuExportFrame({
      ...shared,
      context: firstContext,
      width: 2,
    });
    const second = renderToolcraftVgpuExportFrame({
      ...shared,
      context: secondContext,
      height,
      width,
    });
    await firstReadStarted.promise;

    expect(vgpu.frame).toHaveBeenCalledTimes(1);
    expect(target.color.read).toHaveBeenCalledTimes(1);
    expect(target.resize).not.toHaveBeenCalled();

    firstRead.resolve(new Uint8Array(8));
    await first;
    await secondReadStarted.promise;

    expect(vgpu.frame).toHaveBeenCalledTimes(2);
    expect(target.color.read).toHaveBeenCalledTimes(2);
    expect(target.resize).toHaveBeenCalledTimes(resizeCount);

    secondRead.resolve(new Uint8Array(width * height * 4));
    await second;
  });

  it("holds then releases the export queue after product rendering fails", async () => {
    const gpu = createGpuDouble();
    const firstDone = deferred<void>();
    const firstFrameStarted = deferred<void>();
    const secondRead = deferred<Uint8Array>();
    const secondReadStarted = deferred<void>();
    const target = createTargetDouble();
    vi.mocked(target.color.read).mockImplementationOnce(() => {
      secondReadStarted.resolve();
      return secondRead.promise;
    });
    const provider = createToolcraftVgpuProvider({
      init: vi.fn(async () => gpu),
      navigator: { gpu: {} },
      target: vi.fn(() => target),
    });
    await provider.whenInitialized();
    vgpu.frame
      .mockImplementationOnce((_gpu, callback) => {
        firstFrameStarted.resolve();
        callback({} as Frame);
        return { done: firstDone.promise };
      })
      .mockImplementationOnce((_gpu, callback) => {
        callback({} as Frame);
        return { done: Promise.resolve() };
      });
    const renderFailure = new Error("product render failed");
    const render = vi
      .fn()
      .mockImplementationOnce(() => {
        throw renderFailure;
      })
      .mockImplementationOnce(() => undefined);
    const input = {
      context: createContextDouble().context,
      height: 1,
      imageDataConstructor: ImageDataDouble as unknown as typeof ImageData,
      provider,
      render,
      width: 2,
    };

    const first = renderToolcraftVgpuExportFrame(input);
    const second = renderToolcraftVgpuExportFrame(input);
    await firstFrameStarted.promise;

    expect(vgpu.frame).toHaveBeenCalledTimes(1);
    expect(target.color.read).not.toHaveBeenCalled();
    firstDone.resolve();

    await expect(first).rejects.toMatchObject({ code: "vgpu-export-failed" });
    await secondReadStarted.promise;
    expect(vgpu.frame).toHaveBeenCalledTimes(2);
    expect(target.color.read).toHaveBeenCalledTimes(1);

    secondRead.resolve(new Uint8Array(8));
    await expect(second).resolves.toBeUndefined();
  });

  it.each([
    [
      { message: "WebGPU unavailable", status: "unsupported" } as const,
      "vgpu-export-unsupported",
    ],
    [
      {
        message: "device lost",
        reason: { reason: "destroyed" },
        status: "device-lost",
      } as const,
      "vgpu-export-device-lost",
    ],
    [
      {
        error: new Error("validation"),
        message: "renderer failed",
        status: "failed",
      } as const,
      "vgpu-export-failed",
    ],
  ])("rejects provider state %s with code %s", async (state, code) => {
    const { context } = createContextDouble();

    let caught: unknown;
    try {
      await renderToolcraftVgpuExportFrame({
        context,
        height: 1,
        imageDataConstructor: ImageDataDouble as unknown as typeof ImageData,
        provider: providerWithState(state),
        render: vi.fn(),
        width: 1,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ToolcraftVgpuExportError);
    expect(caught).toMatchObject({ code });
    expect(vgpu.frame).not.toHaveBeenCalled();
  });

  it("rejects a provider that leaves ready state while export is settling", async () => {
    const gpu = createGpuDouble();
    const target = createTargetDouble();
    let state: ToolcraftVgpuProviderState = { gpu, status: "ready" };
    const provider = {
      getState: () => state,
      withExportTarget: vi.fn(async (_size, operation) => operation(gpu, target)),
    };
    vgpu.frame.mockImplementation((_gpu, callback) => {
      callback({} as Frame);
      return {
        done: Promise.resolve().then(() => {
          state = {
            message: "The WebGPU device was lost.",
            reason: { reason: "destroyed" },
            status: "device-lost",
          };
        }),
      };
    });
    const { context } = createContextDouble();

    await expect(
      renderToolcraftVgpuExportFrame({
        context,
        height: 1,
        imageDataConstructor: ImageDataDouble as unknown as typeof ImageData,
        provider,
        render: vi.fn(),
        width: 2,
      }),
    ).rejects.toMatchObject({ code: "vgpu-export-device-lost" });
    expect(context.putImageData).not.toHaveBeenCalled();
  });

  it("rejects device loss after the target lease and before context write", async () => {
    const gpu = createGpuDouble();
    const target = createTargetDouble();
    let state: ToolcraftVgpuProviderState = { gpu, status: "ready" };
    const provider = {
      getState: () => state,
      withExportTarget: vi.fn(async (_size, operation) => {
        const result = await operation(gpu, target);
        state = {
          message: "The WebGPU device was lost.",
          reason: { reason: "destroyed" },
          status: "device-lost",
        };
        return result;
      }),
    };
    vgpu.frame.mockImplementation((_gpu, callback) => {
      callback({} as Frame);
      return { done: Promise.resolve() };
    });
    const { context } = createContextDouble();

    await expect(
      renderToolcraftVgpuExportFrame({
        context,
        height: 1,
        imageDataConstructor: ImageDataDouble as unknown as typeof ImageData,
        provider,
        render: vi.fn(),
        width: 2,
      }),
    ).rejects.toMatchObject({ code: "vgpu-export-device-lost" });
    expect(context.getImageData).not.toHaveBeenCalled();
    expect(context.putImageData).not.toHaveBeenCalled();
  });

  it("rejects invalid dimensions and mismatched readback bytes", async () => {
    const gpu = createGpuDouble();
    const target = createTargetDouble();
    vi.mocked(target.color.read).mockResolvedValueOnce(new Uint8Array(7));
    const provider = createToolcraftVgpuProvider({
      init: vi.fn(async () => gpu),
      navigator: { gpu: {} },
      target: vi.fn(() => target),
    });
    await provider.whenInitialized();
    vgpu.frame.mockImplementation((_gpu, callback) => {
      callback({} as Frame);
      return { done: Promise.resolve() };
    });
    const { context } = createContextDouble();
    const input = {
      context,
      height: 1,
      imageDataConstructor: ImageDataDouble as unknown as typeof ImageData,
      provider,
      render: vi.fn(),
      width: 2,
    };

    await expect(renderToolcraftVgpuExportFrame(input)).rejects.toMatchObject({
      code: "vgpu-export-failed",
    });
    await expect(
      renderToolcraftVgpuExportFrame({ ...input, width: 0 }),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      renderToolcraftVgpuExportFrame({ ...input, height: 1.5 }),
    ).rejects.toBeInstanceOf(RangeError);
  });
});
