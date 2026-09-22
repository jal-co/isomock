import {
  areToolcraftBinaryAssetRepositoryEntriesEqual,
  assertToolcraftBinaryAssetRef,
  cloneToolcraftBinaryAssetRepositoryEntry,
  createToolcraftBinaryAssetConflictError,
  createToolcraftBinaryAssetRepositoryEntry,
  type ToolcraftBinaryAssetLease,
  type ToolcraftBinaryAssetRepository,
  type ToolcraftBinaryAssetRepositoryEntry,
  type ToolcraftBinaryAssetCollectionOptions,
  type ToolcraftPersistedResourceRefsReader,
} from "./binary-asset-repository";
import { expandToolcraftBinaryAssetReachability } from "./binary-asset-reachability";

class MemoryToolcraftBinaryAssetRepository
  implements ToolcraftBinaryAssetRepository
{
  private readonly activeJobIds = new Set<string>();
  private readonly activeLeaseDisposers = new Set<() => void>();
  private readonly entries = new Map<
    string,
    ToolcraftBinaryAssetRepositoryEntry
  >();
  private disposed = false;

  constructor(private readonly getPersistedResourceRefs?: ToolcraftPersistedResourceRefsReader) {}

  async beginLease(jobId: string): Promise<ToolcraftBinaryAssetLease> {
    this.assertActive();
    if (jobId.length === 0 || jobId.trim() !== jobId) {
      throw new Error("Binary asset lease job id must be a non-empty trimmed string");
    }
    if (this.activeJobIds.has(jobId)) {
      throw new Error(`Binary asset lease job "${jobId}" is already active`);
    }

    this.activeJobIds.add(jobId);
    const staged = new Map<string, ToolcraftBinaryAssetRepositoryEntry>();
    let terminal = false;

    const assertActive = () => {
      if (terminal) {
        throw new Error(`Binary asset lease job "${jobId}" is terminal`);
      }
    };
    const finish = () => {
      if (terminal) return;
      terminal = true;
      staged.clear();
      this.activeJobIds.delete(jobId);
      this.activeLeaseDisposers.delete(finish);
    };
    this.activeLeaseDisposers.add(finish);

    return {
      commit: async () => {
        assertActive();

        for (const [ref, entry] of staged) {
          const existing = this.entries.get(ref);
          if (
            existing &&
            !areToolcraftBinaryAssetRepositoryEntriesEqual(existing, entry)
          ) {
            throw createToolcraftBinaryAssetConflictError(ref);
          }
        }

        for (const [ref, entry] of staged) {
          if (!this.entries.has(ref)) {
            this.entries.set(
              ref,
              cloneToolcraftBinaryAssetRepositoryEntry(entry),
            );
          }
        }
        finish();
      },
      get: async (ref) => {
        assertActive();
        assertToolcraftBinaryAssetRef(ref);
        const entry = staged.get(ref) ?? this.entries.get(ref);
        return entry ? cloneToolcraftBinaryAssetRepositoryEntry(entry) : null;
      },
      put: async (ref, bytes, options) => {
        assertActive();
        const entry = createToolcraftBinaryAssetRepositoryEntry(
          ref,
          bytes,
          options,
        );
        const existing = staged.get(ref);
        if (existing) {
          if (!areToolcraftBinaryAssetRepositoryEntriesEqual(existing, entry)) {
            throw createToolcraftBinaryAssetConflictError(ref);
          }
          return;
        }
        staged.set(ref, entry);
      },
      refs: () => (terminal ? [] : [...staged.keys()].sort()),
      rollback: async () => {
        assertActive();
        finish();
      },
    };
  }

  async collect(reachableRefs: ReadonlySet<string>): Promise<readonly string[]> {
    this.assertActive();
    const persistedRefs = this.getPersistedResourceRefs?.();
    if (persistedRefs === null) return [];
    const reachable = expandToolcraftBinaryAssetReachability(
      new Set([...reachableRefs, ...(persistedRefs ?? [])]),
      this.entries.values(),
    );
    const deletedRefs = [...this.entries.keys()]
      .filter((ref) => !reachable.has(ref))
      .sort();

    for (const ref of deletedRefs) {
      this.entries.delete(ref);
    }

    return deletedRefs;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const disposeLease of [...this.activeLeaseDisposers]) {
      disposeLease();
    }
    this.activeLeaseDisposers.clear();
    this.activeJobIds.clear();
    this.entries.clear();
  }

  async get(ref: string): Promise<ToolcraftBinaryAssetRepositoryEntry | null> {
    this.assertActive();
    assertToolcraftBinaryAssetRef(ref);
    const entry = this.entries.get(ref);
    return entry ? cloneToolcraftBinaryAssetRepositoryEntry(entry) : null;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error("Memory binary asset repository is disposed");
    }
  }
}

export function createMemoryToolcraftBinaryAssetRepository(
  options: ToolcraftBinaryAssetCollectionOptions = {},
): ToolcraftBinaryAssetRepository {
  return new MemoryToolcraftBinaryAssetRepository(options.getPersistedResourceRefs);
}
