import type { ToolcraftExternalStore } from "../../state/toolcraft-external-store";

// Store-scoped UI buffers must commit before pagehide serializes the workspace.
// Native page lifecycle events do not guarantee capture-before-bubble ordering.
const preparations = new WeakMap<ToolcraftExternalStore, Set<() => void>>();

export function registerToolcraftPersistenceFlushPreparation(
  store: ToolcraftExternalStore,
  prepare: () => void,
): () => void {
  const callbacks = preparations.get(store) ?? new Set<() => void>();
  callbacks.add(prepare);
  preparations.set(store, callbacks);
  return () => {
    callbacks.delete(prepare);
    if (callbacks.size === 0) preparations.delete(store);
  };
}

export function prepareToolcraftPersistenceFlush(store: ToolcraftExternalStore): void {
  for (const prepare of preparations.get(store) ?? []) prepare();
}
