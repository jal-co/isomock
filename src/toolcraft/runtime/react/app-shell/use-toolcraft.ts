"use client";

import * as React from "react";

import {
  evaluateToolcraftTimelineValue,
  evaluateToolcraftTimelineValues,
} from "../../state/keyframe-evaluation";
import { decodeToolcraftCollectionItemControlAddress } from "../../state/collection-control-address";
import type { ToolcraftStoreDependency } from "../../state/toolcraft-external-store-dependencies";
import type {
  ToolcraftCommand,
  ToolcraftState,
  ToolcraftTimelineKeyframeGroup,
} from "../../state/types";
import { useToolcraftStoreSelector } from "./toolcraft-selectors";
import { ToolcraftContext } from "./toolcraft-root";
import { useToolcraftStore } from "./toolcraft-store-context";

type EvaluatedValueSelection = {
  groups: readonly ToolcraftTimelineKeyframeGroup[];
  state: ToolcraftState;
  target: string;
  timeSeconds: number;
  value: unknown;
};

type EvaluatedValuesSelection = {
  keyframeGroups: ToolcraftTimelineKeyframeGroup[];
  state: ToolcraftState;
  timeSeconds: number;
  values: Record<string, unknown>;
};

const evaluatedValuesDependencies: readonly ToolcraftStoreDependency[] = [
  { kind: "values" },
  { kind: "keyframeGroups" },
];
const implicitEvaluatedValuesDependencies: readonly ToolcraftStoreDependency[] = [
  ...evaluatedValuesDependencies,
  { kind: "playback" },
];

function keyframeGroupsEqual(
  previous: ToolcraftTimelineKeyframeGroup | undefined,
  next: ToolcraftTimelineKeyframeGroup | undefined,
): boolean {
  if (previous === next) {
    return true;
  }

  if (
    !previous ||
    !next ||
    previous.controlId !== next.controlId ||
    previous.label !== next.label ||
    previous.keyframes.length !== next.keyframes.length
  ) {
    return false;
  }

  return previous.keyframes.every(
    (keyframe, index) => keyframe === next.keyframes[index],
  );
}

function keyframeGroupListsEqual(
  previous: readonly ToolcraftTimelineKeyframeGroup[],
  next: readonly ToolcraftTimelineKeyframeGroup[],
): boolean {
  return (
    previous === next ||
    (previous.length === next.length &&
      previous.every((group, index) =>
        keyframeGroupsEqual(group, next[index]),
      ))
  );
}

function valueRecordsEqual(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  if (previous === next) {
    return true;
  }

  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);

  return (
    previousKeys.length === nextKeys.length &&
    previousKeys.every(
      (key) => Object.hasOwn(next, key) && Object.is(previous[key], next[key]),
    )
  );
}

function evaluatedValueSelectionsEqual(
  previous: EvaluatedValueSelection,
  next: EvaluatedValueSelection,
): boolean {
  return (
    previous.target === next.target &&
    Object.is(previous.value, next.value) &&
    Object.is(previous.timeSeconds, next.timeSeconds) &&
    keyframeGroupListsEqual(previous.groups, next.groups)
  );
}

function evaluatedValuesSelectionsEqual(
  previous: EvaluatedValuesSelection,
  next: EvaluatedValuesSelection,
): boolean {
  return (
    Object.is(previous.timeSeconds, next.timeSeconds) &&
    valueRecordsEqual(previous.values, next.values) &&
    keyframeGroupListsEqual(previous.keyframeGroups, next.keyframeGroups)
  );
}

export function useToolcraft() {
  const context = React.useContext(ToolcraftContext);

  if (!context) {
    throw new Error("useToolcraft must be used inside ToolcraftRoot");
  }

  return context;
}

export function useToolcraftSelector<Selected>(
  selector: (state: ToolcraftState) => Selected,
  equality?: (previous: Selected, next: Selected) => boolean,
): Selected {
  return useToolcraftStoreSelector(selector, equality);
}

export function useToolcraftDispatch(): React.Dispatch<ToolcraftCommand> {
  return useToolcraftStore().dispatch;
}

export function useToolcraftValue(target: string): unknown {
  const selector = React.useCallback(
    (state: ToolcraftState) => state.values[target],
    [target],
  );
  const dependencies = React.useMemo<readonly ToolcraftStoreDependency[]>(
    () => [{ kind: "value", target }],
    [target],
  );

  return useToolcraftStoreSelector(selector, Object.is, dependencies);
}

export function useToolcraftEvaluatedValues(timeSeconds?: number): Record<string, unknown> {
  const selector = React.useCallback(
    (state: ToolcraftState): EvaluatedValuesSelection => ({
      keyframeGroups: state.timeline.keyframeGroups,
      state,
      timeSeconds: timeSeconds ?? state.timeline.currentTimeSeconds,
      values: state.values,
    }),
    [timeSeconds],
  );
  const dependencies =
    timeSeconds === undefined
      ? implicitEvaluatedValuesDependencies
      : evaluatedValuesDependencies;
  const selection = useToolcraftStoreSelector(
    selector,
    evaluatedValuesSelectionsEqual,
    dependencies,
  );

  return React.useMemo(
    () =>
      evaluateToolcraftTimelineValues(
        selection.state,
        selection.timeSeconds,
      ),
    [selection],
  );
}

export function useToolcraftEvaluatedValue(target: string, timeSeconds?: number): unknown {
  const selector = React.useCallback(
    (state: ToolcraftState): EvaluatedValueSelection => {
      const groups = state.timeline.keyframeGroups.filter((group) => {
        if (group.controlId === target) return true;
        return (
          decodeToolcraftCollectionItemControlAddress(group.controlId)
            ?.collectionTarget === target
        );
      });

      return {
        groups,
        state,
        target,
        timeSeconds:
          timeSeconds ??
          (groups.length > 0 ? state.timeline.currentTimeSeconds : 0),
        value: state.values[target],
      };
    },
    [target, timeSeconds],
  );
  const usesPlayback = timeSeconds === undefined;
  const dependencies = React.useMemo<readonly ToolcraftStoreDependency[]>(
    () => [
      { kind: "value", target },
      { kind: "keyframeGroup", target },
      ...(usesPlayback ? [{ kind: "playback" } as const] : []),
    ],
    [target, usesPlayback],
  );
  const selection = useToolcraftStoreSelector(
    selector,
    evaluatedValueSelectionsEqual,
    dependencies,
  );

  return React.useMemo(
    () =>
      evaluateToolcraftTimelineValue(
        selection.state,
        selection.target,
        selection.timeSeconds,
      ),
    [selection],
  );
}
