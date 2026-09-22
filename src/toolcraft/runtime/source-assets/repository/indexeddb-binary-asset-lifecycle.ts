import {
  heartbeatIndexedDbRepositoryMetadata,
  removeIndexedDbRepositoryOwner,
  type IndexedDbRepositoryMetadataContext,
} from "./indexeddb-binary-asset-metadata";
import {
  LEASES_STORE,
  METADATA_STORE,
  openExistingIndexedDbBinaryAssetDatabase,
  openIndexedDbBinaryAssetDatabase,
  runIndexedDbTransaction,
} from "./indexeddb-binary-asset-storage";
import type {
  IndexedDbOwnerLivenessLease,
  IndexedDbOwnerLivenessProvider,
  IndexedDbOwnerLivenessSnapshot,
} from "./indexeddb-binary-asset-liveness";

export type IndexedDbHeartbeatScheduler = {
  cancel: (handle: unknown) => void;
  schedule: (callback: () => Promise<void>, intervalMs: number) => unknown;
};

export type IndexedDbRepositoryOperationContext = {
  database: IDBDatabase;
  liveOwnerIds: IndexedDbOwnerLivenessSnapshot;
};

export const defaultIndexedDbHeartbeatScheduler: IndexedDbHeartbeatScheduler = {
  cancel(handle) {
    globalThis.clearInterval(handle as number);
  },
  schedule(callback, intervalMs) {
    return globalThis.setInterval(() => {
      void callback();
    }, intervalMs);
  },
};

export class IndexedDbBinaryAssetRepositoryLifecycle {
  private database: IDBDatabase | undefined;
  private databasePromise: Promise<IDBDatabase> | undefined;
  private disposePromise: Promise<void> | undefined;
  private disposed = false;
  private heartbeatHandle: unknown;
  private heartbeatInFlight = Promise.resolve();
  private hasOpenedDatabase = false;
  private readonly operations = new Set<Promise<unknown>>();
  private livenessLease: IndexedDbOwnerLivenessLease | undefined;
  private livenessPromise: Promise<IndexedDbOwnerLivenessLease> | undefined;

  constructor(
    private readonly indexedDB: IDBFactory,
    private readonly databaseName: string,
    private readonly metadataContext: IndexedDbRepositoryMetadataContext,
    private readonly heartbeatScheduler: IndexedDbHeartbeatScheduler,
    private readonly heartbeatIntervalMs: number,
    private readonly livenessProvider: IndexedDbOwnerLivenessProvider,
  ) {}

  assertActive(): void {
    if (this.disposed) {
      throw new Error("IndexedDB binary asset repository is disposed");
    }
  }

  async dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    if (this.heartbeatHandle !== undefined) {
      this.heartbeatScheduler.cancel(this.heartbeatHandle);
      this.heartbeatHandle = undefined;
    }

    this.disposePromise = (async () => {
      await this.heartbeatInFlight;
      await Promise.allSettled([...this.operations]);
      const livenessLease =
        this.livenessLease ??
        (await this.livenessPromise?.catch(() => undefined));
      let database: IDBDatabase | undefined;

      try {
        await this.livenessProvider.runExclusive(this.databaseName, async () => {
          database = await this.getCleanupDatabase();
          if (
            database?.objectStoreNames.contains(LEASES_STORE) &&
            database.objectStoreNames.contains(METADATA_STORE)
          ) {
            await runIndexedDbTransaction(
              database,
              [LEASES_STORE, METADATA_STORE],
              "readwrite",
              (transaction) =>
                removeIndexedDbRepositoryOwner(
                  this.metadataContext,
                  transaction,
                ),
            );
          }
        });
      } finally {
        database?.close();
        this.database = undefined;
        this.databasePromise = undefined;
        this.livenessLease = undefined;
        this.livenessPromise = undefined;
        await livenessLease?.release();
      }
    })();
    return this.disposePromise;
  }

  runOperation<Result>(
    operation: (
      context: IndexedDbRepositoryOperationContext,
    ) => Promise<Result>,
  ): Promise<Result> {
    this.assertActive();
    const admitted = this.livenessProvider.runExclusive(
      this.databaseName,
      async () => {
        const database = await this.getDatabase();
        const liveOwnerIds = await this.queryOwnerLiveness();
        return operation({ database, liveOwnerIds });
      },
    );
    this.operations.add(admitted);
    const remove = () => this.operations.delete(admitted);
    void admitted.then(remove, remove);
    return admitted;
  }

  getMetadataContext(): IndexedDbRepositoryMetadataContext {
    return this.metadataContext;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  private async getDatabase(): Promise<IDBDatabase> {
    await this.acquireOwnerLiveness();
    if (this.database) return this.database;
    if (this.databasePromise) return this.databasePromise;

    let openPromise: Promise<IDBDatabase>;
    openPromise = openIndexedDbBinaryAssetDatabase(
      this.indexedDB,
      this.databaseName,
      {
        onVersionChange: (database) => {
          if (this.database === database) this.database = undefined;
          if (this.databasePromise === openPromise) {
            this.databasePromise = undefined;
          }
        },
      },
    );
    this.databasePromise = openPromise;

    try {
      const database = await openPromise;
      this.hasOpenedDatabase = true;
      this.database = database;
      this.startHeartbeat();
      return database;
    } catch (error) {
      if (this.databasePromise === openPromise) this.databasePromise = undefined;
      throw error;
    }
  }

  private async queryOwnerLiveness(): Promise<IndexedDbOwnerLivenessSnapshot> {
    try {
      return await this.livenessProvider.query(this.databaseName);
    } catch {
      return null;
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatHandle !== undefined || this.disposed) return;
    this.heartbeatHandle = this.heartbeatScheduler.schedule(
      () => this.queueHeartbeat(),
      this.heartbeatIntervalMs,
    );
  }

  private async acquireOwnerLiveness(): Promise<void> {
    if (this.livenessLease) return;
    if (!this.livenessPromise) {
      const acquisition = this.livenessProvider.acquire(
        this.databaseName,
        this.metadataContext.ownerId,
      );
      this.livenessPromise = acquisition;
      void acquisition.catch(() => {
        if (this.livenessPromise === acquisition) {
          this.livenessPromise = undefined;
        }
      });
    }

    const lease = await this.livenessPromise;
    this.livenessLease = lease;
  }

  private async getCleanupDatabase(): Promise<IDBDatabase | undefined> {
    const database =
      this.database ?? (await this.databasePromise?.catch(() => undefined));
    if (database) return database;
    if (!this.hasOpenedDatabase) return undefined;
    return (
      (await openExistingIndexedDbBinaryAssetDatabase(
        this.indexedDB,
        this.databaseName,
      )) ?? undefined
    );
  }

  private queueHeartbeat(): Promise<void> {
    this.heartbeatInFlight = this.heartbeatInFlight
      .then(async () => {
        if (this.disposed) return;
        await this.livenessProvider.runExclusive(
          this.databaseName,
          async () => {
            if (this.disposed) return;
            const database = await this.getDatabase();
            if (this.disposed) return;
            await runIndexedDbTransaction(
              database,
              METADATA_STORE,
              "readwrite",
              (transaction) =>
                heartbeatIndexedDbRepositoryMetadata(
                  this.metadataContext,
                  transaction,
                ),
            );
          },
        );
      })
      .catch(() => undefined);
    return this.heartbeatInFlight;
  }
}
