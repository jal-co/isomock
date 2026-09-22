import {
  IndexedDbBinaryAssetRepositoryLifecycle,
  type IndexedDbRepositoryOperationContext,
} from "./indexeddb-binary-asset-lifecycle";
import {
  StaleIndexedDbLeaseError,
  invalidateIndexedDbOwnerReachability,
  maintainIndexedDbRepositoryMetadata,
  publishAndUnionIndexedDbReachability,
  type IndexedDbRepositoryMetadataContext,
} from "./indexeddb-binary-asset-metadata";
import {
  createIndexedDbRepositoryIdentity,
  createIndexedDbRepositorySetup,
  type IndexedDbToolcraftBinaryAssetRepositoryOptions,
} from "./indexeddb-binary-asset-options";
import {
  areToolcraftBinaryAssetRepositoryEntriesEqual,
  assertToolcraftBinaryAssetRef,
  createToolcraftBinaryAssetConflictError,
  createToolcraftBinaryAssetRepositoryEntry,
  type ToolcraftBinaryAssetLease,
  type ToolcraftBinaryAssetRepository,
  type ToolcraftBinaryAssetRepositoryEntry,
  type ToolcraftPersistedResourceRefsReader,
} from "./binary-asset-repository";
import { expandToolcraftBinaryAssetReachability } from "./binary-asset-reachability";
import {
  ENTRIES_STORE,
  LEASES_STORE,
  LEASE_ID_INDEX,
  METADATA_STORE,
  asRepositoryEntry,
  deleteStagedLeaseRows,
  leaseMetadataKey,
  requestResult,
  runIndexedDbTransaction,
  type IndexedDbEntryRecord,
  type IndexedDbLeaseMetadata,
  type IndexedDbLeaseRecord,
} from "./indexeddb-binary-asset-storage";

export type { IndexedDbHeartbeatScheduler } from "./indexeddb-binary-asset-lifecycle";
export type { IndexedDbOwnerLivenessProvider } from "./indexeddb-binary-asset-liveness";
export type { IndexedDbToolcraftBinaryAssetRepositoryOptions } from "./indexeddb-binary-asset-options";
class IndexedDbToolcraftBinaryAssetRepository
  implements ToolcraftBinaryAssetRepository
{
  private readonly activeJobIds = new Set<string>();

  constructor(
    private readonly lifecycle: IndexedDbBinaryAssetRepositoryLifecycle,
    private readonly ownerId: string,
    private readonly idFactory: () => string,
    private readonly getPersistedResourceRefs?: ToolcraftPersistedResourceRefsReader,
  ) {}
  async beginLease(jobId: string): Promise<ToolcraftBinaryAssetLease> {
    return this.lifecycle.runOperation(async (operationContext) => {
      if (jobId.length === 0 || jobId.trim() !== jobId) {
        throw new Error(
          "Binary asset lease job id must be a non-empty trimmed string",
        );
      }
      if (this.activeJobIds.has(jobId)) {
        throw new Error(`Binary asset lease job "${jobId}" is already active`);
      }

      const leaseId = createIndexedDbRepositoryIdentity(this.idFactory, "lease");
      this.activeJobIds.add(jobId);
      try {
        await runIndexedDbTransaction(
          operationContext.database,
          [LEASES_STORE, METADATA_STORE],
          "readwrite",
          async (transaction) => {
            const now = await this.maintainMetadata(
              transaction,
              operationContext,
            );
            const context = this.getMetadataContext();
            const metadata: IndexedDbLeaseMetadata = {
              expiresAt: now + context.staleLeaseMs,
              jobId,
              key: leaseMetadataKey(leaseId),
              kind: "lease",
              leaseId,
              ownerId: this.ownerId,
              updatedAt: now,
            };
            await requestResult(
              transaction.objectStore(METADATA_STORE).add(metadata),
            );
          },
        );
      } catch (error) {
        this.activeJobIds.delete(jobId);
        throw error;
      }
      return this.createLease(jobId, leaseId);
    });
  }
  async collect(reachableRefs: ReadonlySet<string>): Promise<readonly string[]> {
    const reachableRefSnapshot = new Set(reachableRefs);
    return this.lifecycle.runOperation(({ database, liveOwnerIds }) =>
      runIndexedDbTransaction(
        database,
        [ENTRIES_STORE, LEASES_STORE, METADATA_STORE],
        "readwrite",
        async (transaction) => {
          const union = await publishAndUnionIndexedDbReachability(
            this.getMetadataContext(),
            transaction,
            reachableRefSnapshot,
            liveOwnerIds,
          );
          if (!union) return [];

          const entryStore = transaction.objectStore(ENTRIES_STORE);
          const entries = (await requestResult(
            entryStore.getAll(),
          )) as IndexedDbEntryRecord[];
          const persistedRefs = this.getPersistedResourceRefs?.();
          if (persistedRefs === null) return [];
          const reachable = expandToolcraftBinaryAssetReachability(
            new Set([...union, ...(persistedRefs ?? [])]),
            entries.map(asRepositoryEntry),
          );
          const deletedRefs = entries
            .map(({ ref }) => ref)
            .filter((ref) => !reachable.has(ref))
            .sort();
          for (const ref of deletedRefs) entryStore.delete(ref);
          return deletedRefs;
        },
      ),
    );
  }

  async get(ref: string): Promise<ToolcraftBinaryAssetRepositoryEntry | null> {
    return this.lifecycle.runOperation(({ database, liveOwnerIds }) => {
      assertToolcraftBinaryAssetRef(ref);
      return runIndexedDbTransaction(
        database,
        [ENTRIES_STORE, LEASES_STORE, METADATA_STORE],
        "readwrite",
        async (transaction) => {
          await this.maintainMetadata(transaction, {
            database,
            liveOwnerIds,
          });
          const record = (await requestResult(
            transaction.objectStore(ENTRIES_STORE).get(ref),
          )) as IndexedDbEntryRecord | undefined;
          return record ? asRepositoryEntry(record) : null;
        },
      );
    });
  }

  async dispose(): Promise<void> {
    await this.lifecycle.dispose();
    this.activeJobIds.clear();
  }

  private createLease(jobId: string, leaseId: string): ToolcraftBinaryAssetLease {
    const stagedRefs = new Set<string>();
    let operation = Promise.resolve<unknown>(undefined);
    let terminal = false;

    const finish = () => {
      terminal = true;
      stagedRefs.clear();
      this.activeJobIds.delete(jobId);
    };
    const assertActive = () => {
      this.lifecycle.assertActive();
      if (terminal) {
        throw new Error(`Binary asset lease job "${jobId}" is terminal`);
      }
    };
    const run = <Result>(
      action: (context: IndexedDbRepositoryOperationContext) => Promise<Result>,
    ): Promise<Result> => {
      const result = operation.then(() => {
        assertActive();
        return this.lifecycle.runOperation(action);
      });
      operation = result.catch((error: unknown) => {
        if (error instanceof StaleIndexedDbLeaseError) finish();
        return undefined;
      });
      return result;
    };

    return {
      commit: () =>
        run(async (context) => {
          await this.commitLease(context, leaseId);
          finish();
        }),
      get: (ref) => run((context) => this.getLeaseEntry(context, leaseId, ref)),
      put: async (ref, bytes, options) => {
        const entry = createToolcraftBinaryAssetRepositoryEntry(
          ref,
          bytes,
          options,
        );
        await run(async (context) => {
          await this.putLeaseEntry(
            context,
            leaseId,
            jobId,
            entry,
          );
          stagedRefs.add(entry.ref);
        });
      },
      refs: () =>
        terminal || this.lifecycle.isDisposed() ? [] : [...stagedRefs].sort(),
      rollback: () =>
        run(async (context) => {
          await this.rollbackLease(context, leaseId);
          finish();
        }),
    };
  }

  private async commitLease(
    context: IndexedDbRepositoryOperationContext,
    leaseId: string,
  ): Promise<void> {
    await runIndexedDbTransaction(
      context.database,
      [ENTRIES_STORE, LEASES_STORE, METADATA_STORE],
      "readwrite",
      async (transaction) => {
        await this.maintainMetadata(transaction, context, leaseId);
        await invalidateIndexedDbOwnerReachability(
          this.getMetadataContext(),
          transaction,
        );
        const entryStore = transaction.objectStore(ENTRIES_STORE);
        const leaseStore = transaction.objectStore(LEASES_STORE);
        const stagedRecords = (await requestResult(
          leaseStore.index(LEASE_ID_INDEX).getAll(leaseId),
        )) as IndexedDbLeaseRecord[];
        const committedRecords = await Promise.all(
          stagedRecords.map(
            (record) =>
              requestResult(entryStore.get(record.ref)) as Promise<
                IndexedDbEntryRecord | undefined
              >,
          ),
        );

        stagedRecords.forEach((record, index) => {
          const committedRecord = committedRecords[index];
          if (
            committedRecord &&
            !areToolcraftBinaryAssetRepositoryEntriesEqual(
              asRepositoryEntry(committedRecord),
              asRepositoryEntry(record),
            )
          ) {
            throw createToolcraftBinaryAssetConflictError(record.ref);
          }
        });

        stagedRecords.forEach((record, index) => {
          if (!committedRecords[index]) {
            entryStore.put(asRepositoryEntry(record));
          }
          leaseStore.delete([leaseId, record.ref]);
        });
        transaction
          .objectStore(METADATA_STORE)
          .delete(leaseMetadataKey(leaseId));
      },
    );
  }

  private async getLeaseEntry(
    context: IndexedDbRepositoryOperationContext,
    leaseId: string,
    ref: string,
  ): Promise<ToolcraftBinaryAssetRepositoryEntry | null> {
    assertToolcraftBinaryAssetRef(ref);
    return runIndexedDbTransaction(
      context.database,
      [ENTRIES_STORE, LEASES_STORE, METADATA_STORE],
      "readwrite",
      async (transaction) => {
        await this.maintainMetadata(transaction, context, leaseId);
        const staged = (await requestResult(
          transaction.objectStore(LEASES_STORE).get([leaseId, ref]),
        )) as IndexedDbLeaseRecord | undefined;
        if (staged) return asRepositoryEntry(staged);

        const committed = (await requestResult(
          transaction.objectStore(ENTRIES_STORE).get(ref),
        )) as IndexedDbEntryRecord | undefined;
        return committed ? asRepositoryEntry(committed) : null;
      },
    );
  }

  private async maintainMetadata(
    transaction: IDBTransaction,
    context: IndexedDbRepositoryOperationContext,
    protectedLeaseId?: string,
  ): Promise<number> {
    return maintainIndexedDbRepositoryMetadata(
      this.getMetadataContext(),
      transaction,
      context.liveOwnerIds,
      protectedLeaseId,
    );
  }

  private getMetadataContext(): IndexedDbRepositoryMetadataContext {
    return this.lifecycle.getMetadataContext();
  }

  private async putLeaseEntry(
    context: IndexedDbRepositoryOperationContext,
    leaseId: string,
    jobId: string,
    entry: ToolcraftBinaryAssetRepositoryEntry,
  ): Promise<void> {
    await runIndexedDbTransaction(
      context.database,
      [LEASES_STORE, METADATA_STORE],
      "readwrite",
      async (transaction) => {
        await this.maintainMetadata(transaction, context, leaseId);
        const store = transaction.objectStore(LEASES_STORE);
        const existing = (await requestResult(
          store.get([leaseId, entry.ref]),
        )) as IndexedDbLeaseRecord | undefined;
        if (existing) {
          if (
            !areToolcraftBinaryAssetRepositoryEntriesEqual(
              asRepositoryEntry(existing),
              entry,
            )
          ) {
            throw createToolcraftBinaryAssetConflictError(entry.ref);
          }
          return;
        }
        store.put({
          ...entry,
          bytes: new Uint8Array(entry.bytes),
          jobId,
          leaseId,
          ownerId: this.ownerId,
        } satisfies IndexedDbLeaseRecord);
      },
    );
  }

  private async rollbackLease(
    context: IndexedDbRepositoryOperationContext,
    leaseId: string,
  ): Promise<void> {
    await runIndexedDbTransaction(
      context.database,
      [LEASES_STORE, METADATA_STORE],
      "readwrite",
      async (transaction) => {
        await this.maintainMetadata(transaction, context, leaseId);
        await deleteStagedLeaseRows(
          transaction.objectStore(LEASES_STORE),
          leaseId,
        );
        transaction
          .objectStore(METADATA_STORE)
          .delete(leaseMetadataKey(leaseId));
      },
    );
  }
}

export function createIndexedDbToolcraftBinaryAssetRepository(
  options: IndexedDbToolcraftBinaryAssetRepositoryOptions = {},
): ToolcraftBinaryAssetRepository {
  const { idFactory, lifecycle, ownerId } =
    createIndexedDbRepositorySetup(options);
  return new IndexedDbToolcraftBinaryAssetRepository(
    lifecycle,
    ownerId,
    idFactory,
    options.getPersistedResourceRefs,
  );
}
