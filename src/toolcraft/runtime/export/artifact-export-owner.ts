import { ToolcraftArtifactExportError } from "./export-error";

export type ToolcraftArtifactJobOutcome<T> =
  | { status: "completed"; value: T }
  | { status: "cancelled" };

export type ToolcraftArtifactJobStart<T> =
  | { status: "busy" }
  | { status: "started"; completion: Promise<ToolcraftArtifactJobOutcome<T>> };

export type ToolcraftArtifactJobStatus =
  | Readonly<{ phase: "idle" }>
  | Readonly<{ phase: "running" | "cancelling" | "disposing"; progress: number }>
  | Readonly<{ phase: "disposed" }>;

export type ToolcraftArtifactJobContext = Readonly<{
  signal: AbortSignal;
  reportProgress: (progress: number) => void;
}>;

export type ToolcraftArtifactExportOwner = Readonly<{
  cancel: () => void;
  dispose: () => Promise<void>;
  getStatus: () => ToolcraftArtifactJobStatus;
  start: <T>(
    run: (context: ToolcraftArtifactJobContext) => T | PromiseLike<T>,
  ) => ToolcraftArtifactJobStart<T>;
  subscribe: (listener: () => void) => () => void;
}>;

type ActiveJob = Readonly<{
  controller: AbortController;
  settled: Promise<void>;
  finishSettlement: () => void;
}>;

/** One artifact at a time. The callback owns cleanup and settles only after it finishes. */
export function createToolcraftArtifactExportOwner(): ToolcraftArtifactExportOwner {
  let status: ToolcraftArtifactJobStatus = Object.freeze({ phase: "idle" });
  let activeJob: ActiveJob | null = null;
  let disposal: Promise<void> | undefined;
  const listeners = new Set<() => void>();

  const publish = (next: ToolcraftArtifactJobStatus): void => {
    status = Object.freeze(next);
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // Like store post-commit observers, subscribers do not own lifecycle settlement.
      }
    }
  };

  const start: ToolcraftArtifactExportOwner["start"] = <T>(
    run: (context: ToolcraftArtifactJobContext) => T | PromiseLike<T>,
  ) => {
    if (status.phase === "disposing" || status.phase === "disposed") {
      throw new ToolcraftArtifactExportError({
        code: "export-owner-disposed",
        message: "The export owner has been disposed.",
      });
    }
    if (activeJob) return { status: "busy" };

    let finishSettlement = () => {};
    const settled = new Promise<void>((resolve) => { finishSettlement = resolve; });
    const job: ActiveJob = {
      controller: new AbortController(),
      finishSettlement,
      settled,
    };
    activeJob = job;
    publish({ phase: "running", progress: 0 });
    const { signal } = job.controller;

    const completion = (async (): Promise<ToolcraftArtifactJobOutcome<T>> => {
      try {
        signal.throwIfAborted();
        const value = await run({
          signal,
          reportProgress: (value) => {
            if (activeJob !== job || status.phase !== "running" || !Number.isFinite(value)) return;
            const progress = Math.max(status.progress, Math.min(1, Math.max(0, value)));
            if (progress !== status.progress) publish({ phase: "running", progress });
          },
        });
        return signal.aborted ? { status: "cancelled" } : { status: "completed", value };
      } catch (error) {
        if (signal.aborted && error === signal.reason) return { status: "cancelled" };
        throw error;
      } finally {
        activeJob = null;
        publish({ phase: status.phase === "disposing" ? "disposed" : "idle" });
        job.finishSettlement();
      }
    })();
    return { status: "started", completion };
  };

  return {
    cancel: () => {
      if (!activeJob || status.phase !== "running") return;
      const job = activeJob;
      publish({ phase: "cancelling", progress: status.progress });
      job.controller.abort();
    },
    dispose: () => {
      if (disposal) return disposal;
      const job = activeJob;
      disposal = job?.settled ?? Promise.resolve();
      if (job && "progress" in status) {
        publish({ phase: "disposing", progress: status.progress });
        job.controller.abort();
      } else {
        publish({ phase: "disposed" });
      }
      return disposal;
    },
    getStatus: () => status,
    start,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
