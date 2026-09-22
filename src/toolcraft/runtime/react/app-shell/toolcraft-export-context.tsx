"use client";

import * as React from "react";
import { createToolcraftArtifactExportOwner, type ToolcraftArtifactExportOwner } from "../../export/artifact-export-owner";
import type { ToolcraftExternalStore } from "../../state/toolcraft-external-store";

type ExportOwnerEntry = {
  generation: number;
  leases: number;
  owner: ToolcraftArtifactExportOwner;
};

const owners = new WeakMap<ToolcraftExternalStore, ExportOwnerEntry>();
const ExportContext = React.createContext<ToolcraftArtifactExportOwner | null>(null);

function getOwner(store: ToolcraftExternalStore): ExportOwnerEntry {
  let entry = owners.get(store);
  if (!entry || entry.owner.getStatus().phase === "disposed") {
    entry = { generation: 0, leases: 0, owner: createToolcraftArtifactExportOwner() };
    owners.set(store, entry);
  }
  return entry;
}

export function ToolcraftExportProvider({ children, store }: {
  children: React.ReactNode;
  store: ToolcraftExternalStore;
}): React.JSX.Element {
  const entry = getOwner(store);
  // A later reconnect waits for the retired job, then receives a fresh shared owner.
  // Observe only owner identity/terminal settlement, not per-frame progress.
  React.useSyncExternalStore(
    entry.owner.subscribe,
    () => entry.owner.getStatus().phase === "disposed" ? null : entry.owner,
    () => entry.owner.getStatus().phase === "disposed" ? null : entry.owner,
  );
  React.useLayoutEffect(() => {
    entry.generation += 1;
    entry.leases += 1;
    return () => {
      entry.leases -= 1;
      const generation = ++entry.generation;
      // StrictMode reconnect of this exact entry invalidates only this deferred teardown.
      queueMicrotask(() => {
        if (entry.leases !== 0 || entry.generation !== generation) return;
        void entry.owner.dispose().finally(() => {
          if (owners.get(store) === entry) owners.delete(store);
        });
      });
    };
  }, [entry, store]);
  return <ExportContext.Provider value={entry.owner}>{children}</ExportContext.Provider>;
}

export function useToolcraftExportOwner(): ToolcraftArtifactExportOwner {
  const owner = React.useContext(ExportContext);
  if (!owner) throw new Error("Toolcraft export actions require ToolcraftRoot.");
  return owner;
}
