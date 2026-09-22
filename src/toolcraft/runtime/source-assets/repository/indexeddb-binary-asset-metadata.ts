import {
  LEASES_STORE,
  METADATA_STORE,
  deleteStagedLeaseRows,
  leaseMetadataKey,
  ownerMetadataKey,
  requestResult,
  type IndexedDbLeaseMetadata,
  type IndexedDbOwnerMetadata,
  type IndexedDbRepositoryMetadata,
} from "./indexeddb-binary-asset-storage";
import type { IndexedDbOwnerLivenessSnapshot } from "./indexeddb-binary-asset-liveness";

export type IndexedDbRepositoryMetadataContext = {
  now: () => number;
  ownerId: string;
  ownerTtlMs: number;
  staleLeaseMs: number;
};

export class StaleIndexedDbLeaseError extends Error {}

function isLeaseMetadata(
  value: IndexedDbRepositoryMetadata | undefined,
): value is IndexedDbLeaseMetadata {
  return value?.kind === "lease";
}

function isOwnerMetadata(
  value: IndexedDbRepositoryMetadata | undefined,
): value is IndexedDbOwnerMetadata {
  return value?.kind === "owner";
}

export async function maintainIndexedDbRepositoryMetadata(
  context: IndexedDbRepositoryMetadataContext,
  transaction: IDBTransaction,
  liveOwnerIds: IndexedDbOwnerLivenessSnapshot,
  protectedLeaseId?: string,
): Promise<number> {
  const now = context.now();
  const metadataStore = transaction.objectStore(METADATA_STORE);
  const leaseStore = transaction.objectStore(LEASES_STORE);
  const ownerKey = ownerMetadataKey(context.ownerId);
  const owner = (await requestResult(
    metadataStore.get(ownerKey),
  )) as IndexedDbOwnerMetadata | undefined;
  metadataStore.put({
    expiresAt: now + context.ownerTtlMs,
    key: ownerKey,
    kind: "owner",
    ownerId: context.ownerId,
    reachableRefs: isOwnerMetadata(owner) ? owner.reachableRefs : null,
    updatedAt: now,
  } satisfies IndexedDbOwnerMetadata);

  if (protectedLeaseId) {
    const lease = (await requestResult(
      metadataStore.get(leaseMetadataKey(protectedLeaseId)),
    )) as IndexedDbLeaseMetadata | undefined;
    if (
      !isLeaseMetadata(lease) ||
      lease.ownerId !== context.ownerId ||
      lease.leaseId !== protectedLeaseId
    ) {
      throw new StaleIndexedDbLeaseError(
        `IndexedDB binary asset lease "${protectedLeaseId}" is stale or expired`,
      );
    }
    metadataStore.put({
      ...lease,
      expiresAt: now + context.staleLeaseMs,
      updatedAt: now,
    } satisfies IndexedDbLeaseMetadata);
  }

  const metadata = (await requestResult(
    metadataStore.getAll(),
  )) as IndexedDbRepositoryMetadata[];
  const activeLeaseOwnerIds = new Set<string>();
  for (const record of metadata) {
    if (!isLeaseMetadata(record)) continue;
    if (
      record.leaseId === protectedLeaseId ||
      record.expiresAt > now ||
      record.ownerId === context.ownerId ||
      liveOwnerIds === null ||
      liveOwnerIds.has(record.ownerId)
    ) {
      activeLeaseOwnerIds.add(record.ownerId);
      continue;
    }
    await deleteStagedLeaseRows(leaseStore, record.leaseId);
    metadataStore.delete(record.key);
  }

  for (const record of metadata) {
    if (
      isOwnerMetadata(record) &&
      record.ownerId !== context.ownerId &&
      record.expiresAt <= now &&
      !activeLeaseOwnerIds.has(record.ownerId) &&
      liveOwnerIds !== null &&
      !liveOwnerIds.has(record.ownerId)
    ) {
      metadataStore.delete(record.key);
    }
  }
  return now;
}

export async function heartbeatIndexedDbRepositoryMetadata(
  context: IndexedDbRepositoryMetadataContext,
  transaction: IDBTransaction,
): Promise<void> {
  const now = context.now();
  const metadataStore = transaction.objectStore(METADATA_STORE);
  const ownerKey = ownerMetadataKey(context.ownerId);
  const owner = (await requestResult(
    metadataStore.get(ownerKey),
  )) as IndexedDbOwnerMetadata | undefined;
  metadataStore.put({
    expiresAt: now + context.ownerTtlMs,
    key: ownerKey,
    kind: "owner",
    ownerId: context.ownerId,
    reachableRefs: isOwnerMetadata(owner) ? owner.reachableRefs : null,
    updatedAt: now,
  } satisfies IndexedDbOwnerMetadata);

  const metadata = (await requestResult(
    metadataStore.getAll(),
  )) as IndexedDbRepositoryMetadata[];
  for (const record of metadata) {
    if (isLeaseMetadata(record) && record.ownerId === context.ownerId) {
      metadataStore.put({
        ...record,
        expiresAt: now + context.staleLeaseMs,
        updatedAt: now,
      } satisfies IndexedDbLeaseMetadata);
    }
  }
}

export async function invalidateIndexedDbOwnerReachability(
  context: IndexedDbRepositoryMetadataContext,
  transaction: IDBTransaction,
): Promise<void> {
  const metadataStore = transaction.objectStore(METADATA_STORE);
  const key = ownerMetadataKey(context.ownerId);
  const owner = (await requestResult(
    metadataStore.get(key),
  )) as IndexedDbOwnerMetadata | undefined;
  if (!isOwnerMetadata(owner)) return;
  metadataStore.put({
    ...owner,
    reachableRefs: null,
    updatedAt: context.now(),
  } satisfies IndexedDbOwnerMetadata);
}

export async function removeIndexedDbRepositoryOwner(
  context: IndexedDbRepositoryMetadataContext,
  transaction: IDBTransaction,
): Promise<void> {
  const metadataStore = transaction.objectStore(METADATA_STORE);
  const leaseStore = transaction.objectStore(LEASES_STORE);
  const metadata = (await requestResult(
    metadataStore.getAll(),
  )) as IndexedDbRepositoryMetadata[];

  for (const record of metadata) {
    if (isLeaseMetadata(record) && record.ownerId === context.ownerId) {
      await deleteStagedLeaseRows(leaseStore, record.leaseId);
      metadataStore.delete(record.key);
    }
  }
  metadataStore.delete(ownerMetadataKey(context.ownerId));
}

export async function publishAndUnionIndexedDbReachability(
  context: IndexedDbRepositoryMetadataContext,
  transaction: IDBTransaction,
  reachableRefs: ReadonlySet<string>,
  liveOwnerIds: IndexedDbOwnerLivenessSnapshot,
): Promise<ReadonlySet<string> | null> {
  const now = await maintainIndexedDbRepositoryMetadata(
    context,
    transaction,
    liveOwnerIds,
  );
  const metadataStore = transaction.objectStore(METADATA_STORE);
  const owner = (await requestResult(
    metadataStore.get(ownerMetadataKey(context.ownerId)),
  )) as IndexedDbOwnerMetadata;
  metadataStore.put({
    ...owner,
    reachableRefs: [...reachableRefs].sort(),
    updatedAt: now,
  } satisfies IndexedDbOwnerMetadata);

  const metadata = (await requestResult(
    metadataStore.getAll(),
  )) as IndexedDbRepositoryMetadata[];
  const ownerById = new Map(
    metadata
      .filter((record): record is IndexedDbOwnerMetadata =>
        isOwnerMetadata(record),
      )
      .map((record) => [record.ownerId, record]),
  );
  const activeOwnerIds = new Set(
    [...ownerById.values()]
      .filter(
        (record) =>
          record.ownerId === context.ownerId ||
          record.expiresAt > now ||
          liveOwnerIds === null ||
          liveOwnerIds.has(record.ownerId),
      )
      .map((record) => record.ownerId),
  );
  for (const record of metadata) {
    if (
      isLeaseMetadata(record) &&
      (record.ownerId === context.ownerId ||
        record.expiresAt > now ||
        liveOwnerIds === null ||
        liveOwnerIds.has(record.ownerId))
    ) {
      activeOwnerIds.add(record.ownerId);
    }
  }

  const union = new Set<string>();
  for (const activeOwnerId of activeOwnerIds) {
    const activeOwner = ownerById.get(activeOwnerId);
    if (!activeOwner || activeOwner.reachableRefs === null) return null;
    for (const ref of activeOwner.reachableRefs) union.add(ref);
  }
  return union;
}
