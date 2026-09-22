import { upsertToolcraftTimelineControlValue } from "../../../../state/timeline-keyframe-data";
import { commitToolcraftStructuralPatch } from "../../../../state/history-patches";
import {
  clampToolcraftTimelineTime,
  getToolcraftTimelineKeyframeId,
  roundToolcraftTimelineKeyframeTime
} from "../../../../state/timeline-values";
import type {
  ToolcraftState
} from "../../../../state/types";
import type { ToolcraftTimelineCommand } from "../contracts";
import { createTimelineControlKeyframe, normalizeTimelineControlValue, upsertTimelineControlKeyframeGroup, mapTimelineKeyframeGroups } from "../../../../state/timeline-keyframe-data";

export function reduceTimelineKeyframesCommand(state: ToolcraftState, command: Extract<ToolcraftTimelineCommand, { type: "timeline.selectKeyframe" | "timeline.deleteKeyframe" | "timeline.deleteControlKeyframes" | "timeline.toggleControlKeyframes" | "timeline.upsertControlKeyframe" | "timeline.moveKeyframe" | "timeline.changeKeyframeEasing"; }>): ToolcraftState {
  switch (command.type) {
    case "timeline.selectKeyframe": {
      return {
        ...state,
        timeline: {
          ...state.timeline,
          selectedKeyframeId: command.keyframeId,
        },
      };
    }
    case "timeline.deleteKeyframe": {
      if (
        !state.timeline.keyframeGroups.some((group) =>
          group.keyframes.some(
            (keyframe) => keyframe.id === command.keyframeId,
          ),
        )
      ) {
        return state;
      }

      const timeline = {
        ...state.timeline,
        keyframeGroups: state.timeline.keyframeGroups
          .map((group) => ({
            ...group,
            keyframes: group.keyframes.filter(
              (keyframe) => keyframe.id !== command.keyframeId,
            ),
          }))
          .filter((group) => group.keyframes.length > 0),
        selectedKeyframeId: null,
      };

      return commitToolcraftStructuralPatch(state, {
        after: { timeline },
        before: { timeline: state.timeline },
        label: "Delete keyframe",
      });
    }
    case "timeline.deleteControlKeyframes": {
      if (
        !state.timeline.keyframeGroups.some(
          (group) => group.controlId === command.controlId,
        )
      ) {
        return state;
      }

      const timeline = {
        ...state.timeline,
        keyframeGroups: state.timeline.keyframeGroups.filter(
          (group) => group.controlId !== command.controlId,
        ),
        selectedKeyframeId: null,
      };

      return commitToolcraftStructuralPatch(state, {
        after: { timeline },
        before: { timeline: state.timeline },
        label: "Delete control keyframes",
      });
    }
    case "timeline.toggleControlKeyframes": {
      const existingGroup = state.timeline.keyframeGroups.find(
        (group) => group.controlId === command.controlId,
      );

      if (existingGroup) {
        const timeline = {
          ...state.timeline,
          expanded: true,
          keyframeGroups: state.timeline.keyframeGroups.filter(
            (group) => group.controlId !== command.controlId,
          ),
          selectedKeyframeId: null,
        };

        return commitToolcraftStructuralPatch(state, {
          after: { timeline },
          before: { timeline: state.timeline },
          label: "Delete control keyframes",
        });
      }

      const normalized = normalizeTimelineControlValue(
        state,
        command.controlId,
        command.value,
      );
      if (!normalized.accepted) {
        return state;
      }

      const keyframe = createTimelineControlKeyframe({
        controlId: command.controlId,
        controlLabel: command.controlLabel,
        state,
        timeSeconds: command.timeSeconds,
        value: normalized.value,
        valueLabel: command.valueLabel,
      });
      const timeline = {
        ...state.timeline,
        expanded: true,
        keyframeGroups: upsertTimelineControlKeyframeGroup({
          controlId: command.controlId,
          controlLabel: command.controlLabel,
          keyframe,
          keyframeGroups: state.timeline.keyframeGroups,
        }),
        selectedKeyframeId: keyframe.id,
      };

      return commitToolcraftStructuralPatch(state, {
        after: { timeline },
        before: { timeline: state.timeline },
        label: "Add control keyframe",
      });
    }
    case "timeline.upsertControlKeyframe": {
      const timeline = upsertToolcraftTimelineControlValue(state, command);
      if (timeline === state.timeline) return state;
      return commitToolcraftStructuralPatch(state, {
        after: { timeline },
        before: { timeline: state.timeline },
        label: "Set control keyframe",
      });
    }
    case "timeline.moveKeyframe": {
      const targetKeyframe = state.timeline.keyframeGroups
        .flatMap((group) => group.keyframes)
        .find((keyframe) => keyframe.id === command.keyframeId);

      if (!targetKeyframe) {
        return state;
      }

      const timeSeconds = roundToolcraftTimelineKeyframeTime(
        clampToolcraftTimelineTime(
          command.timeSeconds,
          state.timeline.durationSeconds,
        ),
      );
      const nextKeyframeId = getToolcraftTimelineKeyframeId(
        targetKeyframe.controlId,
        timeSeconds,
      );
      const timeline = {
        ...state.timeline,
        keyframeGroups: mapTimelineKeyframeGroups(
          state.timeline.keyframeGroups,
          command.keyframeId,
          (keyframe) => ({
            ...keyframe,
            id: nextKeyframeId,
            timeSeconds,
          }),
        ),
        selectedKeyframeId: nextKeyframeId,
      };

      return commitToolcraftStructuralPatch(state, {
        after: { timeline },
        before: { timeline: state.timeline },
        label: "Move keyframe",
      });
    }
    case "timeline.changeKeyframeEasing": {
      if (
        !state.timeline.keyframeGroups.some((group) =>
          group.keyframes.some(
            (keyframe) => keyframe.id === command.keyframeId,
          ),
        )
      ) {
        return state;
      }

      const timeline = {
        ...state.timeline,
        keyframeGroups: mapTimelineKeyframeGroups(
          state.timeline.keyframeGroups,
          command.keyframeId,
          (keyframe) => ({
            ...keyframe,
            easing: command.easing,
          }),
        ),
      };

      return commitToolcraftStructuralPatch(state, {
        after: { timeline },
        before: { timeline: state.timeline },
        label: "Change keyframe easing",
      });
    }
  }
}
