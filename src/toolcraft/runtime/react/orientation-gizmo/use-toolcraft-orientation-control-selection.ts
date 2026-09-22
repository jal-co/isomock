"use client";

import * as React from "react";

import type { ToolcraftStoreDependency } from "../../state/toolcraft-external-store-dependencies";
import type { ToolcraftState } from "../../state/types";
import { useToolcraftDependencySelector } from "../app-shell/toolcraft-selectors";
import { useToolcraftStore } from "../app-shell/toolcraft-store-context";
import {
  getToolcraftControlVisibilityTargets,
  getToolcraftSectionVisibilityTargets,
} from "../controls-panel/conditions/control-conditions";
import {
  getToolcraftOrientationControlEntries,
  resolveToolcraftOrientationControl,
  type ToolcraftOrientationControlEntry,
} from "./orientation-gizmo-selection";

export type ToolcraftOrientationControlSelection = Readonly<{
  control: ToolcraftOrientationControlEntry["control"] | null;
  id: string | null;
  value: unknown;
}>;

function selectionsEqual(
  previous: ToolcraftOrientationControlSelection,
  next: ToolcraftOrientationControlSelection,
): boolean {
  return previous.control === next.control &&
    previous.id === next.id &&
    Object.is(previous.value, next.value);
}

function getDependencies(
  entries: readonly ToolcraftOrientationControlEntry[],
): ToolcraftStoreDependency[] {
  const targets = new Set<string>();
  for (const { control, section } of entries) {
    targets.add(control.target);
    for (const target of getToolcraftControlVisibilityTargets(control)) {
      targets.add(target);
    }
    for (const target of getToolcraftSectionVisibilityTargets(section)) {
      targets.add(target);
    }
  }
  return [...targets].map((target) => ({ kind: "value", target }) as const);
}

export function useToolcraftOrientationControlSelection(): ToolcraftOrientationControlSelection {
  const store = useToolcraftStore();
  const entries = React.useMemo(
    () => getToolcraftOrientationControlEntries(
      store.getCommittedState().schema.panels.controls?.sections ?? [],
    ),
    [store],
  );
  const dependencies = React.useMemo(() => getDependencies(entries), [entries]);

  return useToolcraftDependencySelector(
    React.useCallback(
      (state: ToolcraftState): ToolcraftOrientationControlSelection => {
        const entry = resolveToolcraftOrientationControl(state, entries);
        return entry
          ? {
              control: entry.control,
              id: entry.id,
              value: state.values[entry.control.target],
            }
          : { control: null, id: null, value: undefined };
      },
      [entries],
    ),
    selectionsEqual,
    dependencies,
  );
}
