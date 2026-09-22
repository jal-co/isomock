import { evaluateToolcraftTimelineValues } from "../state/keyframe-evaluation";
import type { ReadonlyToolcraftState } from "../state/readonly-state";
import { freezeToolcraftArtifactMetadata } from "./artifact-export-snapshot";

export type ToolcraftArtifactFrameState = ReadonlyToolcraftState;

export function getToolcraftArtifactTimelineProgress(
  state: ReadonlyToolcraftState,
): number {
  if (state.timeline.durationSeconds <= 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      1,
      state.timeline.currentTimeSeconds / state.timeline.durationSeconds,
    ),
  );
}

export function createToolcraftArtifactFrameState(
  baseState: ReadonlyToolcraftState,
  timeSeconds: number,
): ToolcraftArtifactFrameState {
  const values = evaluateToolcraftTimelineValues(baseState, timeSeconds);
  // Evaluated compound values can be newly allocated; the shared base is already immutable.
  freezeToolcraftArtifactMetadata(values);
  return Object.freeze({
    ...baseState,
    timeline: Object.freeze({
      ...baseState.timeline,
      currentTimeSeconds: timeSeconds,
      isPlaying: false,
    }),
    values,
  });
}
