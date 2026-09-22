"use client";
import * as React from 'react';
import type { ToolcraftHistoryPort } from '../../composition/history-port';
import type { ToolcraftExternalStore } from '../../state/toolcraft-external-store';

export const ToolcraftHistoryContext = React.createContext<ToolcraftHistoryPort | null>(null);

export function createRuntimeHistoryPort(store: ToolcraftExternalStore): ToolcraftHistoryPort {
  let previous = { canUndo: false, canRedo: false, available: true };
  return {
    getSnapshot() {
      const state = store.getState();
      const canUndo = state.history.authority?.canUndo ?? state.history.undo.length > 0;
      const canRedo = state.history.authority?.canRedo ?? state.history.redo.length > 0;
      if (canUndo !== previous.canUndo || canRedo !== previous.canRedo) previous = { canUndo, canRedo, available: true };
      return previous;
    },
    subscribe: store.subscribe,
    async undo() { store.dispatch({ type: 'history.undo' }); },
    async redo() { store.dispatch({ type: 'history.redo' }); },
  };
}

export function useToolcraftHistory() {
  const port = React.useContext(ToolcraftHistoryContext);
  if (!port) throw new Error('History must be used inside a Toolcraft root.');
  const state = React.useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  return { port, state };
}

export function requestToolcraftHistory(port: ToolcraftHistoryPort, command: 'undo' | 'redo') {
  void port[command]().catch(() => {});
}
