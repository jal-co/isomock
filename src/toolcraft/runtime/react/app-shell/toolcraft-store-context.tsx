"use client";

import * as React from "react";

import type { ToolcraftExternalStore } from "../../state/toolcraft-external-store";

export const ToolcraftStoreContext =
  React.createContext<ToolcraftExternalStore | null>(null);

export function useToolcraftStore(): ToolcraftExternalStore {
  const store = React.useContext(ToolcraftStoreContext);

  if (!store) {
    throw new Error("useToolcraftStore must be used inside ToolcraftRoot");
  }

  return store;
}
