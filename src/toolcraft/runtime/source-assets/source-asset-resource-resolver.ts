import type {
  ToolcraftBinaryAssetLease,
  ToolcraftBinaryAssetRepository,
} from "./repository/binary-asset-repository";

export type ToolcraftSourceAssetResourceJob = Readonly<{
  lease: Readonly<{
    lease: Pick<ToolcraftBinaryAssetLease, "get">;
    settled: Promise<void>;
  }> | null;
  stagedResourceRefs: ReadonlySet<string>;
}>;

export function createToolcraftSourceAssetAbortError(): Error {
  const error = new Error("Source asset import was cancelled");
  error.name = "AbortError";
  return error;
}

function waitForPromiseOrAbort(
  promise: Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(createToolcraftSourceAssetAbortError());
  }

  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      cleanup();
      reject(createToolcraftSourceAssetAbortError());
    };
    const cleanup = () => signal.removeEventListener("abort", handleAbort);

    signal.addEventListener("abort", handleAbort, { once: true });
    void promise.then(
      () => {
        cleanup();
        resolve();
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export function createToolcraftSourceAssetResourceResolver({
  getActiveJobs,
  isDisposed,
  repository,
}: Readonly<{
  getActiveJobs: () => readonly ToolcraftSourceAssetResourceJob[];
  isDisposed: () => boolean;
  repository: ToolcraftBinaryAssetRepository;
}>): (
  ref: string,
  options: Readonly<{ signal: AbortSignal }>,
) => Promise<Uint8Array | null> {
  return async (ref, { signal }) => {
    if (signal.aborted) throw createToolcraftSourceAssetAbortError();
    if (isDisposed()) return null;

    const stagedJobs = getActiveJobs().filter(
      (job) => job.stagedResourceRefs.has(ref) && job.lease !== null,
    );
    for (const job of stagedJobs) {
      const leaseState = job.lease;
      if (!leaseState) continue;

      try {
        const stagedEntry = await leaseState.lease.get(ref);
        if (signal.aborted) throw createToolcraftSourceAssetAbortError();
        if (stagedEntry) return new Uint8Array(stagedEntry.bytes);
      } catch (error) {
        if (signal.aborted) throw createToolcraftSourceAssetAbortError();
        await waitForPromiseOrAbort(leaseState.settled, signal);
      }
    }

    const entry = await repository.get(ref);
    if (signal.aborted) throw createToolcraftSourceAssetAbortError();
    return entry ? new Uint8Array(entry.bytes) : null;
  };
}
