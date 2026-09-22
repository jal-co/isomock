"use client";

import * as React from "react";

import type { ToolcraftStoreDependency } from "../../state/toolcraft-external-store-dependencies";
import type { ToolcraftState } from "../../state/types";
import { useToolcraftStore } from "./toolcraft-store-context";

type CommittedSelection<Selected> = {
  hasValue: boolean;
  value: Selected | undefined;
};

export function useToolcraftStoreSelector<Selected>(
  selector: (state: ToolcraftState) => Selected,
  equality: (previous: Selected, next: Selected) => boolean = Object.is,
  dependencies?: readonly ToolcraftStoreDependency[],
): Selected {
  const store = useToolcraftStore();
  const committedSelectionRef = React.useRef<CommittedSelection<Selected>>({
    hasValue: false,
    value: undefined,
  });
  const selectorStore = React.useMemo(() => {
    let hasMemo = false;
    let memoizedSelection: Selected;
    let memoizedState: ToolcraftState;

    const selectSnapshot = (state: ToolcraftState): Selected => {
      if (hasMemo && Object.is(memoizedState, state)) {
        return memoizedSelection;
      }

      const selected = selector(state);

      if (hasMemo && equality(memoizedSelection, selected)) {
        memoizedState = state;
        return memoizedSelection;
      }

      if (
        !hasMemo &&
        committedSelectionRef.current.hasValue &&
        equality(
          committedSelectionRef.current.value as Selected,
          selected,
        )
      ) {
        hasMemo = true;
        memoizedSelection = committedSelectionRef.current.value as Selected;
        memoizedState = state;
        return memoizedSelection;
      }

      hasMemo = true;
      memoizedSelection = selected;
      memoizedState = state;
      return selected;
    };

    return {
      getSnapshot: () => selectSnapshot(store.getState()),
    };
  }, [equality, selector, store]);
  const subscribe = React.useMemo(
    () =>
      dependencies
        ? (listener: () => void) =>
            store.subscribeDependencies(dependencies, listener)
        : store.subscribe,
    [dependencies, store],
  );
  const selected = React.useSyncExternalStore(
    subscribe,
    selectorStore.getSnapshot,
    selectorStore.getSnapshot,
  );

  React.useEffect(() => {
    committedSelectionRef.current = {
      hasValue: true,
      value: selected,
    };
  }, [selected]);

  return selected;
}

export function useToolcraftDependencySelector<Selected>(
  selector: (state: ToolcraftState) => Selected,
  equality: (previous: Selected, next: Selected) => boolean,
  dependencies: readonly ToolcraftStoreDependency[],
): Selected {
  return useToolcraftStoreSelector(selector, equality, dependencies);
}

type CommittedSelectorCache<Selected> = {
  equality: (previous: Selected, next: Selected) => boolean;
  selector: (state: ToolcraftState) => Selected;
  state: ToolcraftState;
  value: Selected;
};

export function useToolcraftCommittedSelector<Selected>(
  selector: (state: ToolcraftState) => Selected,
  equality: (previous: Selected, next: Selected) => boolean = Object.is,
): Selected {
  const store = useToolcraftStore();
  const cacheRef = React.useRef<CommittedSelectorCache<Selected> | undefined>(
    undefined,
  );
  const getSnapshot = React.useCallback((): Selected => {
    const state = store.getCommittedState();
    const cache = cacheRef.current;

    if (
      cache &&
      Object.is(cache.state, state) &&
      cache.selector === selector &&
      cache.equality === equality
    ) {
      return cache.value;
    }

    const selected = selector(state);
    const value = cache && equality(cache.value, selected) ? cache.value : selected;

    cacheRef.current = { equality, selector, state, value };
    return value;
  }, [equality, selector, store]);

  return React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
