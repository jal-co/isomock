import { resolveToolcraftCollectionItemIndex } from "../schema/collection-identity";
import {
  getToolcraftCollectionActionsControls,
  isToolcraftCollectionFieldKeyframeable,
  isToolcraftCollectionItemControlAddress,
} from "../schema/collection-actions";
import { decodeToolcraftCollectionItemControlAddress } from "./collection-control-address";
import { decodeToolcraftBuiltInControlValue } from "./control-value-codecs";
import {
  getToolcraftValueControls,
  normalizeToolcraftControlValue,
} from "./control-value-normalization";
import {
  clampToolcraftTimelineTime,
  getToolcraftTimelineKeyframeId,
  roundToolcraftTimelineKeyframeTime
} from "./timeline-values";
import type {
  ToolcraftCommand,
  ToolcraftState,
  ToolcraftTimelineKeyframe,
  ToolcraftTimelineKeyframeGroup,
} from "./types";

export function createTimelineControlKeyframe({
  controlId,
  controlLabel,
  state,
  timeSeconds,
  value,
  valueLabel,
}: {
  controlId: string;
  controlLabel: string;
  state: ToolcraftState;
  timeSeconds?: number;
  value: unknown;
  valueLabel: string;
}): ToolcraftTimelineKeyframe {
  const resolvedTimeSeconds = roundToolcraftTimelineKeyframeTime(
    clampToolcraftTimelineTime(
      timeSeconds ?? state.timeline.currentTimeSeconds,
      state.timeline.durationSeconds,
    ),
  );

  return {
    controlId,
    controlLabel,
    id: getToolcraftTimelineKeyframeId(controlId, resolvedTimeSeconds),
    timeSeconds: resolvedTimeSeconds,
    value,
    valueLabel,
  };
}

export function normalizeTimelineControlValue(
  state: ToolcraftState,
  controlId: string,
  value: unknown,
): { accepted: true; value: unknown; } | { accepted: false; } {
  const nestedAddress = decodeToolcraftCollectionItemControlAddress(controlId);
  if (nestedAddress) {
    const control = getToolcraftCollectionActionsControls(
      state.schema.panels.controls,
    ).get(nestedAddress.collectionTarget);
    const field = control?.itemControls?.[nestedAddress.fieldId];
    const items = state.values[nestedAddress.collectionTarget];
    if (
      !control ||
      !field ||
      !isToolcraftCollectionFieldKeyframeable(field) ||
      !Array.isArray(items) ||
      resolveToolcraftCollectionItemIndex(control, items, { itemId: nestedAddress.itemId, itemIndex: nestedAddress.index }) < 0
    ) {
      return { accepted: false };
    }
    return (
      decodeToolcraftBuiltInControlValue(field, value) ?? { accepted: false }
    );
  }
  if (isToolcraftCollectionItemControlAddress(controlId)) {
    return { accepted: false };
  }
  const control = getToolcraftValueControls(state.schema).get(controlId);
  if (!control) {
    return { accepted: true, value };
  }

  const normalized = normalizeToolcraftControlValue(control, value);
  return normalized.accepted
    ? { accepted: true, value: normalized.value }
    : { accepted: false };
}

export function upsertTimelineControlKeyframeGroup({
  controlId,
  controlLabel,
  keyframe,
  keyframeGroups,
}: {
  controlId: string;
  controlLabel: string;
  keyframe: ToolcraftTimelineKeyframe;
  keyframeGroups: readonly ToolcraftTimelineKeyframeGroup[];
}): ToolcraftTimelineKeyframeGroup[] {
  const existingGroup = keyframeGroups.find(
    (group) => group.controlId === controlId,
  );
  const nextKeyframes = [
    ...(existingGroup?.keyframes.filter((item) => item.id !== keyframe.id) ??
      []),
    keyframe,
  ].sort(
    (firstKeyframe, secondKeyframe) =>
      firstKeyframe.timeSeconds - secondKeyframe.timeSeconds,
  );
  const nextGroup: ToolcraftTimelineKeyframeGroup = {
    controlId,
    keyframes: nextKeyframes,
    label: existingGroup?.label ?? controlLabel,
  };

  if (!existingGroup) {
    return [...keyframeGroups, nextGroup];
  }

  return keyframeGroups.map((group) =>
    group.controlId === controlId ? nextGroup : group,
  );
}

export function mapTimelineKeyframeGroups(
  keyframeGroups: readonly ToolcraftTimelineKeyframeGroup[],
  keyframeId: string,
  updateKeyframe: (
    keyframe: ToolcraftTimelineKeyframeGroup["keyframes"][number],
  ) => ToolcraftTimelineKeyframeGroup["keyframes"][number],
): ToolcraftTimelineKeyframeGroup[] {
  return keyframeGroups.map((group) => ({
    ...group,
    keyframes: group.keyframes.map((keyframe) =>
      keyframe.id === keyframeId ? updateKeyframe(keyframe) : keyframe,
    ),
  }));
}

/** Pure shared document update. The caller owns the single history transaction. */
export function upsertToolcraftTimelineControlValue(
  state: ToolcraftState,
  command: Extract<ToolcraftCommand, { type: "timeline.upsertControlKeyframe"; }>,
): ToolcraftState["timeline"] {
  const normalized = normalizeTimelineControlValue(state, command.controlId, command.value);
  if (!normalized.accepted) return state.timeline;
  const keyframe = createTimelineControlKeyframe({
    controlId: command.controlId, controlLabel: command.controlLabel, state,
    timeSeconds: command.timeSeconds, value: normalized.value, valueLabel: command.valueLabel,
  });
  return {
    ...state.timeline, expanded: true,
    keyframeGroups: upsertTimelineControlKeyframeGroup({ controlId: command.controlId, controlLabel: command.controlLabel, keyframe, keyframeGroups: state.timeline.keyframeGroups }),
    selectedKeyframeId: keyframe.id,
  };
}
