import type { ToolcraftTimelineKeyframeGroup } from "./types";

export function getToolcraftSelectedKeyframeTime(
  controlId: string,
  keyframeGroups: readonly ToolcraftTimelineKeyframeGroup[],
  selectedKeyframeId: string | null,
): number | undefined {
  if (!selectedKeyframeId) return undefined;
  return keyframeGroups
    .find((group) => group.controlId === controlId)
    ?.keyframes.find((keyframe) => keyframe.id === selectedKeyframeId)
    ?.timeSeconds;
}
