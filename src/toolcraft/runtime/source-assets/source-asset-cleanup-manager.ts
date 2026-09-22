import type {
  ToolcraftBinaryAssetLease,
  ToolcraftBinaryAssetRepository,
} from "./repository/binary-asset-repository";

export type ToolcraftSourceAssetCleanupManager = {
  collect: () => Promise<void>;
  dispose: () => Promise<void>;
  retryRollbacks: () => Promise<void>;
  rollback: (lease: ToolcraftBinaryAssetLease | null) => Promise<void>;
};

export function createToolcraftSourceAssetCleanupManager({
  getReachableRefs,
  repository,
}: {
  getReachableRefs: () => ReadonlySet<string>;
  repository: ToolcraftBinaryAssetRepository;
}): ToolcraftSourceAssetCleanupManager {
  const pendingRollbacks = new Set<ToolcraftBinaryAssetLease>();
  let collectionPending = false;
  let queue = Promise.resolve<unknown>(undefined);
  let disposePromise: Promise<void> | null = null;

  const enqueue = <Result>(action: () => Promise<Result>): Promise<Result> => {
    const result = queue.then(action, action);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const attemptRollback = async (
    lease: ToolcraftBinaryAssetLease,
  ): Promise<unknown | undefined> => {
    try {
      await lease.rollback();
      pendingRollbacks.delete(lease);
      return undefined;
    } catch (error) {
      return error;
    }
  };

  const attemptCollection = async (): Promise<unknown | undefined> => {
    try {
      await repository.collect(getReachableRefs());
      collectionPending = false;
      return undefined;
    } catch (error) {
      collectionPending = true;
      return error;
    }
  };

  return {
    collect: () =>
      enqueue(async () => {
        collectionPending = true;
        await attemptCollection();
      }),
    dispose: () => {
      if (disposePromise) {
        return disposePromise;
      }

      disposePromise = enqueue(async () => {
        const failures: unknown[] = [];

        for (const lease of [...pendingRollbacks]) {
          const failure = await attemptRollback(lease);
          if (failure !== undefined) failures.push(failure);
        }
        if (collectionPending) {
          const failure = await attemptCollection();
          if (failure !== undefined) failures.push(failure);
        }

        try {
          await repository.dispose();
        } catch (error) {
          failures.push(error);
        }

        if (failures.length > 0) {
          throw new AggregateError(
            failures,
            "Source asset cleanup could not be completed during disposal",
          );
        }
      });
      return disposePromise;
    },
    retryRollbacks: () =>
      enqueue(async () => {
        for (const lease of [...pendingRollbacks]) {
          await attemptRollback(lease);
        }
      }),
    rollback: (lease) => {
      if (!lease) return Promise.resolve();

      return enqueue(async () => {
        pendingRollbacks.add(lease);
        await attemptRollback(lease);
      });
    },
  };
}
