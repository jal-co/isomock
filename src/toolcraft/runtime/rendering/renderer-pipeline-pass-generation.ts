import type { ToolcraftRenderPass } from "./renderer-pipeline-registration";
import {
  clearRendererPipelineCache,
  createRendererPipelinePassCache,
  type RendererPipelinePassCache,
} from "./renderer-pipeline-cache";
import {
  clearStructuredKeyTrie,
  createStructuredKeyTrie,
  deleteStructuredKeyTrieEntry,
  getStructuredKeyTrieNode,
  type StructuredKeyTrieNode,
} from "./structured-key-trie";

type ResourceEntry = {
  dispose: (resource: unknown) => PromiseLike<void> | void;
  disposePromise?: Promise<void>;
  key: readonly unknown[];
  node?: StructuredKeyTrieNode<ResourceEntry>;
  promise: Promise<unknown>;
};

type ExecutionLease = Readonly<{
  barrier: Promise<void>;
  release: () => void;
}>;

export type RendererPipelinePassGenerationHooks = Readonly<{
  onResourceCreation: () => void;
  onResourceDisposal: () => void;
}>;

export type RendererPipelinePassGeneration = {
  accepting: boolean;
  readonly cacheState: RendererPipelinePassCache;
  cleanup?: Promise<void>;
  readonly definition: ToolcraftRenderPass;
  readonly executionLeases: Set<ExecutionLease>;
  readonly hooks: RendererPipelinePassGenerationHooks;
  readonly resourceEntries: Set<ResourceEntry>;
  readonly resourceRoot: StructuredKeyTrieNode<ResourceEntry>;
};

function describeResourceKey(key: readonly unknown[]): string {
  try {
    return JSON.stringify(key) ?? "[unserializable key]";
  } catch {
    return "[unserializable key]";
  }
}

function removeResourceEntry(
  generation: RendererPipelinePassGeneration,
  entry: ResourceEntry,
): void {
  if (entry.node) {
    deleteStructuredKeyTrieEntry(generation.resourceRoot, entry.node, entry);
    delete entry.node;
  }
  entry.key = Object.freeze([]);
  generation.resourceEntries.delete(entry);
}

function disposeResourceEntry(
  generation: RendererPipelinePassGeneration,
  entry: ResourceEntry,
): Promise<void> {
  if (entry.disposePromise) {
    return entry.disposePromise;
  }

  const resourceKey = describeResourceKey(entry.key);
  removeResourceEntry(generation, entry);
  entry.disposePromise = entry.promise
    .then(
      async (resource) => {
        await entry.dispose(resource);
        generation.hooks.onResourceDisposal();
      },
      () => undefined,
    )
    .catch((cause: unknown) => {
      throw new Error(
        `Renderer pipeline pass "${generation.definition.id}" resource ${resourceKey} failed to dispose.`,
        { cause },
      );
    });
  return entry.disposePromise;
}

export function createRendererPipelinePassGeneration(
  definition: ToolcraftRenderPass,
  hooks: RendererPipelinePassGenerationHooks,
): RendererPipelinePassGeneration {
  return {
    accepting: true,
    cacheState: createRendererPipelinePassCache(),
    definition,
    executionLeases: new Set(),
    hooks,
    resourceEntries: new Set(),
    resourceRoot: createStructuredKeyTrie(),
  };
}

export function acquireRendererPipelineExecutionLease(
  generation: RendererPipelinePassGeneration,
): ExecutionLease {
  if (!generation.accepting) {
    throw new Error(
      `Renderer pipeline pass "${generation.definition.id}" generation is retired.`,
    );
  }

  let released = false;
  let resolveBarrier!: () => void;
  const lease: ExecutionLease = Object.freeze({
    barrier: new Promise<void>((resolve) => {
      resolveBarrier = resolve;
    }),
    release: () => {
      if (released) {
        return;
      }
      released = true;
      generation.executionLeases.delete(lease);
      resolveBarrier();
    },
  });
  generation.executionLeases.add(lease);
  return lease;
}

export function getOrCreateRendererPipelineGenerationResource(
  generation: RendererPipelinePassGeneration,
  resourceKey: readonly unknown[],
  create: () => PromiseLike<unknown> | unknown,
  dispose: (resource: unknown) => PromiseLike<void> | void,
): Promise<unknown> {
  if (!generation.accepting) {
    return Promise.reject(
      new Error(
        `Renderer pipeline pass "${generation.definition.id}" generation is retired.`,
      ),
    );
  }
  if (!Array.isArray(resourceKey)) {
    return Promise.reject(
      new Error(
        `Renderer pipeline pass "${generation.definition.id}" resource key must be an array.`,
      ),
    );
  }

  const node = getStructuredKeyTrieNode(
    generation.resourceRoot,
    resourceKey,
    true,
  )!;
  if (node.entry) {
    return node.entry.promise;
  }

  let entry!: ResourceEntry;
  let rejectCreation!: (error: unknown) => void;
  let resolveCreation!: (resource: unknown) => void;
  const input = new Promise<unknown>((resolve, reject) => {
    resolveCreation = resolve;
    rejectCreation = reject;
  });
  const promise = input.then(
    (resource) => {
      generation.hooks.onResourceCreation();
      return resource;
    },
    (error: unknown) => {
      removeResourceEntry(generation, entry);
      throw error;
    },
  );
  entry = {
    dispose,
    key: Object.freeze([...resourceKey]),
    node,
    promise,
  };
  node.entry = entry;
  generation.resourceEntries.add(entry);

  try {
    resolveCreation(create());
  } catch (error) {
    rejectCreation(error);
  }
  return promise;
}

function sameValueZero(left: unknown, right: unknown): boolean {
  return left === right || (left !== left && right !== right);
}

function keyContains(key: readonly unknown[], sourceKey: unknown): boolean {
  return key.some((part) => sameValueZero(part, sourceKey));
}

export function rendererPipelineGenerationContainsSource(
  generation: RendererPipelinePassGeneration,
  sourceKey: unknown,
): boolean {
  if (
    [...generation.cacheState.entries].some((entry) =>
      keyContains(entry.key, sourceKey),
    )
  ) {
    return true;
  }
  return (
    generation.definition.lifecycle?.resourceScope === "source" &&
    [...generation.resourceEntries].some((entry) =>
      keyContains(entry.key, sourceKey),
    )
  );
}

export function retireRendererPipelinePassGeneration(
  generation: RendererPipelinePassGeneration,
): Promise<void> {
  if (generation.cleanup) {
    return generation.cleanup;
  }

  generation.accepting = false;
  clearRendererPipelineCache(generation.cacheState);

  let rejectCleanup!: (error: unknown) => void;
  let resolveCleanup!: () => void;
  const cleanup = new Promise<void>((resolve, reject) => {
    resolveCleanup = resolve;
    rejectCleanup = reject;
  });
  generation.cleanup = cleanup;

  void (async () => {
    while (generation.executionLeases.size > 0) {
      await Promise.allSettled(
        [...generation.executionLeases].map((lease) => lease.barrier),
      );
    }

    const resources = [...generation.resourceEntries];
    const results = await Promise.allSettled(
      resources.map((entry) => disposeResourceEntry(generation, entry)),
    );
    clearStructuredKeyTrie(generation.resourceRoot);
    const failures = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `Renderer pipeline pass "${generation.definition.id}" generation failed to dispose ${failures.length} resource${failures.length === 1 ? "" : "s"}.`,
      );
    }
  })().then(resolveCleanup, rejectCleanup);

  return cleanup;
}
