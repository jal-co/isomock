import { toolcraftTimelineKeyframeGroupListsEqual } from "./toolcraft-keyframe-equality";
import {
  getToolcraftHistoryPatchDomains,
  getToolcraftHistoryPatchSource,
  tagToolcraftHistoryPatchDomains,
  tagToolcraftHistoryPatchSource,
  isToolcraftWorkspaceResetHistoryPatch,
} from "./history-patch-metadata";
import type {
  ToolcraftHistoryPatch,
  ToolcraftState,
  ToolcraftTimelineState,
} from "./types";

export type ToolcraftHotFieldTouches = {
  offsetTouched: boolean;
  playbackTouched: boolean;
  zoomTouched: boolean;
};

const emptyPatchSide: Record<string, unknown> = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStructuralTimeline(
  side: Record<string, unknown>,
): ToolcraftTimelineState | undefined {
  return isRecord(side.timeline)
    ? (side.timeline as ToolcraftTimelineState)
    : undefined;
}

function timelinesEqualWithoutCurrentTime(
  previous: ToolcraftTimelineState,
  next: ToolcraftTimelineState,
): boolean {
  return (
    Object.is(previous.durationSeconds, next.durationSeconds) &&
    previous.expanded === next.expanded &&
    previous.isLooping === next.isLooping &&
    previous.isPlaying === next.isPlaying &&
    previous.selectedKeyframeId === next.selectedKeyframeId &&
    toolcraftTimelineKeyframeGroupListsEqual(
      previous.keyframeGroups,
      next.keyframeGroups,
    )
  );
}

function selectStructuralTimeline(
  effective: ToolcraftTimelineState | undefined,
  committed: ToolcraftTimelineState | undefined,
): ToolcraftTimelineState | undefined {
  if (!effective) {
    return committed;
  }

  if (!committed) {
    return effective;
  }

  return timelinesEqualWithoutCurrentTime(effective, committed)
    ? committed
    : effective;
}

export function getToolcraftHistoryPatchHotFieldTouches(
  patch: ToolcraftHistoryPatch,
): ToolcraftHotFieldTouches {
  if (isToolcraftWorkspaceResetHistoryPatch(patch)) {
    return { offsetTouched: true, playbackTouched: true, zoomTouched: true };
  }
  const statePatch = getToolcraftHistoryPatchDomains(patch)?.state ?? patch;
  const beforeTimeline = readStructuralTimeline(statePatch.before);
  const afterTimeline = readStructuralTimeline(statePatch.after);

  return {
    offsetTouched: false,
    playbackTouched:
      Boolean(beforeTimeline || afterTimeline) &&
      (!beforeTimeline ||
        !afterTimeline ||
        !Object.is(
          beforeTimeline.currentTimeSeconds,
          afterTimeline.currentTimeSeconds,
        )),
    zoomTouched: false,
  };
}

export function getAppliedToolcraftHistoryPatch(
  previous: ToolcraftState["history"],
  next: ToolcraftState["history"],
): ToolcraftHistoryPatch | undefined {
  const undoPatch = previous.undo.at(-1);

  if (
    undoPatch &&
    next.undo.length === previous.undo.length - 1 &&
    next.redo.length === previous.redo.length + 1 &&
    next.redo.at(-1) === undoPatch
  ) {
    return undoPatch;
  }

  const redoPatch = previous.redo.at(-1);

  if (
    redoPatch &&
    next.redo.length === previous.redo.length - 1 &&
    next.undo.length === previous.undo.length + 1 &&
    next.undo.at(-1) === redoPatch
  ) {
    return redoPatch;
  }

  return undefined;
}

function mergePatchSideTimeline(
  base: Record<string, unknown>,
  effective: Record<string, unknown>,
  committed: Record<string, unknown>,
  currentTimeSeconds: number,
): Record<string, unknown> {
  const timeline = selectStructuralTimeline(
    readStructuralTimeline(effective),
    readStructuralTimeline(committed),
  );

  if (!timeline) {
    return base;
  }

  const normalizedTimeline = Object.is(
    timeline.currentTimeSeconds,
    currentTimeSeconds,
  )
    ? timeline
    : { ...timeline, currentTimeSeconds };

  return readStructuralTimeline(base) === normalizedTimeline
    ? base
    : { ...base, timeline: normalizedTimeline };
}

function mergeChangedHistoryPatch(
  effective: ToolcraftHistoryPatch | undefined,
  committed: ToolcraftHistoryPatch | undefined,
  beforeState: ToolcraftState,
  afterState: ToolcraftState,
): ToolcraftHistoryPatch | undefined {
  const base = effective ?? committed;

  if (!base) {
    return undefined;
  }
  if (isToolcraftWorkspaceResetHistoryPatch(base)) return base;

  const domains = getToolcraftHistoryPatchDomains(base);
  const baseStatePatch = domains?.state ?? base;
  const effectiveStatePatch = getToolcraftHistoryPatchDomains(effective)?.state ?? effective;
  const committedStatePatch = getToolcraftHistoryPatchDomains(committed)?.state ?? committed;
  const effectiveBefore = effectiveStatePatch?.before ?? emptyPatchSide;
  const effectiveAfter = effectiveStatePatch?.after ?? emptyPatchSide;
  const committedBefore = committedStatePatch?.before ?? emptyPatchSide;
  const committedAfter = committedStatePatch?.after ?? emptyPatchSide;
  const source =
    getToolcraftHistoryPatchSource(effective) ??
    getToolcraftHistoryPatchSource(committed);
  const baseSource = getToolcraftHistoryPatchSource(base);
  const before = mergePatchSideTimeline(
    baseStatePatch.before,
    effectiveBefore,
    committedBefore,
    beforeState.timeline.currentTimeSeconds,
  );
  const after = mergePatchSideTimeline(
    baseStatePatch.after,
    effectiveAfter,
    committedAfter,
    afterState.timeline.currentTimeSeconds,
  );

  if (domains) {
    return before === domains.state.before && after === domains.state.after
      ? base
      : tagToolcraftHistoryPatchDomains(base, {
          state: { before, after },
          values: domains.values,
        });
  }

  return before === base.before && after === base.after && source === baseSource
    ? base
    : tagToolcraftHistoryPatchSource(
        {
          ...base,
          after,
          before,
        },
        source,
      );
}

function mergeHistoryStack(
  effective: ToolcraftHistoryPatch[],
  committed: ToolcraftHistoryPatch[],
  previousPatches: ReadonlySet<ToolcraftHistoryPatch>,
  beforeState: ToolcraftState,
  afterState: ToolcraftState,
): ToolcraftHistoryPatch[] {
  const length = Math.max(effective.length, committed.length);
  const merged: ToolcraftHistoryPatch[] = [];
  let matchesEffective = effective.length === length;

  for (let index = 0; index < length; index += 1) {
    const effectivePatch = effective[index];
    const committedPatch = committed[index];
    const effectiveChanged =
      effectivePatch !== undefined && !previousPatches.has(effectivePatch);
    const committedChanged =
      committedPatch !== undefined && !previousPatches.has(committedPatch);
    const patch =
      effectiveChanged || committedChanged
        ? mergeChangedHistoryPatch(
            effectiveChanged ? effectivePatch : undefined,
            committedChanged ? committedPatch : undefined,
            beforeState,
            afterState,
          )
        : (effectivePatch ?? committedPatch);

    if (!patch) {
      continue;
    }

    merged.push(patch);
    matchesEffective = matchesEffective && patch === effectivePatch;
  }

  return matchesEffective ? effective : merged;
}

export function mergeToolcraftDurableHistory(
  effective: ToolcraftState["history"],
  committed: ToolcraftState["history"],
  beforeState: ToolcraftState,
  afterState: ToolcraftState,
): ToolcraftState["history"] {
  const previousPatches = new Set([
    ...beforeState.history.undo,
    ...beforeState.history.redo,
  ]);
  const undo = mergeHistoryStack(
    effective.undo,
    committed.undo,
    previousPatches,
    beforeState,
    afterState,
  );
  const redo = mergeHistoryStack(
    effective.redo,
    committed.redo,
    previousPatches,
    beforeState,
    afterState,
  );

  return undo === effective.undo && redo === effective.redo
    ? effective
    : { redo, undo };
}
