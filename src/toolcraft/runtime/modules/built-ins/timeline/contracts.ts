import type { ToolcraftTimelineKeyframeEasing } from "../../../state/types";

export type ToolcraftTimelineCommand =
  | { currentTimeSeconds: number; type: "timeline.setCurrentTime" }
  | { durationSeconds: number; type: "timeline.setDuration" }
  | { expanded: boolean; type: "timeline.setExpanded" }
  | { isPlaying: boolean; type: "timeline.setPlaying" }
  | { type: "timeline.toggleExpanded" }
  | { type: "timeline.togglePlayback" }
  | { type: "timeline.toggleLoop" }
  | { keyframeId: string | null; type: "timeline.selectKeyframe" }
  | { keyframeId: string; type: "timeline.deleteKeyframe" }
  | { controlId: string; type: "timeline.deleteControlKeyframes" }
  | {
      controlId: string;
      controlLabel: string;
      timeSeconds?: number;
      type: "timeline.toggleControlKeyframes";
      value: unknown;
      valueLabel: string;
    }
  | {
      controlId: string;
      controlLabel: string;
      timeSeconds?: number;
      type: "timeline.upsertControlKeyframe";
      value: unknown;
      valueLabel: string;
    }
  | { keyframeId: string; timeSeconds: number; type: "timeline.moveKeyframe" }
  | {
      easing: ToolcraftTimelineKeyframeEasing;
      keyframeId: string;
      type: "timeline.changeKeyframeEasing";
    };
