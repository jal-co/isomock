import * as React from "react";
import type { ToolcraftState } from "../../state/types";

type Operation = "import" | "save" | null;
function createActivity() {
  let operation: Operation = null;
  const listeners = new Set<() => void>();
  const publish = (next: Operation) => {
    operation = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => operation,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    begin(next: Exclude<Operation, null>): (() => void) | null {
      if (operation !== null) return null;
      publish(next);
      return () => publish(null);
    },
  };
}

// The stable store getter scopes file operations across controls-panel remounts.
const activities = new WeakMap<() => ToolcraftState, ReturnType<typeof createActivity>>();
export function getSettingsTransferActivity(getState: () => ToolcraftState) {
  let activity = activities.get(getState);
  if (!activity) {
    activity = createActivity();
    activities.set(getState, activity);
  }
  return activity;
}

export function useSettingsTransferActivity(getState: () => ToolcraftState) {
  const activity = getSettingsTransferActivity(getState);
  const operation = React.useSyncExternalStore(
    activity.subscribe,
    activity.getSnapshot,
    activity.getSnapshot,
  );
  return { activity, operation };
}
