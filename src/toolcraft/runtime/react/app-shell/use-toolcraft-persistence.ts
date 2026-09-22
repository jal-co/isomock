"use client";

import * as React from "react";

import type { ToolcraftPersistableStateSlice } from "../../schema/types";
import type { ResolvedToolcraftAppSchema } from "../../schema/resolved-app-schema";
import {
  createToolcraftPersistenceController,
  type ToolcraftPersistenceCheckpoint,
  type ToolcraftPersistenceStatus,
} from "../../composition/public-persistence";
import { getToolcraftPersistedValueTargets } from "../../state/persistence-value-targets";
import type { ToolcraftExternalStore } from "../../state/toolcraft-external-store";
import type { ToolcraftState } from "../../state/types";
import { prepareToolcraftPersistenceFlush } from "./persistence-flush-preparation";

const ToolcraftPersistenceStatusContext = React.createContext<ToolcraftPersistenceStatus>({
  status: "disabled",
});

function getPersistedStateReferences(
  state: ToolcraftState,
  include: readonly ToolcraftPersistableStateSlice[],
  additionalValueTargets: readonly string[],
): readonly unknown[] {
  const references: unknown[] = [];

  for (const slice of include) {
    switch (slice) {
      case "canvas":
        references.push(state.canvas);
        break;
      case "layers":
        references.push(state.layers, state.selectedLayerId);
        break;
      case "media":
        references.push(state.mediaAssets);
        break;
      case "panels":
        references.push(state.panels);
        break;
      case "timeline":
        references.push(state.timeline);
        break;
      case "values":
        references.push(state.controlRanges);
        for (const target of getToolcraftPersistedValueTargets(
          state.defaults,
          additionalValueTargets,
        )) {
          references.push(target, Object.hasOwn(state.values, target), state.values[target]);
        }
        break;
    }
  }

  return references;
}

function persistedStateReferencesEqual(
  previous: readonly unknown[],
  next: readonly unknown[],
): boolean {
  return (
    previous.length === next.length &&
    previous.every((value, index) => Object.is(value, next[index]))
  );
}

function isPersistenceHydrationPending(
  state: ToolcraftState,
  include: readonly ToolcraftPersistableStateSlice[],
): boolean {
  return (
    include.includes("media") &&
    state.mediaAssets.some((asset) => "lifecycle" in asset && asset.lifecycle === "restoring")
  );
}

export function useToolcraftPersistence(
  schema: ResolvedToolcraftAppSchema,
  store: ToolcraftExternalStore,
  options: {
    authority?: "runtime" | "external";
    blockedReason?: "incompatible-version";
    checkpoint?: ToolcraftPersistenceCheckpoint;
    storageKind?: "localStorage" | "sessionStorage";
  } = {},
): ToolcraftPersistenceStatus {
  const checkpoint = React.useMemo<ToolcraftPersistenceCheckpoint>(
    () => options.checkpoint ?? {},
    [options.checkpoint, store],
  );
  const [status, setStatus] = React.useState<ToolcraftPersistenceStatus>(() =>
    options.authority === "external"
      ? { status: "disabled" }
      : options.blockedReason === "incompatible-version"
      ? { reason: "incompatible-version", status: "failed" }
      : schema.persistence.storage === "localStorage"
        ? { status: "pending" }
        : { status: "disabled" },
  );

  React.useEffect(() => {
    const persistence = schema.persistence;

    if (options.authority === "external" || persistence.storage !== "localStorage" || typeof window === "undefined") {
      setStatus({ status: "disabled" });
      return undefined;
    }

    let mounted = true;
    let storage: Storage | undefined;
    try {
      storage = window[options.storageKind ?? "localStorage"];
    } catch {
      // Let the controller report its existing unavailable-storage result.
    }
    const controller = createToolcraftPersistenceController({
      blockedReason: options.blockedReason,
      checkpoint,
      getCommittedState: store.getCommittedState,
      onStatusChange: (nextStatus) => {
        if (mounted) {
          setStatus(nextStatus);
        }
      },
      schema,
      storage,
    });
    const scheduleWhenHydrated = (): void => {
      if (!isPersistenceHydrationPending(store.getCommittedState(), persistence.include)) {
        controller.schedule();
      }
    };
    const unsubscribe = store.subscribeSelector(
      () =>
        getPersistedStateReferences(
          store.getCommittedState(),
          persistence.include,
          persistence.additionalValueTargets,
        ),
      scheduleWhenHydrated,
      persistedStateReferencesEqual,
    );
    const handlePageHide = (): void => {
      prepareToolcraftPersistenceFlush(store);
      controller.flush();
    };

    window.addEventListener("pagehide", handlePageHide);
    scheduleWhenHydrated();

    return () => {
      mounted = false;
      window.removeEventListener("pagehide", handlePageHide);
      unsubscribe();
      controller.dispose();
    };
  }, [checkpoint, options.authority, options.blockedReason, options.storageKind, schema, store]);

  return status;
}

export function ToolcraftPersistenceStatusProvider({
  children,
  status,
}: {
  children: React.ReactNode;
  status: ToolcraftPersistenceStatus;
}): React.JSX.Element {
  return React.createElement(
    ToolcraftPersistenceStatusContext.Provider,
    { value: status },
    children,
  );
}

export function useToolcraftPersistenceStatus(): ToolcraftPersistenceStatus {
  return React.useContext(ToolcraftPersistenceStatusContext);
}
