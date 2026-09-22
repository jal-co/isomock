import { commitToolcraftStructuralPatch } from "../../../../state/history-patches";
import {
  clampToolcraftTimelineDurationSeconds,
  clampToolcraftTimelineTime, toolcraftTimelineMinDurationSeconds
} from "../../../../state/timeline-values";
import type {
  ToolcraftState
} from "../../../../state/types";
import type { ToolcraftTimelineCommand } from "../contracts";

export function reduceTimelinePlaybackCommand(state: ToolcraftState, command: Extract<ToolcraftTimelineCommand, { type: "timeline.setCurrentTime" | "timeline.setDuration" | "timeline.setExpanded" | "timeline.toggleExpanded" | "timeline.setPlaying" | "timeline.togglePlayback" | "timeline.toggleLoop"; }>): ToolcraftState {
  switch (command.type) {
    case "timeline.setCurrentTime": {
      return {
        ...state,
        timeline: {
          ...state.timeline,
          currentTimeSeconds: clampToolcraftTimelineTime(
            command.currentTimeSeconds,
            state.timeline.durationSeconds,
          ),
        },
      };
    }
    case "timeline.setDuration": {
      const durationSeconds = clampToolcraftTimelineDurationSeconds(
        command.durationSeconds,
        toolcraftTimelineMinDurationSeconds,
      );
      const timeline = {
        ...state.timeline,
        currentTimeSeconds: clampToolcraftTimelineTime(
          state.timeline.currentTimeSeconds,
          durationSeconds,
        ),
        durationSeconds,
      };

      return commitToolcraftStructuralPatch(state, {
        after: { timeline },
        before: { timeline: state.timeline },
        label: "Set timeline duration",
      });
    }
    case "timeline.setExpanded": {
      if (state.timeline.expanded === command.expanded) {
        return state;
      }

      return {
        ...state,
        timeline: {
          ...state.timeline,
          expanded: command.expanded,
        },
      };
    }
    case "timeline.toggleExpanded": {
      return {
        ...state,
        timeline: {
          ...state.timeline,
          expanded: !state.timeline.expanded,
        },
      };
    }
    case "timeline.setPlaying": {
      return {
        ...state,
        timeline: {
          ...state.timeline,
          isPlaying: command.isPlaying,
        },
      };
    }
    case "timeline.togglePlayback": {
      const shouldRestartPlayback =
        !state.timeline.isPlaying &&
        state.timeline.currentTimeSeconds >= state.timeline.durationSeconds;

      return {
        ...state,
        timeline: {
          ...state.timeline,
          currentTimeSeconds: shouldRestartPlayback
            ? 0
            : state.timeline.currentTimeSeconds,
          isPlaying: !state.timeline.isPlaying,
        },
      };
    }
    case "timeline.toggleLoop": {
      return {
        ...state,
        timeline: {
          ...state.timeline,
          isLooping: !state.timeline.isLooping,
        },
      };
    }
  }
}
