import type { Gpu, Surface, Target } from "vgpu";
import { describe, expect, it, vi } from "vitest";

import { createToolcraftVgpuProvider } from "../../../../src/toolcraft/integrations/vgpu/index";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createGpuDouble(options?: { lost?: Promise<unknown> }) {
  let disposed = false;
  let errorListener: ((error: unknown) => void) | undefined;
  const releaseErrorListener = vi.fn();
  const dispose = vi.fn(() => {
    disposed = true;
  });
  const onError = vi.fn((listener: (error: unknown) => void) => {
    errorListener = listener;
    return releaseErrorListener;
  });
  const gpu = {
    dispose,
    get disposed() {
      return disposed;
    },
    gpu: {
      lost: options?.lost ?? new Promise<unknown>(() => undefined),
    },
    onError,
    settled: vi.fn(async () => undefined),
  } as unknown as Gpu;

  return {
    dispose,
    emitError(error: unknown) {
      errorListener?.(error);
    },
    gpu,
    onError,
    releaseErrorListener,
  };
}

function createSurfaceDouble(order?: string[]) {
  let disposed = false;
  let destroyListener: (() => void) | undefined;
  return {
    dispose: vi.fn(() => {
      if (disposed) {
        return;
      }
      order?.push("surface");
      disposed = true;
      destroyListener?.();
    }),
    get disposed() {
      return disposed;
    },
    onDestroy: vi.fn((listener: () => void) => {
      destroyListener = listener;
      return vi.fn(() => {
        destroyListener = undefined;
      });
    }),
    resize: vi.fn(),
    size: [16, 16] as const,
  } as unknown as Surface;
}

function createTargetDouble() {
  return {
    resize: vi.fn(),
    size: [320, 180] as const,
  } as unknown as Target;
}

describe("createToolcraftVgpuProvider", () => {
  it("returns immediately and initializes exactly once", async () => {
    const gpuDouble = createGpuDouble();
    const init = vi.fn(async () => gpuDouble.gpu);
    const provider = createToolcraftVgpuProvider({
      init,
      navigator: { gpu: {} },
    });

    expect(provider.getState()).toEqual({ status: "initializing" });
    expect(Object.isFrozen(provider.getState())).toBe(true);
    expect(Reflect.set(provider.getState(), "status", "failed")).toBe(false);
    expect(provider.getState()).toEqual({ status: "initializing" });
    const first = provider.whenInitialized();
    const second = provider.whenInitialized();

    await expect(first).resolves.toMatchObject({ gpu: gpuDouble.gpu, status: "ready" });
    await expect(second).resolves.toMatchObject({ gpu: gpuDouble.gpu, status: "ready" });
    expect(Object.isFrozen(provider.getState())).toBe(true);
    expect(init).toHaveBeenCalledTimes(1);
    expect(gpuDouble.onError).toHaveBeenCalledTimes(1);
  });

  it("reports unsupported without initializing when WebGPU is absent", async () => {
    const init = vi.fn();
    const provider = createToolcraftVgpuProvider({ init, navigator: {} });

    expect(provider.getState()).toEqual({ status: "initializing" });
    await expect(provider.whenInitialized()).resolves.toEqual({
      message: "WebGPU is unavailable in this browser.",
      status: "unsupported",
    });
    expect(init).not.toHaveBeenCalled();
  });

  it("publishes initialization and runtime errors as failed states", async () => {
    const initializationError = new Error("adapter unavailable");
    const rejected = createToolcraftVgpuProvider({
      init: vi.fn(async () => Promise.reject(initializationError)),
      navigator: { gpu: {} },
    });

    await expect(rejected.whenInitialized()).resolves.toEqual({
      error: initializationError,
      message: "Unable to initialize the VGPU renderer.",
      status: "failed",
    });

    const gpuDouble = createGpuDouble();
    const provider = createToolcraftVgpuProvider({
      init: vi.fn(async () => gpuDouble.gpu),
      navigator: { gpu: {} },
    });
    await provider.whenInitialized();
    const runtimeError = new Error("validation");
    gpuDouble.emitError(runtimeError);

    expect(provider.getState()).toEqual({
      error: runtimeError,
      message: "The VGPU renderer reported an error.",
      status: "failed",
    });
  });

  it("transitions a ready provider to device-lost and notifies subscribers", async () => {
    const lost = deferred<unknown>();
    const gpuDouble = createGpuDouble({ lost: lost.promise });
    const provider = createToolcraftVgpuProvider({
      init: vi.fn(async () => gpuDouble.gpu),
      navigator: { gpu: {} },
    });
    const states: string[] = [];
    const unsubscribe = provider.subscribe((state) => states.push(state.status));

    await provider.whenInitialized();
    const reason = { message: "device removed", reason: "destroyed" };
    lost.resolve(reason);
    await lost.promise;
    await Promise.resolve();

    expect(provider.getState()).toEqual({
      message: "The WebGPU device was lost.",
      reason,
      status: "device-lost",
    });
    const operation = vi.fn();
    await expect(
      provider.withExportTarget([16, 16], operation),
    ).rejects.toThrow("status: device-lost");
    expect(operation).not.toHaveBeenCalled();
    expect(states).toEqual(["ready", "device-lost"]);
    unsubscribe();
  });

  it("isolates observer failures from initialization and device loss", async () => {
    const lost = deferred<unknown>();
    const gpuDouble = createGpuDouble({ lost: lost.promise });
    const observerError = new Error("observer failed");
    const onObserverError = vi.fn();
    const provider = createToolcraftVgpuProvider({
      init: vi.fn(async () => gpuDouble.gpu),
      navigator: { gpu: {} },
      onObserverError,
    });
    const states: string[] = [];
    provider.subscribe(() => {
      throw observerError;
    });
    provider.subscribe((state) => states.push(state.status));

    await expect(provider.whenInitialized()).resolves.toMatchObject({
      status: "ready",
    });
    const reason = { message: "device removed", reason: "destroyed" };
    lost.resolve(reason);
    await lost.promise;
    await Promise.resolve();

    expect(states).toEqual(["ready", "device-lost"]);
    expect(onObserverError).toHaveBeenCalledTimes(2);
    expect(onObserverError).toHaveBeenNthCalledWith(1, observerError);
    expect(provider.getState()).toEqual({
      message: "The WebGPU device was lost.",
      reason,
      status: "device-lost",
    });
    expect(Object.isFrozen(provider.getState())).toBe(true);
  });

  it("owns canonical surfaces and one retained export target", async () => {
    const gpuDouble = createGpuDouble();
    const createdSurface = createSurfaceDouble();
    const createdTarget = createTargetDouble();
    const surface = vi.fn(() => createdSurface);
    const target = vi.fn(() => createdTarget);
    const provider = createToolcraftVgpuProvider({
      init: vi.fn(async () => gpuDouble.gpu),
      navigator: { gpu: {} },
      surface,
      target,
    });
    await provider.whenInitialized();
    const canvas = {} as HTMLCanvasElement;

    expect(provider.createSurface(canvas, [1600, 900])).toBe(createdSurface);
    expect(surface).toHaveBeenCalledWith(gpuDouble.gpu, canvas, {
      alphaMode: "premultiplied",
      autoResize: false,
      dpr: 1,
      size: [1600, 900],
    });
    await expect(
      provider.withExportTarget([320, 180], async (_gpu, output) => output),
    ).resolves.toBe(createdTarget);
    expect(target).toHaveBeenCalledWith(gpuDouble.gpu, {
      format: "rgba8unorm",
      size: [320, 180],
    });
    await expect(
      provider.withExportTarget([640, 360], async (_gpu, output) => output),
    ).resolves.toBe(createdTarget);
    expect(createdTarget.resize).toHaveBeenCalledTimes(1);
    expect(createdTarget.resize).toHaveBeenCalledWith([640, 360]);
  });

  it("disposes surfaces before the gpu and is idempotent", async () => {
    const order: string[] = [];
    const gpuDouble = createGpuDouble();
    gpuDouble.dispose.mockImplementation(() => order.push("gpu"));
    const surfaceDouble = createSurfaceDouble(order);
    const provider = createToolcraftVgpuProvider({
      init: vi.fn(async () => gpuDouble.gpu),
      navigator: { gpu: {} },
      surface: vi.fn(() => surfaceDouble),
    });
    await provider.whenInitialized();
    provider.createSurface({} as HTMLCanvasElement, [64, 64]);

    provider.dispose();
    provider.dispose();

    expect(order).toEqual(["surface", "gpu"]);
    expect(surfaceDouble.dispose).toHaveBeenCalledTimes(1);
    expect(gpuDouble.dispose).toHaveBeenCalledTimes(1);
    expect(gpuDouble.releaseErrorListener).toHaveBeenCalledTimes(1);
    const operation = vi.fn();
    await expect(
      provider.withExportTarget([16, 16], operation),
    ).rejects.toThrow("disposed");
    expect(operation).not.toHaveBeenCalled();
  });

  it("disposes a gpu that resolves after provider disposal without publishing ready", async () => {
    const pendingGpu = deferred<Gpu>();
    const gpuDouble = createGpuDouble();
    const provider = createToolcraftVgpuProvider({
      init: vi.fn(() => pendingGpu.promise),
      navigator: { gpu: {} },
    });
    const states: string[] = [];
    provider.subscribe((state) => states.push(state.status));

    provider.dispose();
    pendingGpu.resolve(gpuDouble.gpu);
    await provider.whenInitialized();

    expect(gpuDouble.dispose).toHaveBeenCalledTimes(1);
    expect(gpuDouble.onError).not.toHaveBeenCalled();
    expect(provider.getState()).toMatchObject({ status: "disposed" });
    expect(states).not.toContain("ready");
  });

  it("finishes every teardown stage when surface observers throw", async () => {
    const order: string[] = [];
    const surfaceObserverError = new Error("secondary onDestroy observer failed");
    const releaseError = new Error("onDestroy release failed");
    const gpuError = new Error("gpu dispose failed");
    let destroyed = false;
    const throwingSurface = {
      dispose: vi.fn(() => {
        order.push("throwing-surface");
        destroyed = true;
        throw surfaceObserverError;
      }),
      get disposed() {
        return destroyed;
      },
      onDestroy: vi.fn(() => () => {
        order.push("throwing-release");
        throw releaseError;
      }),
    } as unknown as Surface;
    const secondSurface = createSurfaceDouble(order);
    const gpuDouble = createGpuDouble();
    gpuDouble.dispose.mockImplementation(() => {
      order.push("gpu");
      throw gpuError;
    });
    const provider = createToolcraftVgpuProvider({
      init: vi.fn(async () => gpuDouble.gpu),
      navigator: { gpu: {} },
      surface: vi
        .fn()
        .mockReturnValueOnce(throwingSurface)
        .mockReturnValueOnce(secondSurface),
    });
    await provider.whenInitialized();
    provider.createSurface({} as HTMLCanvasElement, [64, 64]);
    provider.createSurface({} as HTMLCanvasElement, [64, 64]);

    let teardownFailure: unknown;
    try {
      provider.dispose();
    } catch (error) {
      teardownFailure = error;
    }
    expect(teardownFailure).toBeInstanceOf(AggregateError);
    expect((teardownFailure as AggregateError).errors).toEqual([
      surfaceObserverError,
      releaseError,
      gpuError,
    ]);
    expect(order).toEqual([
      "throwing-surface",
      "surface",
      "throwing-release",
      "gpu",
    ]);
    expect(() => provider.dispose()).not.toThrow();
    expect(throwingSurface.dispose).toHaveBeenCalledTimes(1);
    expect(secondSurface.dispose).toHaveBeenCalledTimes(1);
    expect(gpuDouble.dispose).toHaveBeenCalledTimes(1);
    expect(gpuDouble.releaseErrorListener).toHaveBeenCalledTimes(1);
  });

  it("preserves registration failure while aggregating cleanup failure", async () => {
    const registrationError = new Error("onDestroy registration failed");
    const cleanupError = new Error("surface cleanup failed");
    const gpuDouble = createGpuDouble();
    const surface = {
      dispose: vi.fn(() => {
        throw cleanupError;
      }),
      disposed: false,
      onDestroy: vi.fn(() => {
        throw registrationError;
      }),
    } as unknown as Surface;
    const provider = createToolcraftVgpuProvider({
      init: vi.fn(async () => gpuDouble.gpu),
      navigator: { gpu: {} },
      surface: vi.fn(() => surface),
    });
    await provider.whenInitialized();

    let caught: unknown;
    try {
      provider.createSurface({} as HTMLCanvasElement, [64, 64]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([
      registrationError,
      cleanupError,
    ]);
    provider.dispose();
    expect(gpuDouble.dispose).toHaveBeenCalledTimes(1);
  });
});
