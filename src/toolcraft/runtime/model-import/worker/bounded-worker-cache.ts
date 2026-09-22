type CacheEntryToken = object;

type CoordinatedEntry = Readonly<{
  byteLength: number;
  evict: () => void;
}>;

export type ToolcraftWorkerCacheCoordinator = Readonly<{
  maxAggregateBytes: number;
  release: (token: CacheEntryToken) => void;
  reserve: (
    token: CacheEntryToken,
    byteLength: number,
    evict: () => void,
  ) => boolean;
  retainedBytes: () => number;
  touch: (token: CacheEntryToken) => void;
}>;

export function createToolcraftWorkerCacheCoordinator(options: Readonly<{
  maxAggregateBytes: number;
}>): ToolcraftWorkerCacheCoordinator {
  if (!Number.isSafeInteger(options.maxAggregateBytes) ||
      options.maxAggregateBytes <= 0) {
    throw new Error(
      "Worker cache maxAggregateBytes must be a finite positive safe integer.",
    );
  }
  const entries = new Map<CacheEntryToken, CoordinatedEntry>();
  let retainedBytes = 0;

  const release = (token: CacheEntryToken): void => {
    const entry = entries.get(token);
    if (!entry) return;
    entries.delete(token);
    retainedBytes -= entry.byteLength;
  };

  return Object.freeze({
    maxAggregateBytes: options.maxAggregateBytes,
    release,
    reserve: (token, byteLength, evict) => {
      if (!Number.isSafeInteger(byteLength) || byteLength < 0 ||
          byteLength > options.maxAggregateBytes) return false;
      release(token);
      entries.set(token, { byteLength, evict });
      retainedBytes += byteLength;
      while (retainedBytes > options.maxAggregateBytes) {
        const oldest = entries.entries().next().value as
          | [CacheEntryToken, CoordinatedEntry]
          | undefined;
        if (!oldest) break;
        const [oldestToken, oldestEntry] = oldest;
        entries.delete(oldestToken);
        retainedBytes -= oldestEntry.byteLength;
        oldestEntry.evict();
      }
      return entries.has(token);
    },
    retainedBytes: () => retainedBytes,
    touch: (token) => {
      const entry = entries.get(token);
      if (!entry) return;
      entries.delete(token);
      entries.set(token, entry);
    },
  });
}

export type ToolcraftBoundedWorkerCache<Value> = Readonly<{
  clear: () => void;
  dispose: () => void;
  get: (key: string) => Value | undefined;
  set: (key: string, value: Value) => void;
  size: () => number;
}>;

type LocalEntry<Value> = Readonly<{
  byteLength: number;
  token: CacheEntryToken;
  value: Value;
}>;

export function createToolcraftBoundedWorkerCache<Value>(options: Readonly<{
  coordinator: ToolcraftWorkerCacheCoordinator;
  maxEntries: number;
  sizeOf: (value: Value) => number;
}>): ToolcraftBoundedWorkerCache<Value> {
  if (!Number.isSafeInteger(options.maxEntries) || options.maxEntries <= 0) {
    throw new Error(
      "Bounded worker cache maxEntries must be a finite positive safe integer.",
    );
  }
  if (typeof options.sizeOf !== "function") {
    throw new Error("Bounded worker cache sizeOf must be a function.");
  }
  const entries = new Map<string, LocalEntry<Value>>();
  let disposed = false;

  const remove = (key: string): void => {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    options.coordinator.release(entry.token);
  };
  const clear = (): void => {
    for (const key of [...entries.keys()]) remove(key);
  };

  return Object.freeze({
    clear,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      clear();
    },
    get: (key) => {
      if (disposed) return undefined;
      const entry = entries.get(key);
      if (!entry) return undefined;
      entries.delete(key);
      entries.set(key, entry);
      options.coordinator.touch(entry.token);
      return entry.value;
    },
    set: (key, value) => {
      if (disposed) return;
      const byteLength = options.sizeOf(value);
      if (!Number.isSafeInteger(byteLength) || byteLength < 0 ||
          byteLength > options.coordinator.maxAggregateBytes) return;
      remove(key);
      const token: CacheEntryToken = {};
      const entry: LocalEntry<Value> = { byteLength, token, value };
      entries.set(key, entry);
      const retained = options.coordinator.reserve(token, byteLength, () => {
        if (entries.get(key)?.token === token) entries.delete(key);
      });
      if (!retained) entries.delete(key);
      while (entries.size > options.maxEntries) {
        const oldestKey = entries.keys().next().value as string | undefined;
        if (oldestKey === undefined) break;
        remove(oldestKey);
      }
    },
    size: () => entries.size,
  });
}
