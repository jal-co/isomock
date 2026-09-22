import type {
  ToolcraftTimelineKeyframe,
  ToolcraftTimelineKeyframeEasing,
  ToolcraftTimelineKeyframeGroup,
} from "./types";

function keyframeEasingsEqual(
  previous: ToolcraftTimelineKeyframeEasing | undefined,
  next: ToolcraftTimelineKeyframeEasing | undefined,
): boolean {
  if (previous === next) {
    return true;
  }

  if (!previous || !next || previous.type !== next.type) {
    return false;
  }

  if (previous.type === "step" || next.type === "step") {
    return previous.type === next.type;
  }

  return previous.controlPoints.every((point, index) =>
    Object.is(point, next.controlPoints[index]),
  );
}

function keyframesEqual(
  previous: ToolcraftTimelineKeyframe,
  next: ToolcraftTimelineKeyframe,
): boolean {
  return (
    previous === next ||
    (previous.controlId === next.controlId &&
      previous.controlLabel === next.controlLabel &&
      previous.id === next.id &&
      Object.is(previous.timeSeconds, next.timeSeconds) &&
      Object.is(previous.value, next.value) &&
      previous.valueLabel === next.valueLabel &&
      keyframeEasingsEqual(previous.easing, next.easing))
  );
}

export function toolcraftTimelineKeyframeGroupsEqual(
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

  return previous.keyframes.every((keyframe, index) =>
    keyframesEqual(keyframe, next.keyframes[index] as ToolcraftTimelineKeyframe),
  );
}

export function toolcraftTimelineKeyframeGroupListsEqual(
  previous: readonly ToolcraftTimelineKeyframeGroup[],
  next: readonly ToolcraftTimelineKeyframeGroup[],
): boolean {
  return (
    previous === next ||
    (previous.length === next.length &&
      previous.every((group, index) =>
        toolcraftTimelineKeyframeGroupsEqual(group, next[index]),
      ))
  );
}
