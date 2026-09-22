"use client";

import * as React from "react";

import { useToolcraftStore } from "./toolcraft-store-context";

export function useToolcraftViewportInteractionActive(): boolean {
  const store = useToolcraftStore();

  return React.useSyncExternalStore(
    store.subscribe,
    () => store.hasTransient("viewport"),
    () => false,
  );
}
