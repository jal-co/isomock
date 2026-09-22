export type IndexedDbOwnerLivenessLease = {
  release: () => Promise<void>;
};

export type IndexedDbOwnerLivenessSnapshot = ReadonlySet<string> | null;

export type IndexedDbOwnerLivenessProvider = {
  acquire: (
    scope: string,
    ownerId: string,
  ) => Promise<IndexedDbOwnerLivenessLease>;
  query: (scope: string) => Promise<IndexedDbOwnerLivenessSnapshot>;
  runExclusive: <Result>(
    scope: string,
    operation: () => Promise<Result>,
  ) => Promise<Result>;
};

type WebLock = { name?: string };

type WebLockRequest = {
  <Result>(
    name: string,
    callback: (lock: WebLock | null) => Promise<Result>,
  ): Promise<Result>;
  <Result>(
    name: string,
    options: { ifAvailable: true },
    callback: (lock: WebLock | null) => Promise<Result>,
  ): Promise<Result>;
};

type WebLockManager = {
  query: () => Promise<{
    held?: readonly { name?: string | null }[];
  }>;
  request: WebLockRequest;
};

const unavailableOwnerLocks = new Set<string>();

function ownerLockPrefix(scope: string): string {
  return `toolcraft-binary-assets:${scope.length}:${scope}:`;
}

function coordinationLockName(scope: string): string {
  return `toolcraft-binary-assets-coordinate:${scope.length}:${scope}`;
}

export function createIndexedDbOwnerCollisionError(
  scope: string,
  ownerId: string,
): Error {
  return new Error(
    `IndexedDB binary asset owner collision: owner "${ownerId}" is already held for database "${scope}"`,
  );
}

function createUnavailableProvider(): IndexedDbOwnerLivenessProvider {
  return {
    async acquire(scope, ownerId) {
      const key = `${ownerLockPrefix(scope)}${ownerId}`;
      if (unavailableOwnerLocks.has(key)) {
        throw createIndexedDbOwnerCollisionError(scope, ownerId);
      }
      unavailableOwnerLocks.add(key);
      let released = false;
      return {
        release: async () => {
          if (released) return;
          released = true;
          unavailableOwnerLocks.delete(key);
        },
      };
    },
    async query() {
      return null;
    },
    async runExclusive(_scope, operation) {
      return operation();
    },
  };
}

function getWebLockManager(): WebLockManager | null {
  const navigatorValue = globalThis.navigator as
    | { locks?: Partial<WebLockManager> }
    | undefined;
  const locks = navigatorValue?.locks;
  if (
    typeof locks?.request !== "function" ||
    typeof locks.query !== "function"
  ) {
    return null;
  }
  return locks as WebLockManager;
}

export function createDefaultIndexedDbOwnerLivenessProvider(): IndexedDbOwnerLivenessProvider {
  const locks = getWebLockManager();
  if (!locks) return createUnavailableProvider();

  return {
    async acquire(scope, ownerId) {
      let markAcquired!: () => void;
      let rejectAcquisition!: (error: unknown) => void;
      let releaseLock!: () => void;
      const acquired = new Promise<void>((resolve, reject) => {
        markAcquired = resolve;
        rejectAcquisition = reject;
      });
      const hold = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      const request = locks.request(
        `${ownerLockPrefix(scope)}${ownerId}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) {
            throw createIndexedDbOwnerCollisionError(scope, ownerId);
          }
          markAcquired();
          await hold;
        },
      );
      void request.catch(rejectAcquisition);
      await acquired;

      let released = false;
      return {
        release: async () => {
          if (released) return;
          released = true;
          releaseLock();
          await request;
        },
      };
    },
    async query(scope) {
      const prefix = ownerLockPrefix(scope);
      const snapshot = await locks.query();
      return new Set(
        (snapshot.held ?? [])
          .map((lock) => lock.name)
          .filter(
            (name): name is string =>
              typeof name === "string" && name.startsWith(prefix),
          )
          .map((name) => name.slice(prefix.length)),
      );
    },
    runExclusive(scope, operation) {
      return locks.request(coordinationLockName(scope), () => operation());
    },
  };
}
