import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import type { ToolcraftPersistencePayload } from "./persistence-shared";
import type { ToolcraftState } from "./types";
import { equalToolcraftPersistenceSnapshots } from "./persistence-snapshot-equality";

export type ToolcraftPersistenceStorage = Pick<Storage, "getItem" | "setItem">;

export type ToolcraftPersistenceWriteResult =
  | { status: "disabled" | "success" }
  | {
      reason: "incompatible-version" | "stale-snapshot" | "quota" | "unavailable" | "unknown";
      status: "failed";
    };

export type ToolcraftPersistenceStatus = ToolcraftPersistenceWriteResult | { status: "pending" };

type PersistenceFailure = Extract<ToolcraftPersistenceWriteResult, { status: "failed" }>;

// Owned by the store: effect restarts must not adopt another tab's snapshot.
export type ToolcraftPersistenceCheckpoint = {
  current?: { snapshot: string | null } | PersistenceFailure;
};

export type ToolcraftPersistenceController = {
  dispose(): ToolcraftPersistenceWriteResult;
  flush(): ToolcraftPersistenceWriteResult;
  getStatus(): ToolcraftPersistenceStatus;
  schedule(): void;
};

function classifyPersistenceFailure(
  error: unknown,
): Extract<ToolcraftPersistenceWriteResult, { status: "failed" }>["reason"] {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    if (error.name === "QuotaExceededError") {
      return "quota";
    }

    if (error.name === "InvalidStateError" || error.name === "SecurityError") {
      return "unavailable";
    }
  }

  return "unknown";
}

export function createToolcraftPersistenceController({
  blockedReason,
  checkpoint = {},
  debounceMs = 120,
  getCommittedState,
  createSnapshot,
  onStatusChange,
  schema,
  storage,
}: {
  blockedReason?: "incompatible-version";
  checkpoint?: ToolcraftPersistenceCheckpoint;
  debounceMs?: number;
  getCommittedState: () => ToolcraftState;
  createSnapshot: (
    state: ToolcraftState,
    persistence: ResolvedToolcraftAppSchema["persistence"],
  ) => ToolcraftPersistencePayload | undefined;
  onStatusChange?: (status: ToolcraftPersistenceStatus) => void;
  schema: ResolvedToolcraftAppSchema;
  storage?: ToolcraftPersistenceStorage;
}): ToolcraftPersistenceController {
  let disposed = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  if (!blockedReason && schema.persistence.storage === "localStorage" && !checkpoint.current) {
    try {
      checkpoint.current = storage
        ? { snapshot: storage.getItem(schema.persistence.key) }
        : { status: "failed", reason: "unavailable" };
    } catch (error) {
      checkpoint.current = { status: "failed", reason: classifyPersistenceFailure(error) };
    }
  }
  let status: ToolcraftPersistenceStatus =
    blockedReason === "incompatible-version"
      ? { reason: "incompatible-version", status: "failed" }
      : schema.persistence.storage === "localStorage"
        ? { status: "pending" }
        : { status: "disabled" };

  const publishStatus = (nextStatus: ToolcraftPersistenceStatus): void => {
    status = nextStatus;
    onStatusChange?.(status);
  };

  const clearScheduledFlush = (): void => {
    if (timer === undefined) {
      return;
    }

    clearTimeout(timer);
    timer = undefined;
  };

  const flush = (): ToolcraftPersistenceWriteResult => {
    if (blockedReason === "incompatible-version") {
      const result = {
        reason: "incompatible-version",
        status: "failed",
      } as const;

      publishStatus(result);
      return result;
    }

    if (schema.persistence.storage !== "localStorage") {
      const result = { status: "disabled" } as const;

      publishStatus(result);
      return result;
    }

    clearScheduledFlush();
    pending = false;

    if (checkpoint.current && "reason" in checkpoint.current) {
      publishStatus(checkpoint.current);
      return checkpoint.current;
    }

    if (!storage) {
      const result = { reason: "unavailable", status: "failed" } as const;

      publishStatus(result);
      return result;
    }

    try {
      const snapshot = createSnapshot(getCommittedState(), schema.persistence);

      if (!snapshot) {
        const result = { status: "disabled" } as const;

        publishStatus(result);
        return result;
      }

      const serialized = JSON.stringify(snapshot);
      const saved = storage.getItem(schema.persistence.key);
      if (
        !checkpoint.current ||
        !equalToolcraftPersistenceSnapshots(saved, checkpoint.current.snapshot)
      ) {
        const result = { reason: "stale-snapshot", status: "failed" } as const;
        checkpoint.current = result;
        publishStatus(result);
        return result;
      }
      if (equalToolcraftPersistenceSnapshots(saved, serialized)) {
        checkpoint.current = { snapshot: saved };
      } else {
        storage.setItem(schema.persistence.key, serialized);
        checkpoint.current = { snapshot: serialized };
      }

      const result = { status: "success" } as const;

      publishStatus(result);
      return result;
    } catch (error) {
      const result = {
        reason: classifyPersistenceFailure(error),
        status: "failed",
      } as const;

      publishStatus(result);
      return result;
    }
  };

  return {
    dispose() {
      if (disposed) {
        return status.status === "pending" ? flush() : status;
      }

      const result = pending ? flush() : status.status === "pending" ? flush() : status;

      disposed = true;
      clearScheduledFlush();
      return result;
    },
    flush,
    getStatus() {
      return status;
    },
    schedule() {
      if (
        blockedReason === "incompatible-version" ||
        disposed ||
        schema.persistence.storage !== "localStorage"
      ) {
        return;
      }

      if (checkpoint.current && "reason" in checkpoint.current) {
        publishStatus(checkpoint.current);
        return;
      }

      clearScheduledFlush();
      pending = true;
      publishStatus({ status: "pending" });
      timer = setTimeout(() => {
        timer = undefined;
        flush();
      }, debounceMs);
    },
  };
}
