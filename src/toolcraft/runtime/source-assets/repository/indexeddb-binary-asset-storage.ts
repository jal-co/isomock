import {
  createToolcraftBinaryAssetRepositoryEntry,
  type ToolcraftBinaryAssetRepositoryEntry,
} from "./binary-asset-repository";

export const ENTRIES_STORE = "entries";
export const LEASES_STORE = "leases";
export const METADATA_STORE = "metadata";
export const LEASE_ID_INDEX = "leaseId";

const DATABASE_VERSION = 2;

export type IndexedDbEntryRecord = ToolcraftBinaryAssetRepositoryEntry;

export type IndexedDbLeaseRecord = ToolcraftBinaryAssetRepositoryEntry & {
  jobId: string;
  leaseId: string;
  ownerId: string;
};

export type IndexedDbOwnerMetadata = {
  expiresAt: number;
  key: string;
  kind: "owner";
  ownerId: string;
  reachableRefs: string[] | null;
  updatedAt: number;
};

export type IndexedDbLeaseMetadata = {
  expiresAt: number;
  jobId: string;
  key: string;
  kind: "lease";
  leaseId: string;
  ownerId: string;
  updatedAt: number;
};

export type IndexedDbRepositoryMetadata =
  | IndexedDbLeaseMetadata
  | IndexedDbOwnerMetadata;

export function ownerMetadataKey(ownerId: string): string {
  return `owner:${ownerId}`;
}

export function leaseMetadataKey(leaseId: string): string {
  return `lease:${leaseId}`;
}

export function asRepositoryEntry(
  record: IndexedDbEntryRecord,
): ToolcraftBinaryAssetRepositoryEntry {
  return createToolcraftBinaryAssetRepositoryEntry(record.ref, record.bytes, {
    contentType: record.contentType,
    dependencies: record.dependencies,
    durable: record.durable,
  });
}

export function requestResult<Result>(
  request: IDBRequest<Result>,
): Promise<Result> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => {
      reject(request.error ?? new Error("IndexedDB request failed"));
    });
  });
}

function observeTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () => {
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    });
    transaction.addEventListener("error", () => {
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    });
  });
}

export async function runIndexedDbTransaction<Result>(
  database: IDBDatabase,
  storeNames: string | readonly string[],
  mode: IDBTransactionMode,
  operation: (transaction: IDBTransaction) => Promise<Result>,
): Promise<Result> {
  const transaction = database.transaction(storeNames, mode);
  const done = observeTransaction(transaction);

  try {
    const result = await operation(transaction);
    await done;
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The request may already have aborted or completed the transaction.
    }
    await done.catch(() => undefined);
    throw error;
  }
}

export async function deleteStagedLeaseRows(
  leaseStore: IDBObjectStore,
  leaseId: string,
): Promise<void> {
  const keys = await requestResult(
    leaseStore.index(LEASE_ID_INDEX).getAllKeys(leaseId),
  );
  for (const key of keys) {
    leaseStore.delete(key);
  }
}

export function openIndexedDbBinaryAssetDatabase(
  indexedDB: IDBFactory,
  databaseName: string,
  options: { onVersionChange?: (database: IDBDatabase) => void } = {},
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, DATABASE_VERSION);
    let settled = false;

    request.addEventListener("blocked", () => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          `Opening IndexedDB binary asset repository "${databaseName}" was blocked by another connection`,
        ),
      );
    });
    request.addEventListener("upgradeneeded", (event) => {
      if (settled) {
        request.transaction?.abort();
        return;
      }
      if (event.oldVersion !== 0) {
        request.transaction?.abort();
        return;
      }
      const database = request.result;
      if (!database.objectStoreNames.contains(ENTRIES_STORE)) {
        database.createObjectStore(ENTRIES_STORE, { keyPath: "ref" });
      }

      let leaseStore: IDBObjectStore;
      if (!database.objectStoreNames.contains(LEASES_STORE)) {
        leaseStore = database.createObjectStore(LEASES_STORE, {
          keyPath: ["leaseId", "ref"],
        });
      } else {
        leaseStore = request.transaction!.objectStore(LEASES_STORE);
      }
      if (!leaseStore.indexNames.contains(LEASE_ID_INDEX)) {
        leaseStore.createIndex(LEASE_ID_INDEX, "leaseId", { unique: false });
      }
      if (!database.objectStoreNames.contains(METADATA_STORE)) {
        database.createObjectStore(METADATA_STORE, { keyPath: "key" });
      }
    });
    request.addEventListener("success", () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      database.addEventListener("versionchange", () => {
        database.close();
        options.onVersionChange?.(database);
      });
      resolve(database);
    });
    request.addEventListener("error", () => {
      if (settled) return;
      settled = true;
      reject(
        request.error ?? new Error("Unable to open binary asset repository"),
      );
    });
  });
}

export function openExistingIndexedDbBinaryAssetDatabase(
  indexedDB: IDBFactory,
  databaseName: string,
): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    let missing = false;
    let settled = false;

    request.addEventListener("upgradeneeded", (event) => {
      if (event.oldVersion !== 0) return;
      missing = true;
      request.transaction?.abort();
    });
    request.addEventListener("success", () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      if (missing) {
        request.result.close();
        resolve(null);
        return;
      }
      resolve(request.result);
    });
    request.addEventListener("error", () => {
      if (settled) return;
      settled = true;
      if (missing) {
        resolve(null);
        return;
      }
      reject(
        request.error ??
          new Error("Unable to reopen existing binary asset repository"),
      );
    });
    request.addEventListener("blocked", () => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          `Reopening IndexedDB binary asset repository "${databaseName}" was blocked`,
        ),
      );
    });
  });
}
