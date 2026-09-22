import {
  init as initializeVgpu,
  surface as createVgpuSurface,
  target as createVgpuTarget,
  type Gpu,
  type Surface,
  type SurfaceCanvas,
  type Target,
} from "vgpu";

import { createToolcraftVgpuExportOwnership } from "./provider-export-ownership";
import { createToolcraftVgpuSurfaceOwnership } from "./provider-resource-ownership";

export type ToolcraftVgpuProviderState =
  | Readonly<{ status: "initializing" }>
  | Readonly<{ gpu: Gpu; status: "ready" }>
  | Readonly<{ message: string; status: "unsupported" }>
  | Readonly<{ message: string; status: "disposed" }>
  | Readonly<{ message: string; reason: unknown; status: "device-lost" }>
  | Readonly<{ error: unknown; message: string; status: "failed" }>;

export type ToolcraftVgpuProviderListener = (
  state: ToolcraftVgpuProviderState,
) => void;

type ToolcraftVgpuNavigator = {
  readonly gpu?: unknown;
};

type ToolcraftVgpuInit = typeof initializeVgpu;
type ToolcraftVgpuSurfaceFactory = typeof createVgpuSurface;
type ToolcraftVgpuTargetFactory = typeof createVgpuTarget;

export type ToolcraftVgpuProviderOptions = {
  readonly init?: ToolcraftVgpuInit;
  readonly navigator?: ToolcraftVgpuNavigator | null;
  readonly onObserverError?: (error: unknown) => void;
  readonly surface?: ToolcraftVgpuSurfaceFactory;
  readonly target?: ToolcraftVgpuTargetFactory;
};

export type ToolcraftVgpuProvider = {
  createSurface(
    canvas: SurfaceCanvas,
    backingSize: readonly [number, number],
  ): Surface;
  dispose(): void;
  getState(): ToolcraftVgpuProviderState;
  subscribe(listener: ToolcraftVgpuProviderListener): () => void;
  withExportTarget<Result>(
    backingSize: readonly [number, number],
    operation: (gpu: Gpu, target: Target) => Result | Promise<Result>,
  ): Promise<Result>;
  whenInitialized(): Promise<ToolcraftVgpuProviderState>;
};

const unsupportedMessage = "WebGPU is unavailable in this browser.";
const initializationFailureMessage = "Unable to initialize the VGPU renderer.";
const runtimeFailureMessage = "The VGPU renderer reported an error.";
const deviceLostMessage = "The WebGPU device was lost.";

function resolveNavigator(
  override: ToolcraftVgpuProviderOptions["navigator"],
): ToolcraftVgpuNavigator | null {
  if (override !== undefined) {
    return override;
  }
  return typeof navigator === "undefined" ? null : navigator;
}

function assertBackingSize(
  value: readonly [number, number],
): asserts value is readonly [number, number] {
  if (
    value.length !== 2 ||
    !value.every((dimension) => Number.isSafeInteger(dimension) && dimension > 0)
  ) {
    throw new RangeError(
      "VGPU backing size must contain two positive integer dimensions.",
    );
  }
}

function freezeState(
  state: ToolcraftVgpuProviderState,
): ToolcraftVgpuProviderState {
  return Object.freeze(state);
}

export function createToolcraftVgpuProvider(
  options: ToolcraftVgpuProviderOptions = {},
): ToolcraftVgpuProvider {
  const init = options.init ?? initializeVgpu;
  const onObserverError = options.onObserverError ?? (() => undefined);
  const surfaceFactory = options.surface ?? createVgpuSurface;
  const targetFactory = options.target ?? createVgpuTarget;
  const listeners = new Set<ToolcraftVgpuProviderListener>();
  const surfaceOwnership = createToolcraftVgpuSurfaceOwnership();
  let state: ToolcraftVgpuProviderState = freezeState({
    status: "initializing",
  });
  let gpu: Gpu | undefined;
  let releaseErrorListener: (() => void) | undefined;
  let disposed = false;

  function publish(nextState: ToolcraftVgpuProviderState) {
    if (disposed) {
      return;
    }
    state = freezeState(nextState);
    for (const listener of [...listeners]) {
      try {
        listener(state);
      } catch (error) {
        try {
          onObserverError(error);
        } catch {
          // Observer diagnostics are intentionally isolated from provider state.
        }
      }
    }
  }

  function readyGpu() {
    if (disposed) {
      throw new Error("The VGPU provider has been disposed.");
    }
    if (state.status !== "ready") {
      throw new Error(
        `The VGPU provider is not ready (status: ${state.status}).`,
      );
    }
    return state.gpu;
  }

  const exportOwnership = createToolcraftVgpuExportOwnership({
    getReadyGpu: readyGpu,
    targetFactory,
  });

  async function initialize(): Promise<ToolcraftVgpuProviderState> {
    if (!resolveNavigator(options.navigator)?.gpu) {
      publish({ message: unsupportedMessage, status: "unsupported" });
      return state;
    }

    let initializedGpu: Gpu;
    try {
      initializedGpu = await init();
    } catch (error) {
      if (!disposed) {
        publish({
          error,
          message: initializationFailureMessage,
          status: "failed",
        });
      }
      return state;
    }

    if (disposed) {
      initializedGpu.dispose();
      return state;
    }

    gpu = initializedGpu;
    releaseErrorListener = initializedGpu.onError((error) => {
      if (state.status === "ready") {
        publish({ error, message: runtimeFailureMessage, status: "failed" });
      }
    });
    // The software adapter implements Gpu without GPUDevice.lost. Browser
    // devices still provide the native loss notification.
    void initializedGpu.gpu.lost?.then(
      (reason) => {
        if (state.status === "ready") {
          publish({ message: deviceLostMessage, reason, status: "device-lost" });
        }
      },
      (error) => {
        if (state.status === "ready") {
          publish({ error, message: runtimeFailureMessage, status: "failed" });
        }
      },
    );
    publish({ gpu: initializedGpu, status: "ready" });

    return state;
  }

  const initialization = Promise.resolve().then(initialize);

  return {
    createSurface(canvas, backingSize) {
      const currentGpu = readyGpu();
      assertBackingSize(backingSize);
      const created = surfaceFactory(currentGpu, canvas, {
        alphaMode: "premultiplied",
        autoResize: false,
        dpr: 1,
        size: [...backingSize],
      });
      return surfaceOwnership.track(created);
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      state = freezeState({
        message: "The VGPU provider has been disposed.",
        status: "disposed",
      });
      listeners.clear();
      const errors = surfaceOwnership.disposeAll();
      const errorRelease = releaseErrorListener;
      const ownedGpu = gpu;
      releaseErrorListener = undefined;
      gpu = undefined;
      exportOwnership.dispose();
      try {
        errorRelease?.();
      } catch (error) {
        errors.push(error);
      }
      try {
        ownedGpu?.dispose();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length === 1) {
        throw errors[0];
      }
      if (errors.length > 1) {
        throw new AggregateError(errors, "VGPU provider teardown failed.");
      }
    },
    getState() {
      return state;
    },
    subscribe(listener) {
      if (disposed) {
        return () => undefined;
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    withExportTarget(backingSize, operation) {
      assertBackingSize(backingSize);
      return exportOwnership.withTarget(backingSize, operation);
    },
    whenInitialized() {
      return initialization;
    },
  };
}
