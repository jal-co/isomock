import type { ToolcraftRenderPass } from "./renderer-pipeline-registration";
import {
  clearStructuredKeyTrie,
  createStructuredKeyTrie,
  deleteStructuredKeyTrieEntry,
  getStructuredKeyTrieNode,
  type StructuredKeyTrieNode,
} from "./structured-key-trie";

export type RendererPipelineCacheEntry = {
  key: readonly unknown[];
  node?: StructuredKeyTrieNode<RendererPipelineCacheEntry>;
  promise: Promise<unknown>;
  state: "completed" | "pending";
};

export type RendererPipelinePassCache = {
  entries: Set<RendererPipelineCacheEntry>;
  latestRequested?: RendererPipelineCacheEntry;
  root: StructuredKeyTrieNode<RendererPipelineCacheEntry>;
};

export function createRendererPipelinePassCache(): RendererPipelinePassCache {
  return {
    entries: new Set(),
    root: createStructuredKeyTrie(),
  };
}

export function compileRendererPipelineCacheKey(
  definition: ToolcraftRenderPass,
  cache: NonNullable<ToolcraftRenderPass["lifecycle"]>["cache"],
  cacheInput: unknown,
): readonly unknown[] {
  if (cache === "none") {
    if (cacheInput !== undefined) {
      throw new Error(
        `Renderer pipeline pass "${definition.id}" does not accept cache input.`,
      );
    }
    return Object.freeze([]);
  }

  const names = definition.cacheKey;
  if (!names || names.length === 0) {
    throw new Error(
      `Renderer pipeline pass "${definition.id}" requires declared cache key names.`,
    );
  }
  if (
    typeof cacheInput !== "object" ||
    cacheInput === null ||
    Array.isArray(cacheInput)
  ) {
    throw new Error(
      `Renderer pipeline pass "${definition.id}" cache input must be an object with exactly: ${names.join(", ")}.`,
    );
  }
  const ownKeys = Reflect.ownKeys(cacheInput);
  if (
    ownKeys.length !== names.length ||
    ownKeys.some((key) => typeof key !== "string" || !names.includes(key)) ||
    names.some((name) => !Object.hasOwn(cacheInput, name))
  ) {
    throw new Error(
      `Renderer pipeline pass "${definition.id}" cache input must have exactly own keys: ${names.join(", ")}.`,
    );
  }
  const values = cacheInput as Record<string, unknown>;
  return Object.freeze(names.map((name) => values[name]));
}

export function findRendererPipelineCacheEntry(
  cache: RendererPipelinePassCache,
  key: readonly unknown[],
): RendererPipelineCacheEntry | undefined {
  return getStructuredKeyTrieNode(cache.root, key, false)?.entry;
}

function removeEntry(
  cache: RendererPipelinePassCache,
  entry: RendererPipelineCacheEntry,
): void {
  if (entry.node) {
    deleteStructuredKeyTrieEntry(cache.root, entry.node, entry);
    delete entry.node;
  }
  entry.key = Object.freeze([]);
  cache.entries.delete(entry);
  if (cache.latestRequested === entry) {
    delete cache.latestRequested;
  }
}

function evictEntries(
  cache: RendererPipelinePassCache,
  predicate: (entry: RendererPipelineCacheEntry) => boolean,
): void {
  for (const entry of [...cache.entries]) {
    if (predicate(entry)) {
      removeEntry(cache, entry);
    }
  }
}

export function recordRendererPipelineCacheHit(
  cache: RendererPipelinePassCache,
  entry: RendererPipelineCacheEntry,
): void {
  cache.latestRequested = entry;
  if (entry.state === "completed") {
    evictEntries(
      cache,
      (candidate) => candidate !== entry && candidate.state === "completed",
    );
  }
}

export function insertRendererPipelineCacheEntry(
  cache: RendererPipelinePassCache,
  key: readonly unknown[],
  promise: Promise<unknown>,
): RendererPipelineCacheEntry {
  const node = getStructuredKeyTrieNode(cache.root, key, true)!;
  const entry: RendererPipelineCacheEntry = {
    key: Object.freeze([...key]),
    node,
    promise,
    state: "pending",
  };
  node.entry = entry;
  cache.entries.add(entry);
  cache.latestRequested = entry;
  return entry;
}

export function completeRendererPipelineCacheEntry(
  cache: RendererPipelinePassCache,
  entry: RendererPipelineCacheEntry,
): void {
  entry.state = "completed";
  if (cache.latestRequested === entry) {
    evictEntries(
      cache,
      (candidate) => candidate !== entry && candidate.state === "completed",
    );
  } else {
    removeEntry(cache, entry);
  }
}

export function rejectRendererPipelineCacheEntry(
  cache: RendererPipelinePassCache,
  entry: RendererPipelineCacheEntry,
): void {
  removeEntry(cache, entry);
}

export function invalidateRendererPipelineCache(
  cache: RendererPipelinePassCache,
  predicate: (entry: RendererPipelineCacheEntry) => boolean,
): void {
  evictEntries(cache, predicate);
}

export function clearRendererPipelineCache(
  cache: RendererPipelinePassCache,
): void {
  evictEntries(cache, () => true);
  clearStructuredKeyTrie(cache.root);
}
