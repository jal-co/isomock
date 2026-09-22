import {
  getAppliedToolcraftHistoryPatch,
  getToolcraftHistoryPatchHotFieldTouches,
  mergeToolcraftDurableHistory,
} from "./toolcraft-external-store-history";
import type {
  ToolcraftCommand,
  ToolcraftPoint,
  ToolcraftState,
} from "./types";

export type ToolcraftDurableStoreTransition = {
  changed: boolean;
  offsetTouched: boolean;
  playbackTouched: boolean;
  state: ToolcraftState;
  zoomTouched: boolean;
};

function pointsEqual(previous: ToolcraftPoint, next: ToolcraftPoint): boolean {
  return Object.is(previous.x, next.x) && Object.is(previous.y, next.y);
}

function mergeTimelineTime(
  effectiveTimeline: ToolcraftState["timeline"],
  committedTimeline: ToolcraftState["timeline"],
  playbackTouched: boolean,
): ToolcraftState["timeline"] {
  const currentTimeSeconds = playbackTouched
    ? effectiveTimeline.currentTimeSeconds
    : committedTimeline.currentTimeSeconds;

  if (
    Object.is(
      effectiveTimeline.currentTimeSeconds,
      currentTimeSeconds,
    )
  ) {
    return effectiveTimeline;
  }

  return {
    ...effectiveTimeline,
    currentTimeSeconds,
  };
}

function mergeCanvasHotFields(
  effectiveCanvas: ToolcraftState["canvas"],
  committedCanvas: ToolcraftState["canvas"],
  offsetTouched: boolean,
  zoomTouched: boolean,
): ToolcraftState["canvas"] {
  const offset = offsetTouched
    ? effectiveCanvas.offset
    : committedCanvas.offset;
  const zoom = zoomTouched ? effectiveCanvas.zoom : committedCanvas.zoom;

  if (
    pointsEqual(effectiveCanvas.offset, offset) &&
    Object.is(effectiveCanvas.zoom, zoom)
  ) {
    return effectiveCanvas;
  }

  return {
    ...effectiveCanvas,
    offset,
    zoom,
  };
}

export function reduceToolcraftDurableStoreTransition(
  committedState: ToolcraftState,
  effectiveState: ToolcraftState,
  command: ToolcraftCommand,
  toolcraftReducer: (state: ToolcraftState, command: ToolcraftCommand) => ToolcraftState,
): ToolcraftDurableStoreTransition {
  const committedResult = toolcraftReducer(committedState, command);
  const effectiveResult = toolcraftReducer(effectiveState, command);
  let offsetTouched =
    !pointsEqual(committedState.canvas.offset, committedResult.canvas.offset) ||
    !pointsEqual(effectiveState.canvas.offset, effectiveResult.canvas.offset);
  let zoomTouched =
    !Object.is(committedState.canvas.zoom, committedResult.canvas.zoom) ||
    !Object.is(effectiveState.canvas.zoom, effectiveResult.canvas.zoom);
  let playbackTouched =
    !Object.is(
      committedState.timeline.currentTimeSeconds,
      committedResult.timeline.currentTimeSeconds,
    ) ||
    !Object.is(
      effectiveState.timeline.currentTimeSeconds,
      effectiveResult.timeline.currentTimeSeconds,
    );
  const appliedHistoryPatch = getAppliedToolcraftHistoryPatch(
    committedState.history,
    committedResult.history,
  );

  if (appliedHistoryPatch) {
    ({ offsetTouched, playbackTouched, zoomTouched } =
      getToolcraftHistoryPatchHotFieldTouches(appliedHistoryPatch));
  }

  playbackTouched =
    playbackTouched ||
    (effectiveState.timeline.isPlaying &&
      !effectiveResult.timeline.isPlaying);

  const canvas = mergeCanvasHotFields(
    effectiveResult.canvas,
    committedResult.canvas,
    offsetTouched,
    zoomTouched,
  );
  const timeline = mergeTimelineTime(
    effectiveResult.timeline,
    committedResult.timeline,
    playbackTouched,
  );
  const durableResult = {
    ...effectiveResult,
    canvas,
    timeline,
  };
  return {
    changed:
      committedResult !== committedState || effectiveResult !== effectiveState,
    offsetTouched,
    playbackTouched,
    state: {
      ...durableResult,
      history: mergeToolcraftDurableHistory(
        effectiveResult.history,
        committedResult.history,
        committedState,
        durableResult,
      ),
    },
    zoomTouched,
  };
}
