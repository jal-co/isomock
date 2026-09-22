import {
  IndexedDbBinaryAssetRepositoryLifecycle,
  defaultIndexedDbHeartbeatScheduler,
  type IndexedDbHeartbeatScheduler,
} from "./indexeddb-binary-asset-lifecycle";
import {
  createDefaultIndexedDbOwnerLivenessProvider,
  type IndexedDbOwnerLivenessProvider,
} from "./indexeddb-binary-asset-liveness";
import type { IndexedDbRepositoryMetadataContext } from "./indexeddb-binary-asset-metadata";
import type { ToolcraftBinaryAssetCollectionOptions } from "./binary-asset-repository";

export const DEFAULT_OWNER_TTL_MS = 30_000;
export const DEFAULT_STALE_LEASE_MS = 5 * 60_000;

export type IndexedDbToolcraftBinaryAssetRepositoryOptions = ToolcraftBinaryAssetCollectionOptions & {
  databaseName?: string;
  heartbeatIntervalMs?: number;
  heartbeatScheduler?: IndexedDbHeartbeatScheduler;
  idFactory?: () => string;
  indexedDB?: IDBFactory;
  now?: () => number;
  ownerLivenessProvider?: IndexedDbOwnerLivenessProvider;
  ownerTtlMs?: number;
  staleLeaseMs?: number;
};

export type IndexedDbRepositoryTiming = {
  heartbeatIntervalMs: number;
  ownerTtlMs: number;
  staleLeaseMs: number;
};

function defaultIdFactory(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID !== "function") {
    throw new Error(
      "IndexedDB binary asset repository requires crypto.randomUUID or an idFactory option",
    );
  }
  return randomUUID.call(globalThis.crypto);
}

export function resolveIndexedDbRepositoryIdFactory(
  idFactory: (() => string) | undefined,
): () => string {
  return idFactory ?? defaultIdFactory;
}

export function createIndexedDbRepositoryIdentity(
  idFactory: () => string,
  kind: string,
): string {
  const identity = idFactory();
  if (identity.length === 0 || identity.trim() !== identity) {
    throw new Error(`${kind} id factory must return a non-empty trimmed string`);
  }
  return identity;
}

export function validateIndexedDbRepositoryDuration(
  value: number,
  name: string,
): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
  return value;
}

export function resolveIndexedDbRepositoryTiming(options: {
  heartbeatIntervalMs?: number;
  ownerTtlMs?: number;
  staleLeaseMs?: number;
}): IndexedDbRepositoryTiming {
  const ownerTtlMs = validateIndexedDbRepositoryDuration(
    options.ownerTtlMs ?? DEFAULT_OWNER_TTL_MS,
    "ownerTtlMs",
  );
  const staleLeaseMs = validateIndexedDbRepositoryDuration(
    options.staleLeaseMs ?? DEFAULT_STALE_LEASE_MS,
    "staleLeaseMs",
  );
  const heartbeatIntervalMs = validateIndexedDbRepositoryDuration(
    options.heartbeatIntervalMs ?? Math.min(ownerTtlMs, staleLeaseMs) / 3,
    "heartbeatIntervalMs",
  );
  if (
    heartbeatIntervalMs >= ownerTtlMs ||
    heartbeatIntervalMs >= staleLeaseMs
  ) {
    throw new Error(
      "heartbeatIntervalMs must be shorter than ownerTtlMs and staleLeaseMs",
    );
  }

  return { heartbeatIntervalMs, ownerTtlMs, staleLeaseMs };
}

export function createIndexedDbRepositorySetup(
  options: IndexedDbToolcraftBinaryAssetRepositoryOptions,
): {
  idFactory: () => string;
  lifecycle: IndexedDbBinaryAssetRepositoryLifecycle;
  ownerId: string;
} {
  const indexedDB = options.indexedDB ?? globalThis.indexedDB;
  if (!indexedDB) {
    throw new Error("IndexedDB is unavailable for the binary asset repository");
  }

  const idFactory = resolveIndexedDbRepositoryIdFactory(options.idFactory);
  const ownerId = createIndexedDbRepositoryIdentity(idFactory, "owner");
  const timing = resolveIndexedDbRepositoryTiming(options);
  const metadataContext: IndexedDbRepositoryMetadataContext = {
    now: options.now ?? Date.now,
    ownerId,
    ownerTtlMs: timing.ownerTtlMs,
    staleLeaseMs: timing.staleLeaseMs,
  };
  const lifecycle = new IndexedDbBinaryAssetRepositoryLifecycle(
    indexedDB,
    options.databaseName ?? "toolcraft-binary-assets",
    metadataContext,
    options.heartbeatScheduler ?? defaultIndexedDbHeartbeatScheduler,
    timing.heartbeatIntervalMs,
    options.ownerLivenessProvider ??
      createDefaultIndexedDbOwnerLivenessProvider(),
  );
  return { idFactory, lifecycle, ownerId };
}
