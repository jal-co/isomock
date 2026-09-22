import type { AnyToolcraftRendererPipelineRegistration } from "./renderer-pipeline-registration";
import {
  createToolcraftRendererPipelineRuntime,
  type ToolcraftRendererPipelineClient,
  type ToolcraftRendererPipelineRuntime,
  type ToolcraftRendererPipelineRuntimeOptions,
  type ToolcraftRendererPipelineSnapshot,
} from "./renderer-pipeline-runtime";
import { registerRendererPipelineRuntimeOwnerInspection } from "./renderer-pipeline-runtime-owner-inspection";

export type ToolcraftRendererPipelineRuntimeOwner = Readonly<{
  acquire: () => () => void;
  client: ToolcraftRendererPipelineClient;
  dispose: () => Promise<void>;
  disposeAutomatically: () => void;
}>;

export type ToolcraftRendererPipelineRuntimeOwnerOptions =
  Omit<ToolcraftRendererPipelineRuntimeOptions, "onCleanupError"> &
    Readonly<{
      onDisposeError?: (error: unknown) => void;
    }>;

function reportDisposeError(error: unknown): void {
  const globalReportError = globalThis.reportError;
  if (typeof globalReportError === "function") {
    try {
      globalReportError(error);
      return;
    } catch (reportingFailure) {
      console.error(
        "Toolcraft renderer pipeline disposal reporting failed.",
        new AggregateError(
          [error, reportingFailure],
          "Toolcraft renderer pipeline fallback reporter failed.",
        ),
      );
      return;
    }
  }
  console.error("Toolcraft renderer pipeline disposal failed.", error);
}

function createUninitializedSnapshot(
  registration: AnyToolcraftRendererPipelineRegistration,
  disposed: boolean,
): ToolcraftRendererPipelineSnapshot {
  const passes = Object.create(null) as Record<
    string,
    ToolcraftRendererPipelineSnapshot["passes"][string]
  >;
  for (const pass of registration.passes) {
    passes[pass.id] = Object.freeze({
      activeResources: 0,
      cacheHits: 0,
      cacheMisses: 0,
      durationMax: 0,
      durationTotal: 0,
      executions: 0,
      resourceCreations: 0,
      resourceDisposals: 0,
      transfers: 0,
    });
  }
  return Object.freeze({
    disposed,
    passes: Object.freeze(passes),
    runtimeId: registration.runtimeId,
  });
}

export function createToolcraftRendererPipelineRuntimeOwner(
  registration: AnyToolcraftRendererPipelineRegistration,
  options: ToolcraftRendererPipelineRuntimeOwnerOptions = {},
): ToolcraftRendererPipelineRuntimeOwner {
  type RuntimeGeneration = {
    automaticReportAttached: boolean;
    disposal?: Promise<void>;
    runtime: ToolcraftRendererPipelineRuntime;
    sequence: number;
  };

  const onDisposeError = options.onDisposeError ?? reportDisposeError;
  const pendingRetirements = new Set<RuntimeGeneration>();
  let currentGeneration: RuntimeGeneration | undefined;
  let lastSnapshot: ToolcraftRendererPipelineSnapshot | undefined;
  let lastSnapshotSequence = 0;
  let leases = 0;
  let lifecycleSchedule = 0;
  let nextGenerationSequence = 1;
  let terminal = false;
  let terminalDisposePromise: Promise<void> | undefined;
  let uninitializedActiveSnapshot: ToolcraftRendererPipelineSnapshot | undefined;
  let uninitializedDisposedSnapshot: ToolcraftRendererPipelineSnapshot | undefined;

  function preserveGenerationSnapshot(generation: RuntimeGeneration): void {
    if (generation.sequence < lastSnapshotSequence) {
      return;
    }
    lastSnapshotSequence = generation.sequence;
    lastSnapshot = generation.runtime.getSnapshot();
  }

  function reportAutomaticDisposalFailure(error: unknown): void {
    try {
      onDisposeError(error);
    } catch (reportingFailure) {
      reportDisposeError(
        new AggregateError(
          [error, reportingFailure],
          `Renderer pipeline runtime owner "${registration.runtimeId}" cleanup and injected reporter both failed.`,
        ),
      );
    }
  }

  const runtimeOptions: ToolcraftRendererPipelineRuntimeOptions = {
    ...(options.now ? { now: options.now } : {}),
    onCleanupError: reportAutomaticDisposalFailure,
  };

  function attachAutomaticReport(generation: RuntimeGeneration): void {
    if (generation.automaticReportAttached || !generation.disposal) {
      return;
    }
    generation.automaticReportAttached = true;
    void generation.disposal.catch(reportAutomaticDisposalFailure);
  }

  function retireGeneration(
    generation: RuntimeGeneration,
    reportAutomatically: boolean,
  ): Promise<void> {
    if (!generation.disposal) {
      if (currentGeneration === generation) {
        currentGeneration = undefined;
      }
      let runtimeDisposal: Promise<void>;
      try {
        runtimeDisposal = generation.runtime.dispose();
      } catch (error) {
        runtimeDisposal = Promise.reject(error);
      }
      generation.disposal = runtimeDisposal;
      pendingRetirements.add(generation);
      preserveGenerationSnapshot(generation);
      void runtimeDisposal.then(
        () => {
          preserveGenerationSnapshot(generation);
          pendingRetirements.delete(generation);
        },
        () => {
          preserveGenerationSnapshot(generation);
          pendingRetirements.delete(generation);
        },
      );
    }
    if (reportAutomatically) {
      attachAutomaticReport(generation);
    }
    return generation.disposal;
  }

  function scheduleLeaseFreeRetirement(generation: RuntimeGeneration): void {
    const scheduled = ++lifecycleSchedule;
    queueMicrotask(() => {
      if (
        !terminal &&
        leases === 0 &&
        lifecycleSchedule === scheduled &&
        currentGeneration === generation
      ) {
        retireGeneration(generation, true);
      }
    });
  }

  function ensureRuntime(): ToolcraftRendererPipelineRuntime {
    if (terminal) {
      throw new Error(
        `Renderer pipeline runtime owner "${registration.runtimeId}" is disposed.`,
      );
    }
    if (!currentGeneration) {
      currentGeneration = {
        automaticReportAttached: false,
        runtime: createToolcraftRendererPipelineRuntime(registration, runtimeOptions),
        sequence: nextGenerationSequence,
      };
      nextGenerationSequence += 1;
      if (leases === 0) {
        scheduleLeaseFreeRetirement(currentGeneration);
      }
    }
    return currentGeneration.runtime;
  }

  function startTerminalDisposal(reportAutomatically: boolean): Promise<void> {
    if (terminalDisposePromise) {
      if (reportAutomatically) {
        for (const generation of pendingRetirements) {
          attachAutomaticReport(generation);
        }
      }
      return terminalDisposePromise;
    }

    let rejectTerminal!: (error: unknown) => void;
    let resolveTerminal!: () => void;
    terminalDisposePromise = new Promise<void>((resolve, reject) => {
      resolveTerminal = resolve;
      rejectTerminal = reject;
    });
    terminal = true;
    lifecycleSchedule += 1;
    if (currentGeneration) {
      retireGeneration(currentGeneration, reportAutomatically);
    }
    const drainingGenerations = [...pendingRetirements];
    if (reportAutomatically) {
      for (const generation of drainingGenerations) {
        attachAutomaticReport(generation);
      }
    }

    void Promise.allSettled(
      drainingGenerations.map((generation) => generation.disposal!),
    ).then((results) => {
      const failures = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (failures.length > 0) {
        rejectTerminal(
          new AggregateError(
            failures,
            `Renderer pipeline runtime owner "${registration.runtimeId}" failed to dispose runtime generations.`,
          ),
        );
      } else {
        resolveTerminal();
      }
    });
    return terminalDisposePromise;
  }

  function acquire(): () => void {
    ensureRuntime();
    const generation = currentGeneration!;
    leases += 1;
    lifecycleSchedule += 1;
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      leases -= 1;
      if (leases === 0) {
        scheduleLeaseFreeRetirement(generation);
      }
    };
  }

  function forwardPromise<T>(
    operation: (runtime: ToolcraftRendererPipelineRuntime) => Promise<T>,
  ): Promise<T> {
    let release: (() => void) | undefined;
    try {
      release = acquire();
      const runtime = currentGeneration!.runtime;
      return operation(runtime).finally(release);
    } catch (error) {
      release?.();
      return Promise.reject(error);
    }
  }

  function forwardInvalidation(
    operation: (
      runtime: ToolcraftRendererPipelineRuntime,
    ) => ReturnType<ToolcraftRendererPipelineClient["invalidatePass"]>,
  ): ReturnType<ToolcraftRendererPipelineClient["invalidatePass"]> {
    const release = acquire();
    try {
      const invalidation = operation(currentGeneration!.runtime);
      const cleanup = invalidation.cleanup.finally(release);
      void cleanup.catch(() => undefined);
      return Object.freeze({ cleanup });
    } catch (error) {
      release();
      throw error;
    }
  }

  function getUninitializedSnapshot(): ToolcraftRendererPipelineSnapshot {
    if (terminal) {
      uninitializedDisposedSnapshot ??= createUninitializedSnapshot(
        registration,
        true,
      );
      return uninitializedDisposedSnapshot;
    }
    uninitializedActiveSnapshot ??= createUninitializedSnapshot(
      registration,
      false,
    );
    return uninitializedActiveSnapshot;
  }

  const runPass: ToolcraftRendererPipelineClient["runPass"] = (
    pass,
    cacheInput,
    work,
  ) => forwardPromise((runtime) => runtime.runPass(pass, cacheInput, work));
  const client: ToolcraftRendererPipelineClient = Object.freeze({
    getSnapshot: () =>
      currentGeneration?.runtime.getSnapshot() ??
      lastSnapshot ??
      getUninitializedSnapshot(),
    invalidatePass: (pass) =>
      forwardInvalidation((runtime) => runtime.invalidatePass(pass)),
    invalidateSource: (sourceKey) =>
      forwardInvalidation((runtime) => runtime.invalidateSource(sourceKey)),
    memoizedCachePolicy: "latest-completed",
    recordTransfer: (pass, count) => {
      const release = acquire();
      try {
        currentGeneration!.runtime.recordTransfer(pass, count);
      } finally {
        release();
      }
    },
    runtimeId: registration.runtimeId,
    runPass,
    subscribe: (listener) => {
      const release = acquire();
      let unsubscribe: (() => void) | undefined;
      try {
        unsubscribe = currentGeneration!.runtime.subscribe(listener);
      } catch (error) {
        release();
        throw error;
      }
      let closed = false;
      return () => {
        if (closed) {
          return;
        }
        closed = true;
        unsubscribe();
        release();
      };
    },
  });

  const owner = Object.freeze({
    acquire,
    client,
    dispose: () => startTerminalDisposal(false),
    disposeAutomatically: () => {
      void startTerminalDisposal(true).catch(() => undefined);
    },
  });
  registerRendererPipelineRuntimeOwnerInspection(
    owner,
    () => pendingRetirements.size + (currentGeneration ? 1 : 0),
  );
  return owner;
}
