import type {
  ToolcraftTimelineKeyframe,
  ToolcraftTimelineKeyframeGroup,
} from '../../state/types';

export function findTimelineKeyframe(
  keyframeGroups: readonly ToolcraftTimelineKeyframeGroup[],
  keyframeId: string | null,
): ToolcraftTimelineKeyframe | undefined {
  if (!keyframeId) {
    return undefined;
  }

  for (const group of keyframeGroups) {
    const keyframe = group.keyframes.find((currentKeyframe) => currentKeyframe.id === keyframeId);

    if (keyframe) {
      return keyframe;
    }
  }

  return undefined;
}
