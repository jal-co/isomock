import { toolcraftTimelineKeyframeGroupsEqual } from "./toolcraft-keyframe-equality";
import {
  getToolcraftControlsResetHistorySource,
  getToolcraftHistoryPatchSource,
  type ToolcraftInternalHistoryPatchSource,
} from "./history-patch-metadata";
import type { ToolcraftState } from "./types";
import { decodeToolcraftCollectionItemControlAddress } from "./collection-control-address";

const trackedHistorySources = [
  getToolcraftControlsResetHistorySource(),
] as const satisfies readonly ToolcraftInternalHistoryPatchSource[];

export type ToolcraftStoreDependency =
  | { kind: "canvas.mode" }
  | { kind: "canvas.size" }
  | { kind: "history.source"; source: ToolcraftInternalHistoryPatchSource }
  | { kind: "keyframeGroup"; target: string }
  | { kind: "keyframeGroups" }
  | { kind: "keyframeSelection"; target: string }
  | { kind: "mediaAssets" }
  | { kind: "panels.timeline" }
  | { kind: "playback" }
  | { kind: "timeline.expanded" }
  | { kind: "value"; target: string }
  | { kind: "values" }
  | { kind: "viewport.offset" }
  | { kind: "viewport.zoom" };

export type ToolcraftStoreChanges = {
  canvasModeChanged: boolean;
  canvasSizeChanged: boolean;
  historySourcesChanged: ReadonlySet<ToolcraftInternalHistoryPatchSource>;
  keyframeGroupsChanged: boolean;
  keyframeSelectionTargets: ReadonlySet<string>;
  keyframeTargets: ReadonlySet<string>;
  mediaAssetsChanged: boolean;
  panelsTimelineChanged: boolean;
  playbackChanged: boolean;
  timelineExpandedChanged: boolean;
  valueTargets: ReadonlySet<string>;
  valuesChanged: boolean;
  viewportOffsetChanged: boolean;
  viewportZoomChanged: boolean;
};

function getSelectedKeyframeTarget(state: ToolcraftState): string | null {
  const selectedKeyframeId = state.timeline.selectedKeyframeId;

  if (!selectedKeyframeId) {
    return null;
  }

  return (
    state.timeline.keyframeGroups.find((group) =>
      group.keyframes.some((keyframe) => keyframe.id === selectedKeyframeId),
    )?.controlId ?? null
  );
}

function getChangedKeyframeSelectionTargets(
  previous: ToolcraftState,
  next: ToolcraftState,
): Set<string> {
  if (
    previous.timeline.selectedKeyframeId === next.timeline.selectedKeyframeId &&
    previous.timeline.keyframeGroups === next.timeline.keyframeGroups
  ) {
    return new Set();
  }

  const previousTarget = getSelectedKeyframeTarget(previous);
  const nextTarget = getSelectedKeyframeTarget(next);

  if (
    previous.timeline.selectedKeyframeId === next.timeline.selectedKeyframeId &&
    previousTarget === nextTarget
  ) {
    return new Set();
  }

  const targets = new Set(
    [previousTarget, nextTarget].filter(
      (target): target is string => target !== null,
    ),
  );
  for (const target of [...targets]) {
    const address = decodeToolcraftCollectionItemControlAddress(target);
    if (address) targets.add(address.collectionTarget);
  }
  return targets;
}

function addHistorySource(
  sources: Set<ToolcraftInternalHistoryPatchSource>,
  source: ToolcraftInternalHistoryPatchSource | undefined,
): void {
  if (source) {
    sources.add(source);
  }
}

function getChangedHistorySources(
  previous: ToolcraftState["history"],
  next: ToolcraftState["history"],
): Set<ToolcraftInternalHistoryPatchSource> {
  if (previous.undo === next.undo) {
    return new Set();
  }

  const previousLength = previous.undo.length;
  const nextLength = next.undo.length;
  const previousTail = previous.undo.at(-1);
  const nextTail = next.undo.at(-1);
  const sources = new Set<ToolcraftInternalHistoryPatchSource>();
  const appended =
    nextLength === previousLength + 1 &&
    (previousLength === 0 || next.undo[previousLength - 1] === previousTail);

  if (appended) {
    addHistorySource(sources, getToolcraftHistoryPatchSource(nextTail));
    return sources;
  }

  const popped =
    nextLength === previousLength - 1 &&
    (nextLength === 0 || previous.undo[nextLength - 1] === nextTail);

  if (popped) {
    addHistorySource(sources, getToolcraftHistoryPatchSource(previousTail));
    return sources;
  }

  if (nextLength === previousLength) {
    const previousSource = getToolcraftHistoryPatchSource(previousTail);
    const nextSource = getToolcraftHistoryPatchSource(nextTail);

    if (previousSource !== nextSource) {
      addHistorySource(sources, previousSource);
      addHistorySource(sources, nextSource);
    }

    return sources;
  }

  return new Set(trackedHistorySources);
}

export function getToolcraftHistorySourceGeneration(
  history: ToolcraftState["history"],
  source: ToolcraftInternalHistoryPatchSource,
): number {
  let generation = 0;

  for (const patch of history.undo) {
    if (getToolcraftHistoryPatchSource(patch) === source) {
      generation += 1;
    }
  }

  return generation;
}

function getChangedRecordKeys(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): Set<string> {
  if (previous === next) {
    return new Set();
  }

  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);

  for (const key of keys) {
    if (Object.is(previous[key], next[key])) {
      keys.delete(key);
    }
  }

  return keys;
}

function getChangedKeyframeTargets(
  previous: ToolcraftState["timeline"]["keyframeGroups"],
  next: ToolcraftState["timeline"]["keyframeGroups"],
): Set<string> {
  if (previous === next) {
    return new Set();
  }

  const previousByTarget = new Map(
    previous.map((group) => [group.controlId, group]),
  );
  const nextByTarget = new Map(next.map((group) => [group.controlId, group]));
  const targets = new Set([
    ...previousByTarget.keys(),
    ...nextByTarget.keys(),
  ]);

  for (const target of targets) {
    if (
      toolcraftTimelineKeyframeGroupsEqual(
        previousByTarget.get(target),
        nextByTarget.get(target),
      )
    ) {
      targets.delete(target);
    }
  }

  for (const target of [...targets]) {
    const address = decodeToolcraftCollectionItemControlAddress(target);
    if (address) targets.add(address.collectionTarget);
  }

  return targets;
}

export function getToolcraftStoreChanges(
  previous: ToolcraftState,
  next: ToolcraftState,
): ToolcraftStoreChanges {
  const valueTargets = getChangedRecordKeys(previous.values, next.values);
  const keyframeTargets = getChangedKeyframeTargets(
    previous.timeline.keyframeGroups,
    next.timeline.keyframeGroups,
  );
  const keyframeSelectionTargets = getChangedKeyframeSelectionTargets(
    previous,
    next,
  );
  const historySourcesChanged = getChangedHistorySources(
    previous.history,
    next.history,
  );

  return {
    canvasModeChanged: !Object.is(previous.canvas.mode, next.canvas.mode),
    canvasSizeChanged: !Object.is(previous.canvas.size, next.canvas.size),
    historySourcesChanged,
    keyframeGroupsChanged: keyframeTargets.size > 0,
    keyframeSelectionTargets,
    keyframeTargets,
    mediaAssetsChanged: !Object.is(previous.mediaAssets, next.mediaAssets),
    panelsTimelineChanged: !Object.is(
      previous.panels.timeline,
      next.panels.timeline,
    ),
    playbackChanged: !Object.is(
      previous.timeline.currentTimeSeconds,
      next.timeline.currentTimeSeconds,
    ),
    timelineExpandedChanged: !Object.is(
      previous.timeline.expanded,
      next.timeline.expanded,
    ),
    valueTargets,
    valuesChanged: valueTargets.size > 0,
    viewportOffsetChanged:
      !Object.is(previous.canvas.offset.x, next.canvas.offset.x) ||
      !Object.is(previous.canvas.offset.y, next.canvas.offset.y),
    viewportZoomChanged: !Object.is(previous.canvas.zoom, next.canvas.zoom),
  };
}

export function toolcraftStoreDependenciesChanged(
  dependencies: readonly ToolcraftStoreDependency[],
  changes: ToolcraftStoreChanges,
): boolean {
  return dependencies.some((dependency) => {
    switch (dependency.kind) {
      case "canvas.mode":
        return changes.canvasModeChanged;
      case "canvas.size":
        return changes.canvasSizeChanged;
      case "history.source":
        return changes.historySourcesChanged.has(dependency.source);
      case "keyframeGroup":
        return changes.keyframeTargets.has(dependency.target);
      case "keyframeGroups":
        return changes.keyframeGroupsChanged;
      case "keyframeSelection":
        return changes.keyframeSelectionTargets.has(dependency.target);
      case "mediaAssets":
        return changes.mediaAssetsChanged;
      case "panels.timeline":
        return changes.panelsTimelineChanged;
      case "playback":
        return changes.playbackChanged;
      case "timeline.expanded":
        return changes.timelineExpandedChanged;
      case "value":
        return changes.valueTargets.has(dependency.target);
      case "values":
        return changes.valuesChanged;
      case "viewport.offset":
        return changes.viewportOffsetChanged;
      case "viewport.zoom":
        return changes.viewportZoomChanged;
    }
  });
}
