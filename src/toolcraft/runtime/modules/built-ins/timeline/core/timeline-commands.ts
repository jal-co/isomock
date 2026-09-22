import type { ToolcraftCommandHandlers } from "../../../contract/command-handlers";
import type { ToolcraftState } from "../../../../state/types";
import type { ToolcraftTimelineCommand } from "../contracts";
import { reduceTimelinePlaybackCommand } from "./timeline-playback-commands";
import { reduceTimelineKeyframesCommand } from "./timeline-keyframes-commands";

export const timelineCommandHandlers = Object.freeze({
  "timeline.setCurrentTime": reduceTimelinePlaybackCommand,
  "timeline.setDuration": reduceTimelinePlaybackCommand,
  "timeline.setExpanded": reduceTimelinePlaybackCommand,
  "timeline.toggleExpanded": reduceTimelinePlaybackCommand,
  "timeline.setPlaying": reduceTimelinePlaybackCommand,
  "timeline.togglePlayback": reduceTimelinePlaybackCommand,
  "timeline.toggleLoop": reduceTimelinePlaybackCommand,
  "timeline.selectKeyframe": reduceTimelineKeyframesCommand,
  "timeline.deleteKeyframe": reduceTimelineKeyframesCommand,
  "timeline.deleteControlKeyframes": reduceTimelineKeyframesCommand,
  "timeline.toggleControlKeyframes": reduceTimelineKeyframesCommand,
  "timeline.upsertControlKeyframe": reduceTimelineKeyframesCommand,
  "timeline.moveKeyframe": reduceTimelineKeyframesCommand,
  "timeline.changeKeyframeEasing": reduceTimelineKeyframesCommand,
} satisfies ToolcraftCommandHandlers<ToolcraftState, ToolcraftTimelineCommand>);
