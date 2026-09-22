import {
  getToolcraftRendererPipelinePassDefinition,
  isToolcraftRendererPipelineRegistration,
  type AnyToolcraftRendererPipelineRegistration,
  type ToolcraftRenderPass,
  type ToolcraftRendererPipelinePassCacheInput,
  type ToolcraftRendererPipelinePassHandle,
  type ToolcraftRendererPipelinePassResource,
  type ToolcraftRendererPipelinePassResourceKey,
  type ToolcraftRendererPipelinePassResult,
} from "./renderer-pipeline-registration";
import {
  compileRendererPipelineCacheKey,
  completeRendererPipelineCacheEntry,
  findRendererPipelineCacheEntry,
  insertRendererPipelineCacheEntry,
  recordRendererPipelineCacheHit,
  rejectRendererPipelineCacheEntry,
  type RendererPipelineCacheEntry,
} from "./renderer-pipeline-cache";
import {
  acquireRendererPipelineExecutionLease,
  createRendererPipelinePassGeneration,
  getOrCreateRendererPipelineGenerationResource,
  rendererPipelineGenerationContainsSource,
  retireRendererPipelinePassGeneration,
  type RendererPipelinePassGeneration,
} from "./renderer-pipeline-pass-generation";

type AnyPassHandle = ToolcraftRendererPipelinePassHandle<string, any, any, any>;

export type ToolcraftRendererPipelinePassSnapshot = Readonly<{
  activeResources: number;
  cacheHits: number;
  cacheMisses: number;
  durationMax: number;
  durationTotal: number;
  executions: number;
  resourceCreations: number;
  resourceDisposals: number;
  transfers: number;
}>;

export type ToolcraftRendererPipelineSnapshot = Readonly<{
  disposed: boolean;
  passes: Readonly<Record<string, ToolcraftRendererPipelinePassSnapshot>>;
  runtimeId: string;
}>;

export type ToolcraftRendererPipelineRuntimeOptions = Readonly<{
  now?: () => number;
  onCleanupError?: (error: unknown) => void;
}>;

export type ToolcraftRendererPipelineInvalidation = Readonly<{
  /** Resolves after old execution leases finish and all old resources retire. */
  cleanup: Promise<void>;
}>;

type PassCounters = {
  activeResources: number;
  cacheHits: number;
  cacheMisses: number;
  durationMax: number;
  durationTotal: number;
  executions: number;
  resourceCreations: number;
  resourceDisposals: number;
  transfers: number;
};

type CompiledPass = {
  cache: NonNullable<ToolcraftRenderPass["lifecycle"]>["cache"];
  counters: PassCounters;
  currentGeneration: RendererPipelinePassGeneration;
  definition: ToolcraftRenderPass;
  handle: AnyPassHandle;
  retiredBarriers: Set<Promise<void>>;
};

type ResourceExecutionContext<Handle extends AnyPassHandle> = [
  ToolcraftRendererPipelinePassResource<Handle>,
] extends [never]
  ? Readonly<Record<never, never>>
  : Readonly<{
      getOrCreateResource: (
        resourceKey: NoInfer<
          ToolcraftRendererPipelinePassResourceKey<Handle>
        >,
        create: () =>
          | PromiseLike<NoInfer<ToolcraftRendererPipelinePassResource<Handle>>>
          | NoInfer<ToolcraftRendererPipelinePassResource<Handle>>,
        dispose: (
          resource: NoInfer<ToolcraftRendererPipelinePassResource<Handle>>,
        ) => PromiseLike<void> | void,
      ) => Promise<ToolcraftRendererPipelinePassResource<Handle>>;
    }>;

export type ToolcraftRendererPipelinePassExecutionContext<
  Handle extends AnyPassHandle = AnyPassHandle,
> = Readonly<{
  /** Releases this execution lease, retires its generation, and returns an awaitable cleanup barrier. */
  invalidatePass: () => ToolcraftRendererPipelineInvalidation;
  /** Releases this execution lease when its generation contains the source, then retires every matching generation. */
  invalidateSource: (sourceKey: unknown) => ToolcraftRendererPipelineInvalidation;
}> &
  ResourceExecutionContext<Handle>;

export type ToolcraftRendererPipelineClient = Readonly<{
  getSnapshot: () => ToolcraftRendererPipelineSnapshot;
  /** External invalidation swaps immediately; active pass work must use its context helper before awaiting cleanup. */
  invalidatePass: (pass: AnyPassHandle) => ToolcraftRendererPipelineInvalidation;
  /** External invalidation swaps matching generations; active pass work must use its context helper before awaiting cleanup. */
  invalidateSource: (sourceKey: unknown) => ToolcraftRendererPipelineInvalidation;
  /** At most the latest completed key plus still-pending keys are retained. */
  readonly memoizedCachePolicy: "latest-completed";
  recordTransfer: (pass: AnyPassHandle, count?: number) => void;
  readonly runtimeId: string;
  runPass: <Handle extends AnyPassHandle>(
    pass: Handle,
    cacheInput: NoInfer<ToolcraftRendererPipelinePassCacheInput<Handle>>,
    work: (
      context: ToolcraftRendererPipelinePassExecutionContext<Handle>,
    ) =>
      | PromiseLike<NoInfer<ToolcraftRendererPipelinePassResult<Handle>>>
      | NoInfer<ToolcraftRendererPipelinePassResult<Handle>>,
  ) => Promise<ToolcraftRendererPipelinePassResult<Handle>>;
  subscribe: (listener: () => void) => () => void;
}>;

export type ToolcraftRendererPipelineRuntime = Readonly<
  ToolcraftRendererPipelineClient & {
    dispose: () => Promise<void>;
  }
>;

const emptyCounters = (): PassCounters => ({
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

function createSnapshot(
  runtimeId: string,
  order: readonly CompiledPass[],
  disposed: boolean,
): ToolcraftRendererPipelineSnapshot {
  const passSnapshots: Record<string, ToolcraftRendererPipelinePassSnapshot> =
    Object.create(null) as Record<string, ToolcraftRendererPipelinePassSnapshot>;
  for (const pass of order) {
    passSnapshots[pass.definition.id] = Object.freeze({ ...pass.counters });
  }
  return Object.freeze({
    disposed,
    passes: Object.freeze(passSnapshots),
    runtimeId,
  });
}

function getDuration(start: number, end: number): number {
  const duration = end - start;
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

function getRejectedReasons(
  results: readonly PromiseSettledResult<unknown>[],
): unknown[] {
  return results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
}

function reportCleanupError(error: unknown): void {
  const globalReportError = globalThis.reportError;
  if (typeof globalReportError === "function") {
    try {
      globalReportError(error);
      return;
    } catch (reportingFailure) {
      console.error(
        "Toolcraft renderer pipeline cleanup reporting failed.",
        new AggregateError(
          [error, reportingFailure],
          "Toolcraft renderer pipeline cleanup and fallback reporter both failed.",
        ),
      );
      return;
    }
  }
  console.error("Toolcraft renderer pipeline cleanup failed.", error);
}

export function createToolcraftRendererPipelineRuntime(
  registration: AnyToolcraftRendererPipelineRegistration,
  options: ToolcraftRendererPipelineRuntimeOptions = {},
): ToolcraftRendererPipelineRuntime {
  if (!isToolcraftRendererPipelineRegistration(registration)) {
    throw new Error(
      "Renderer pipeline runtime requires a compiled executable registration.",
    );
  }

  const runtimeId = registration.runtimeId;
  const now = options.now ?? (() => performance.now());
  const listeners = new Set<() => void>();
  const observedRetiredCleanups = new WeakSet<Promise<void>>();
  const reportedRetiredCleanups = new WeakSet<Promise<void>>();
  const passes: CompiledPass[] = [];
  let disposed = false;
  let disposePromise: Promise<void> | undefined;
  let snapshot!: ToolcraftRendererPipelineSnapshot;

  function publish(): void {
    snapshot = createSnapshot(runtimeId, passes, disposed);
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // Evidence observers cannot interrupt renderer lifecycle operations.
      }
    }
  }

  function createGeneration(pass: CompiledPass): RendererPipelinePassGeneration {
    return createRendererPipelinePassGeneration(pass.definition, {
      onResourceCreation: () => {
        pass.counters.activeResources += 1;
        pass.counters.resourceCreations += 1;
        publish();
      },
      onResourceDisposal: () => {
        pass.counters.activeResources -= 1;
        pass.counters.resourceDisposals += 1;
        publish();
      },
    });
  }

  for (const definition of registration.passes) {
    const pass = {
      cache:
        definition.lifecycle?.cache ??
        (definition.cacheKey ? "memoized" : "none"),
      counters: emptyCounters(),
      currentGeneration: undefined as unknown as RendererPipelinePassGeneration,
      definition,
      handle: registration.getPass(definition.id),
      retiredBarriers: new Set<Promise<void>>(),
    } satisfies CompiledPass;
    pass.currentGeneration = createGeneration(pass);
    passes.push(pass);
  }
  const passesByHandle = new Map(passes.map((pass) => [pass.handle, pass]));
  snapshot = createSnapshot(runtimeId, passes, false);

  function assertActive(): void {
    if (disposed) {
      throw new Error(`Renderer pipeline runtime "${runtimeId}" is disposed.`);
    }
  }

  function getPass(handle: AnyPassHandle): CompiledPass {
    getToolcraftRendererPipelinePassDefinition(registration, handle);
    const pass = passesByHandle.get(handle);
    if (!pass) {
      throw new Error(
        `Renderer pipeline pass "${handle.id}" does not belong to registration "${runtimeId}".`,
      );
    }
    return pass;
  }

  function reportDeferredCleanupFailure(error: unknown): void {
    if (!options.onCleanupError) {
      reportCleanupError(error);
      return;
    }
    try {
      options.onCleanupError(error);
    } catch (reportingFailure) {
      reportCleanupError(
        new AggregateError(
          [error, reportingFailure],
          `Renderer pipeline runtime "${runtimeId}" cleanup and injected reporter both failed.`,
        ),
      );
    }
  }

  function observeRetiredCleanup(
    pass: CompiledPass,
    cleanup: Promise<void>,
    reportFailure: boolean,
  ): void {
    if (!observedRetiredCleanups.has(cleanup)) {
      observedRetiredCleanups.add(cleanup);
      const barrier = cleanup.then(
        () => undefined,
        () => undefined,
      );
      pass.retiredBarriers.add(barrier);
      void barrier.finally(() => pass.retiredBarriers.delete(barrier));
    }
    if (reportFailure && claimRetiredCleanupReporting(cleanup)) {
      void cleanup.catch(reportDeferredCleanupFailure);
    }
  }

  function claimRetiredCleanupReporting(cleanup: Promise<void>): boolean {
    if (reportedRetiredCleanups.has(cleanup)) {
      return false;
    }
    reportedRetiredCleanups.add(cleanup);
    return true;
  }

  function invalidationFor(
    pass: CompiledPass,
    generation: RendererPipelinePassGeneration,
    replaceCurrent: boolean,
    reportFailure = true,
  ): ToolcraftRendererPipelineInvalidation {
    if (replaceCurrent && pass.currentGeneration === generation && !disposed) {
      const replacement = createGeneration(pass);
      const cleanup = retireRendererPipelinePassGeneration(generation);
      pass.currentGeneration = replacement;
      observeRetiredCleanup(pass, cleanup, reportFailure);
      return Object.freeze({ cleanup });
    }
    const cleanup = retireRendererPipelinePassGeneration(generation);
    observeRetiredCleanup(pass, cleanup, reportFailure);
    return Object.freeze({ cleanup });
  }

  function runPass<Handle extends AnyPassHandle>(
    handle: Handle,
    cacheInput: NoInfer<ToolcraftRendererPipelinePassCacheInput<Handle>>,
    work: (
      context: ToolcraftRendererPipelinePassExecutionContext<Handle>,
    ) =>
      | PromiseLike<NoInfer<ToolcraftRendererPipelinePassResult<Handle>>>
      | NoInfer<ToolcraftRendererPipelinePassResult<Handle>>,
  ): Promise<ToolcraftRendererPipelinePassResult<Handle>> {
    let pass: CompiledPass;
    let cacheKey: readonly unknown[];
    try {
      assertActive();
      pass = getPass(handle);
      cacheKey = compileRendererPipelineCacheKey(
        pass.definition,
        pass.cache,
        cacheInput,
      );
    } catch (error) {
      return Promise.reject(error);
    }

    const generation = pass.currentGeneration;
    const executionSourceKeys = new Set(cacheKey);
    if (pass.cache !== "none") {
      const existing = findRendererPipelineCacheEntry(
        generation.cacheState,
        cacheKey,
      );
      if (existing) {
        recordRendererPipelineCacheHit(generation.cacheState, existing);
        pass.counters.cacheHits += 1;
        publish();
        return existing.promise as Promise<
          ToolcraftRendererPipelinePassResult<Handle>
        >;
      }
    }

    const lease = acquireRendererPipelineExecutionLease(generation);
    let cacheEntry: RendererPipelineCacheEntry | undefined;
    let rejectWork!: (error: unknown) => void;
    let resolveWork!: (value: unknown) => void;
    const startedAt = now();
    const workInput = new Promise<unknown>((resolve, reject) => {
      resolveWork = resolve;
      rejectWork = reject;
    });
    const execution = workInput.then(
      (value) => {
        const duration = getDuration(startedAt, now());
        pass.counters.durationTotal += duration;
        pass.counters.durationMax = Math.max(pass.counters.durationMax, duration);
        if (cacheEntry) {
          completeRendererPipelineCacheEntry(generation.cacheState, cacheEntry);
        }
        publish();
        return value;
      },
      (error: unknown) => {
        const duration = getDuration(startedAt, now());
        pass.counters.durationTotal += duration;
        pass.counters.durationMax = Math.max(pass.counters.durationMax, duration);
        if (cacheEntry) {
          rejectRendererPipelineCacheEntry(generation.cacheState, cacheEntry);
        }
        publish();
        throw error;
      },
    );
    void execution.then(lease.release, lease.release);

    if (pass.cache !== "none") {
      cacheEntry = insertRendererPipelineCacheEntry(
        generation.cacheState,
        cacheKey,
        execution,
      );
    }
    pass.counters.cacheMisses += 1;
    pass.counters.executions += 1;
    publish();

    const contextValue: Record<string, unknown> = {
      invalidatePass: () => {
        lease.release();
        return invalidationFor(
          pass,
          generation,
          pass.currentGeneration === generation,
        );
      },
      invalidateSource: (sourceKey: unknown) => {
        const executionGenerationWasCurrent =
          pass.currentGeneration === generation;
        const invalidatesExecutionGeneration =
          executionSourceKeys.has(sourceKey) ||
          (executionGenerationWasCurrent &&
            rendererPipelineGenerationContainsSource(generation, sourceKey));
        if (invalidatesExecutionGeneration) {
          lease.release();
        }
        const needsCapturedGenerationCleanup =
          invalidatesExecutionGeneration && !executionGenerationWasCurrent;
        const cleanups = collectSourceInvalidationCleanups(sourceKey);
        if (needsCapturedGenerationCleanup) {
          cleanups.push(
            invalidationFor(pass, generation, false, false).cleanup,
          );
        }
        return createSourceInvalidation(cleanups);
      },
    };
    if (pass.cache === "retained-resource") {
      contextValue.getOrCreateResource = (
        resourceKey: readonly unknown[],
        create: () => PromiseLike<unknown> | unknown,
        disposeResource: (resource: unknown) => PromiseLike<void> | void,
      ) => {
        if (pass.definition.lifecycle?.resourceScope === "source") {
          for (const keyPart of resourceKey) {
            executionSourceKeys.add(keyPart);
          }
        }
        return getOrCreateRendererPipelineGenerationResource(
          generation,
          resourceKey,
          create,
          disposeResource,
        );
      };
    }
    const context = Object.freeze(
      contextValue,
    ) as ToolcraftRendererPipelinePassExecutionContext<Handle>;
    try {
      resolveWork(work(context));
    } catch (error) {
      rejectWork(error);
    }
    return execution as Promise<ToolcraftRendererPipelinePassResult<Handle>>;
  }

  function invalidatePass(
    handle: AnyPassHandle,
  ): ToolcraftRendererPipelineInvalidation {
    assertActive();
    const pass = getPass(handle);
    return invalidationFor(pass, pass.currentGeneration, true);
  }

  function invalidateSource(
    sourceKey: unknown,
  ): ToolcraftRendererPipelineInvalidation {
    assertActive();
    return createSourceInvalidation(
      collectSourceInvalidationCleanups(sourceKey),
    );
  }

  function collectSourceInvalidationCleanups(
    sourceKey: unknown,
  ): Promise<void>[] {
    const cleanups: Promise<void>[] = [];
    for (const pass of passes) {
      const generation = pass.currentGeneration;
      if (rendererPipelineGenerationContainsSource(generation, sourceKey)) {
        cleanups.push(
          invalidationFor(pass, generation, true, false).cleanup,
        );
      }
    }
    return cleanups;
  }

  function createSourceInvalidation(
    cleanups: readonly Promise<void>[],
  ): ToolcraftRendererPipelineInvalidation {
    const uniqueCleanups = [...new Set(cleanups)];
    const aggregate = (selected: readonly Promise<void>[]) => Promise.allSettled(selected).then((results) => {
      const failures = getRejectedReasons(results);
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          `Renderer pipeline source invalidation failed to clean up ${failures.length} pass${failures.length === 1 ? "" : "es"}.`,
        );
      }
    });
    const cleanup = aggregate(uniqueCleanups);
    const reportableCleanups = uniqueCleanups.filter(
      claimRetiredCleanupReporting,
    );
    if (reportableCleanups.length > 0) {
      const reportingCleanup =
        reportableCleanups.length === uniqueCleanups.length
          ? cleanup
          : aggregate(reportableCleanups);
      void reportingCleanup.catch(reportDeferredCleanupFailure);
    }
    return Object.freeze({ cleanup });
  }

  function recordTransfer(handle: AnyPassHandle, count = 1): void {
    assertActive();
    const pass = getPass(handle);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(
        "Renderer pipeline transfer count must be a finite non-negative integer.",
      );
    }
    const nextTotal = pass.counters.transfers + count;
    if (!Number.isSafeInteger(nextTotal)) {
      throw new Error(
        "Renderer pipeline transfer total must remain a safe integer.",
      );
    }
    pass.counters.transfers = nextTotal;
    publish();
  }

  function dispose(): Promise<void> {
    if (disposePromise) {
      return disposePromise;
    }

    let rejectDisposal!: (error: unknown) => void;
    let resolveDisposal!: () => void;
    disposePromise = new Promise<void>((resolve, reject) => {
      resolveDisposal = resolve;
      rejectDisposal = reject;
    });
    disposed = true;
    const cleanups = passes.map((pass) =>
      retireRendererPipelinePassGeneration(pass.currentGeneration),
    );
    const priorBarriers = passes.flatMap((pass) => [...pass.retiredBarriers]);
    publish();

    void (async () => {
      const results = await Promise.allSettled(cleanups);
      await Promise.allSettled(priorBarriers);
      listeners.clear();
      snapshot = createSnapshot(runtimeId, passes, true);
      const failures = getRejectedReasons(results);
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          `Renderer pipeline runtime "${runtimeId}" failed to dispose resources.`,
        );
      }
    })().then(resolveDisposal, rejectDisposal);
    return disposePromise;
  }

  return Object.freeze({
    dispose,
    getSnapshot: () => snapshot,
    invalidatePass,
    invalidateSource,
    memoizedCachePolicy: "latest-completed",
    recordTransfer,
    runtimeId,
    runPass,
    subscribe(listener: () => void) {
      assertActive();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}
