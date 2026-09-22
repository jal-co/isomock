import type { ToolcraftExternalStore } from "../../state/toolcraft-external-store";
import { toolcraftCanvasRotationLockedTarget } from "../../schema/runtime-targets";

type OrientationInteractionRecord = {
  onCancel: () => void;
  ownWriteDepth: number;
  store: ToolcraftExternalStore;
  target: string;
  unsubscribe: () => void;
};

export type ToolcraftOrientationInteractionLease = {
  cancel: () => void;
  release: () => void;
  runOwnWrite: (write: () => void) => boolean;
};

const interactionsByStore = new WeakMap<
  ToolcraftExternalStore,
  Map<string, OrientationInteractionRecord>
>();

function getInteractionMap(
  store: ToolcraftExternalStore,
): Map<string, OrientationInteractionRecord> {
  const current = interactionsByStore.get(store);

  if (current) {
    return current;
  }

  const created = new Map<string, OrientationInteractionRecord>();
  interactionsByStore.set(store, created);
  return created;
}

function isCurrentInteraction(record: OrientationInteractionRecord): boolean {
  return interactionsByStore.get(record.store)?.get(record.target) === record;
}

function closeInteraction(
  record: OrientationInteractionRecord,
  notifyOwner: boolean,
): void {
  if (!isCurrentInteraction(record)) {
    return;
  }

  const interactions = interactionsByStore.get(record.store);
  interactions?.delete(record.target);
  record.unsubscribe();

  if (interactions?.size === 0) {
    interactionsByStore.delete(record.store);
  }

  if (notifyOwner) {
    record.onCancel();
  }
}

export function beginToolcraftOrientationInteraction({
  onCancel,
  store,
  target,
}: {
  onCancel: () => void;
  store: ToolcraftExternalStore;
  target: string;
}): ToolcraftOrientationInteractionLease | null {
  if (store.getState().values[toolcraftCanvasRotationLockedTarget] === true) {
    return null;
  }
  const previous = getInteractionMap(store).get(target);

  if (previous) {
    closeInteraction(previous, true);
  }

  const interactions = getInteractionMap(store);
  const record: OrientationInteractionRecord = {
    onCancel,
    ownWriteDepth: 0,
    store,
    target,
    unsubscribe: () => undefined,
  };
  interactions.set(target, record);
  record.unsubscribe = store.subscribeSelector(
    (state) => ({
      locked: state.values[toolcraftCanvasRotationLockedTarget] === true,
      pose: state.values[target],
    }),
    () => {
      if (
        store.getState().values[toolcraftCanvasRotationLockedTarget] === true ||
        record.ownWriteDepth === 0
      ) {
        closeInteraction(record, true);
      }
    },
    (previous, next) =>
      previous.locked === next.locked && Object.is(previous.pose, next.pose),
  );

  return {
    cancel: () => closeInteraction(record, true),
    release: () => closeInteraction(record, false),
    runOwnWrite: (write) => {
      if (
        store.getState().values[toolcraftCanvasRotationLockedTarget] === true
      ) {
        closeInteraction(record, true);
      }
      if (!isCurrentInteraction(record)) {
        return false;
      }

      record.ownWriteDepth += 1;
      try {
        write();
      } finally {
        record.ownWriteDepth -= 1;
      }

      return isCurrentInteraction(record);
    },
  };
}
