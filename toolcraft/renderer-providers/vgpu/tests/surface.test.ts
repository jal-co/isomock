import type { Surface } from "vgpu";
import { describe, expect, it, vi } from "vitest";

import {
  createToolcraftVgpuProvider,
  getToolcraftVgpuRuntimeAttributes,
  resolveToolcraftVgpuBackingSize,
  synchronizeToolcraftVgpuSurface,
} from "../../../../src/toolcraft/integrations/vgpu/index";

function createSurfaceDouble(initialSize: readonly [number, number] = [1600, 900]) {
  let disposed = false;
  let destroyListener: (() => void) | undefined;
  let size = initialSize;
  return {
    dispose: vi.fn(() => {
      if (disposed) {
        return;
      }
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
    resize: vi.fn((nextSize: readonly [number, number]) => {
      size = nextSize;
    }),
    get size() {
      return size;
    },
  } as unknown as Surface;
}

describe("Toolcraft VGPU surface", () => {
  it("resolves exact positive backing dimensions once", () => {
    expect(
      resolveToolcraftVgpuBackingSize({
        cssHeight: 450,
        cssWidth: 800,
        devicePixelRatio: 1,
        renderScale: 2,
      }),
    ).toEqual([1600, 900]);
    expect(
      resolveToolcraftVgpuBackingSize({
        cssHeight: 100.25,
        cssWidth: 200.25,
        devicePixelRatio: 1.5,
        renderScale: 2,
      }),
    ).toEqual([601, 301]);
    expect(resolveToolcraftVgpuBackingSize(null)).toBeNull();
    expect(
      resolveToolcraftVgpuBackingSize({
        cssHeight: 0,
        cssWidth: 800,
        devicePixelRatio: 1,
        renderScale: 2,
      }),
    ).toBeNull();
  });

  it("creates one manually-sized surface and resizes only for backing changes", async () => {
    const gpu = {
      dispose: vi.fn(),
      gpu: { lost: new Promise<unknown>(() => undefined) },
      onError: vi.fn(() => vi.fn()),
      settled: vi.fn(async () => undefined),
    };
    const surfaceDouble = createSurfaceDouble();
    const createSurface = vi.fn(() => surfaceDouble);
    const provider = createToolcraftVgpuProvider({
      init: vi.fn(async () => gpu as never),
      navigator: { gpu: {} },
      surface: createSurface,
    });
    await provider.whenInitialized();
    const canvas = { style: { height: "", width: "" } } as HTMLCanvasElement;
    const firstFrame = {
      cssHeight: 450,
      cssWidth: 800,
      devicePixelRatio: 1,
      renderScale: 2,
    } as const;

    const first = synchronizeToolcraftVgpuSurface({
      canvas,
      current: null,
      frame: firstFrame,
      provider,
    });

    expect(createSurface).toHaveBeenCalledWith(gpu, canvas, {
      alphaMode: "premultiplied",
      autoResize: false,
      dpr: 1,
      size: [1600, 900],
    });
    expect(canvas.style.width).toBe("800px");
    expect(canvas.style.height).toBe("450px");

    const unchanged = synchronizeToolcraftVgpuSurface({
      canvas,
      current: first,
      frame: firstFrame,
      provider,
    });
    expect(unchanged).toBe(first);
    expect(surfaceDouble.resize).not.toHaveBeenCalled();

    const resized = synchronizeToolcraftVgpuSurface({
      canvas,
      current: unchanged,
      frame: { ...firstFrame, cssWidth: 801 },
      provider,
    });
    expect(resized?.backingSize).toEqual([1602, 900]);
    expect(surfaceDouble.resize).toHaveBeenCalledTimes(1);
    expect(surfaceDouble.resize).toHaveBeenCalledWith([1602, 900]);
    expect(canvas.style.width).toBe("801px");
  });

  it("creates no surface for unavailable frames and releases an existing one", async () => {
    const gpu = {
      dispose: vi.fn(),
      gpu: { lost: new Promise<unknown>(() => undefined) },
      onError: vi.fn(() => vi.fn()),
      settled: vi.fn(async () => undefined),
    };
    const surfaceDouble = createSurfaceDouble();
    const createSurface = vi.fn(() => surfaceDouble);
    const provider = createToolcraftVgpuProvider({
      init: vi.fn(async () => gpu as never),
      navigator: { gpu: {} },
      surface: createSurface,
    });
    await provider.whenInitialized();
    const canvas = { style: { height: "", width: "" } } as HTMLCanvasElement;

    expect(
      synchronizeToolcraftVgpuSurface({
        canvas,
        current: null,
        frame: null,
        provider,
      }),
    ).toBeNull();
    expect(createSurface).not.toHaveBeenCalled();

    const configured = synchronizeToolcraftVgpuSurface({
      canvas,
      current: null,
      frame: {
        cssHeight: 450,
        cssWidth: 800,
        devicePixelRatio: 1,
        renderScale: 2,
      },
      provider,
    });
    expect(
      synchronizeToolcraftVgpuSurface({
        canvas,
        current: configured,
        frame: null,
        provider,
      }),
    ).toBeNull();
    expect(surfaceDouble.dispose).toHaveBeenCalledTimes(1);
  });

  it("releases churned surfaces once across unavailable and canvas replacement", async () => {
    const gpu = {
      dispose: vi.fn(),
      gpu: { lost: new Promise<unknown>(() => undefined) },
      onError: vi.fn(() => vi.fn()),
      settled: vi.fn(async () => undefined),
    };
    const surfaces = [
      createSurfaceDouble(),
      createSurfaceDouble(),
      createSurfaceDouble(),
    ];
    const provider = createToolcraftVgpuProvider({
      init: vi.fn(async () => gpu as never),
      navigator: { gpu: {} },
      surface: vi
        .fn()
        .mockReturnValueOnce(surfaces[0])
        .mockReturnValueOnce(surfaces[1])
        .mockReturnValueOnce(surfaces[2]),
    });
    await provider.whenInitialized();
    const firstCanvas = { style: { height: "", width: "" } } as HTMLCanvasElement;
    const secondCanvas = { style: { height: "", width: "" } } as HTMLCanvasElement;
    const frame = {
      cssHeight: 450,
      cssWidth: 800,
      devicePixelRatio: 1,
      renderScale: 2,
    } as const;

    const first = synchronizeToolcraftVgpuSurface({
      canvas: firstCanvas,
      current: null,
      frame,
      provider,
    });
    expect(
      synchronizeToolcraftVgpuSurface({
        canvas: firstCanvas,
        current: first,
        frame: null,
        provider,
      }),
    ).toBeNull();
    const second = synchronizeToolcraftVgpuSurface({
      canvas: firstCanvas,
      current: null,
      frame,
      provider,
    });
    const third = synchronizeToolcraftVgpuSurface({
      canvas: secondCanvas,
      current: second,
      frame,
      provider,
    });

    expect(third?.surface).toBe(surfaces[2]);
    provider.dispose();
    expect(
      surfaces.map((surface) => vi.mocked(surface.dispose).mock.calls.length),
    ).toEqual([1, 1, 1]);
  });

  it("preserves the old canvas surface and CSS when replacement creation fails", () => {
    const error = new Error("surface creation failed");
    const oldCanvas = {
      style: { height: "450px", width: "800px" },
    } as HTMLCanvasElement;
    const nextCanvas = { style: { height: "", width: "" } } as HTMLCanvasElement;
    const oldSurface = createSurfaceDouble();
    const current = {
      backingSize: [1600, 900] as const,
      canvas: oldCanvas,
      cssSize: [800, 450] as const,
      surface: oldSurface,
    };

    expect(() =>
      synchronizeToolcraftVgpuSurface({
        canvas: nextCanvas,
        current,
        frame: {
          cssHeight: 500,
          cssWidth: 900,
          devicePixelRatio: 1,
          renderScale: 2,
        },
        provider: {
          createSurface: vi.fn(() => {
            throw error;
          }),
        },
      }),
    ).toThrow(error);
    expect(oldSurface.dispose).not.toHaveBeenCalled();
    expect(oldCanvas.style).toEqual({ height: "450px", width: "800px" });
    expect(nextCanvas.style).toEqual({ height: "", width: "" });
    expect(current.backingSize).toEqual([1600, 900]);
  });

  it("rolls back a mutating resize failure without claiming new CSS or backing", () => {
    const error = new Error("resize failed");
    const canvas = {
      style: { height: "450px", width: "800px" },
    } as HTMLCanvasElement;
    const surface = createSurfaceDouble();
    const resize = vi.mocked(surface.resize);
    resize
      .mockImplementationOnce((nextSize) => {
        Object.defineProperty(surface, "size", { configurable: true, value: nextSize });
        throw error;
      })
      .mockImplementationOnce((previousSize) => {
        Object.defineProperty(surface, "size", {
          configurable: true,
          value: previousSize,
        });
      });
    const current = {
      backingSize: [1600, 900] as const,
      canvas,
      cssSize: [800, 450] as const,
      surface,
    };

    expect(() =>
      synchronizeToolcraftVgpuSurface({
        canvas,
        current,
        frame: {
          cssHeight: 450,
          cssWidth: 801,
          devicePixelRatio: 1,
          renderScale: 2,
        },
        provider: { createSurface: vi.fn() },
      }),
    ).toThrow(error);
    expect(resize).toHaveBeenNthCalledWith(1, [1602, 900]);
    expect(resize).toHaveBeenNthCalledWith(2, [1600, 900]);
    expect(surface.size).toEqual([1600, 900]);
    expect(canvas.style).toEqual({ height: "450px", width: "800px" });
    expect(current.backingSize).toEqual([1600, 900]);
  });
});

describe("Toolcraft VGPU runtime evidence", () => {
  it("publishes provider identity only for a ready provider with a live configured surface", () => {
    const gpu = {} as never;
    const surface = createSurfaceDouble();
    const configured = {
      backingSize: [1600, 900] as const,
      canvas: {} as HTMLCanvasElement,
      cssSize: [800, 450] as const,
      surface,
    };

    expect(
      getToolcraftVgpuRuntimeAttributes(
        { gpu, status: "ready" },
        { mode: "canvas-surface", surface: configured },
      ),
    ).toEqual({
      "data-toolcraft-gpu-backend": "webgpu",
      "data-toolcraft-gpu-backing": "1600x900",
      "data-toolcraft-gpu-presentation": "canvas-surface",
      "data-toolcraft-gpu-provider": "vgpu",
      "data-toolcraft-gpu-status": "ready",
    });
    surface.dispose();
    expect(
      getToolcraftVgpuRuntimeAttributes(
        { gpu, status: "ready" },
        { mode: "canvas-surface", surface: configured },
      ),
    ).toEqual({
      "aria-label": "The VGPU canvas surface is not configured.",
      "data-toolcraft-gpu-status": "surface-unavailable",
    });
  });

  it("withholds ready identity when live surface backing is stale", () => {
    const configured = {
      backingSize: [1600, 900] as const,
      canvas: {} as HTMLCanvasElement,
      cssSize: [800, 450] as const,
      surface: createSurfaceDouble([800, 450]),
    };

    expect(
      getToolcraftVgpuRuntimeAttributes(
        { gpu: {} as never, status: "ready" },
        { mode: "canvas-surface", surface: configured },
      ),
    ).toEqual({
      "aria-label": "The VGPU canvas surface backing does not match the Toolcraft scene.",
      "data-toolcraft-gpu-status": "surface-mismatch",
    });
  });

  it("exposes only status and an accessible message before readiness", () => {
    expect(
      getToolcraftVgpuRuntimeAttributes({
        message: "WebGPU is unavailable in this browser.",
        status: "unsupported",
      }),
    ).toEqual({
      "aria-label": "WebGPU is unavailable in this browser.",
      "data-toolcraft-gpu-status": "unsupported",
    });
    expect(
      getToolcraftVgpuRuntimeAttributes({ status: "initializing" }),
    ).toEqual({
      "aria-label": "The VGPU renderer is initializing.",
      "data-toolcraft-gpu-status": "initializing",
    });
  });
});
