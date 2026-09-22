import type { ToolcraftWorkspaceSliceCodec } from "../../../../state/persistence-codec-types";
import {
  isToolcraftFiniteNumber,
  isToolcraftPersistenceRecord,
} from "../../../../state/persistence-shared";
import type {
  ToolcraftTimelineBezierControlPoints,
  ToolcraftTimelineKeyframe,
  ToolcraftTimelineKeyframeEasing,
  ToolcraftTimelineKeyframeGroup,
  ToolcraftTimelineState,
} from "../../../../state/types";

function readBezierControlPoints(
  value: unknown,
): ToolcraftTimelineBezierControlPoints | undefined {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((item) => isToolcraftFiniteNumber(item))
  ) {
    return undefined;
  }

  return [
    value[0] as number,
    value[1] as number,
    value[2] as number,
    value[3] as number,
  ];
}

function readKeyframeEasing(
  value: unknown,
): ToolcraftTimelineKeyframeEasing | undefined {
  if (!isToolcraftPersistenceRecord(value)) {
    return undefined;
  }

  if (value.type === "step") {
    return { type: "step" };
  }

  if (value.type !== "bezier") {
    return undefined;
  }

  const controlPoints = readBezierControlPoints(value.controlPoints);

  return controlPoints ? { controlPoints, type: "bezier" } : undefined;
}

function readKeyframe(value: unknown): ToolcraftTimelineKeyframe | undefined {
  if (
    !isToolcraftPersistenceRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.controlId !== "string" ||
    typeof value.controlLabel !== "string" ||
    typeof value.valueLabel !== "string" ||
    !isToolcraftFiniteNumber(value.timeSeconds)
  ) {
    return undefined;
  }

  const keyframe: ToolcraftTimelineKeyframe = {
    controlId: value.controlId,
    controlLabel: value.controlLabel,
    id: value.id,
    timeSeconds: value.timeSeconds,
    valueLabel: value.valueLabel,
  };
  const easing = readKeyframeEasing(value.easing);

  if ("value" in value) {
    keyframe.value = value.value;
  }

  if (easing) {
    keyframe.easing = easing;
  }

  return keyframe;
}

function readKeyframeGroup(
  value: unknown,
): ToolcraftTimelineKeyframeGroup | undefined {
  if (
    !isToolcraftPersistenceRecord(value) ||
    typeof value.controlId !== "string" ||
    typeof value.label !== "string" ||
    !Array.isArray(value.keyframes)
  ) {
    return undefined;
  }

  return {
    controlId: value.controlId,
    keyframes: value.keyframes.flatMap((item) => {
      const keyframe = readKeyframe(item);
      return keyframe ? [keyframe] : [];
    }),
    label: value.label,
  };
}

export function readTimeline(value: unknown): Partial<ToolcraftTimelineState> | undefined {
  if (!isToolcraftPersistenceRecord(value)) {
    return undefined;
  }

  const timeline: Partial<ToolcraftTimelineState> = {};

  if (isToolcraftFiniteNumber(value.currentTimeSeconds)) {
    timeline.currentTimeSeconds = value.currentTimeSeconds;
  }

  if (isToolcraftFiniteNumber(value.durationSeconds)) {
    timeline.durationSeconds = value.durationSeconds;
  }

  if (typeof value.expanded === "boolean") {
    timeline.expanded = value.expanded;
  }

  if (typeof value.isLooping === "boolean") {
    timeline.isLooping = value.isLooping;
  }

  if (typeof value.isPlaying === "boolean") {
    timeline.isPlaying = value.isPlaying;
  }

  if (typeof value.selectedKeyframeId === "string" || value.selectedKeyframeId === null) {
    timeline.selectedKeyframeId = value.selectedKeyframeId;
  }

  if (Array.isArray(value.keyframeGroups)) {
    timeline.keyframeGroups = value.keyframeGroups.flatMap((item) => {
      const group = readKeyframeGroup(item);
      return group ? [group] : [];
    });
  }

  return Object.keys(timeline).length > 0 ? timeline : undefined;
}

export const timelinePersistenceCodec = Object.freeze({
  fields: ["timeline"],
  read: (_schema, data) => { const timeline = readTimeline(data.timeline); return timeline ? { timeline } : undefined; },
  write: state => ({ timeline: state.timeline }),
} satisfies ToolcraftWorkspaceSliceCodec);
