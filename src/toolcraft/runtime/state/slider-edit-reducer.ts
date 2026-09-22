import { resolveToolcraftSliderEdit } from "./control-ranges";
import { areToolcraftControlValuesEqual } from "./control-value-codecs";
import { tagToolcraftHistoryPatchDomains } from "./history-patch-metadata";
import { commitToolcraftStatePatch } from "./history-patches";
import type { ToolcraftCommand, ToolcraftState } from "./types";
import { upsertToolcraftTimelineControlValue } from "./timeline-keyframe-data";
import { getToolcraftSelectedKeyframeTime } from "./selected-keyframe-time";
import { getToolcraftValueControls } from "./control-value-normalization";
import { formatToolcraftControlValueLabel } from "./control-value-labels";

export function reduceToolcraftSliderEdit(state: ToolcraftState, command: Extract<ToolcraftCommand, { type: "controls.editSlider" }>): ToolcraftState {
  const result = resolveToolcraftSliderEdit(state, command.target, command.value, command.displayedValue, command.reason);
  if (!result.accepted) return state;
  const control = getToolcraftValueControls(state.schema).get(command.target)!;
  const editsKeyframe = state.schema.assembly.capabilities.includes("timeline.keyframes") && state.timeline.expanded &&
    state.timeline.keyframeGroups.some(group => group.controlId === command.target);
  const timeline = editsKeyframe ? upsertToolcraftTimelineControlValue(state, {
    type: "timeline.upsertControlKeyframe",
    controlId: command.target,
    controlLabel: command.label ?? command.target,
    timeSeconds: getToolcraftSelectedKeyframeTime(command.target, state.timeline.keyframeGroups, state.timeline.selectedKeyframeId),
    value: result.value,
    valueLabel: formatToolcraftControlValueLabel(control, result.value),
  }) : state.timeline;
  const controlRanges = { ...state.controlRanges, [command.target]: result.range };
  if (areToolcraftControlValuesEqual(state.values[command.target], result.value) &&
      areToolcraftControlValuesEqual(state.controlRanges, controlRanges) &&
      areToolcraftControlValuesEqual(state.timeline, timeline)) return state;
  return commitToolcraftStatePatch(state, tagToolcraftHistoryPatchDomains({
    before: {}, after: {}, label: command.label ?? "Edit slider range",
  }, {
    values: { before: { [command.target]: state.values[command.target] }, after: { [command.target]: result.value } },
    state: {
      before: { controlRanges: state.controlRanges, ...(timeline !== state.timeline ? { timeline: state.timeline } : {}) },
      after: { controlRanges, ...(timeline !== state.timeline ? { timeline } : {}) },
    },
  }));
}
