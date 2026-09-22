import type {
  ToolcraftSourceAssetFeedback,
  ToolcraftSourceAssetOperation,
  ToolcraftSourceAssetOperationUpdate,
} from "./source-asset-types";

export type ToolcraftSourceAssetOperationStore = {
  clearPresentationFeedback: (target: string) => void;
  dispose: () => void;
  getOperation: (target: string) => ToolcraftSourceAssetOperation;
  setOperation: (operation: ToolcraftSourceAssetOperation) => void;
  setPresentationFeedback: (
    target: string,
    feedback: ToolcraftSourceAssetFeedback,
  ) => void;
  subscribe: (listener: () => void) => () => void;
  updateOperation: (
    target: string,
    update: ToolcraftSourceAssetOperationUpdate,
  ) => void;
};

function freezeOperation(
  operation: ToolcraftSourceAssetOperation,
): ToolcraftSourceAssetOperation {
  const feedback = operation.feedback
    ? Object.freeze({ ...operation.feedback })
    : undefined;
  const presentationFeedback = operation.presentationFeedback
    ? Object.freeze({ ...operation.presentationFeedback })
    : undefined;

  return Object.freeze({
    ...operation,
    ...(feedback ? { feedback } : {}),
    ...(presentationFeedback ? { presentationFeedback } : {}),
  });
}

function assertTarget(target: string): void {
  if (target.length === 0 || target.trim() !== target) {
    throw new Error("Source asset operation target must be a non-empty trimmed string");
  }
}

export function createToolcraftSourceAssetOperationStore(): ToolcraftSourceAssetOperationStore {
  const listeners = new Set<() => void>();
  const operations = new Map<string, ToolcraftSourceAssetOperation>();
  let disposed = false;

  const getOperation = (target: string): ToolcraftSourceAssetOperation => {
    assertTarget(target);
    const current = operations.get(target);

    if (current) {
      return current;
    }

    const idle = freezeOperation({ phase: "idle", target });
    operations.set(target, idle);
    return idle;
  };

  const setOperation = (operation: ToolcraftSourceAssetOperation): void => {
    if (disposed) {
      return;
    }

    assertTarget(operation.target);
    if (
      operation.progress !== undefined &&
      (!Number.isFinite(operation.progress) ||
        operation.progress < 0 ||
        operation.progress > 1)
    ) {
      throw new Error("Source asset operation progress must be between 0 and 1");
    }

    operations.set(operation.target, freezeOperation(operation));
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // One observer cannot interrupt publication to the remaining observers.
      }
    }
  };

  return {
    clearPresentationFeedback: (target) => {
      const current = getOperation(target);
      if (!current.presentationFeedback) return;
      const { presentationFeedback: _removed, ...operation } = current;
      setOperation(operation);
    },
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      listeners.clear();
      operations.clear();
    },
    getOperation,
    setOperation,
    setPresentationFeedback: (target, feedback) => {
      setOperation({
        ...getOperation(target),
        presentationFeedback: feedback,
        target,
      });
    },
    subscribe: (listener) => {
      if (disposed) {
        return () => undefined;
      }

      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    updateOperation: (target, update) => {
      const current = getOperation(target);

      setOperation({
        ...current,
        ...update,
        target,
      });
    },
  };
}
