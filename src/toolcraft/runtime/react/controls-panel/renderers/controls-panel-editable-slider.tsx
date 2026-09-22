import * as React from "react";
import { RangeSlider, Slider } from "@/toolcraft/ui";
import type { ToolcraftControlSchema } from "../../../schema/types";
import { getToolcraftVisibleSliderRange, resolveToolcraftSliderEdit } from "../../../state/control-ranges";
import { getToolcraftInitialSliderRange } from "../../../schema/slider-range";
import { getToolcraftVisualDiscreteSliderMarkerIssue } from "../../../schema/slider-marker-policy";
import { useToolcraftStore } from "../../app-shell/toolcraft-store-context";
import { useToolcraftStoreSelector } from "../../app-shell/toolcraft-selectors";
import type { BasicControlCommit } from "./controls-panel-basic-renderers";
import { asNumber, asNumberArray } from "../values/controls-panel-values";

export function ControlsPanelEditableSlider({ control, name, value, commit }: {
  control: Extract<ToolcraftControlSchema, { type: "slider" | "rangeSlider" }>;
  name: string;
  value: unknown;
  commit: BasicControlCommit;
}): React.JSX.Element {
  const store = useToolcraftStore();
  const range = useToolcraftStoreSelector(React.useCallback(state => state.controlRanges[control.target], [control.target]));
  const visible = getToolcraftVisibleSliderRange(range ?? getToolcraftInitialSliderRange(control), value);
  const variant: "discrete" | "continuous" = control.variant === "discrete" && !getToolcraftVisualDiscreteSliderMarkerIssue({ ...control, ...visible }) ? "discrete" : "continuous";
  const edit = (candidate: number | readonly number[], reason?: "reset") => {
    const result = resolveToolcraftSliderEdit(store.getState(), control.target, candidate, value, reason);
    if (!result.accepted) return result.error;
    store.dispatch({ type: "controls.editSlider", target: control.target, value: candidate, displayedValue: value, label: name, reason });
    return undefined;
  };
  const shared = { ...visible, disabled: control.disabled, name, onValueChange: commit, step: control.step,
    unit: control.unit, variant, onValueEdit: edit };
  return control.type === "rangeSlider"
    ? <RangeSlider {...shared} baseValue={control.defaultValue} value={asNumberArray(value, control.defaultValue ?? [visible.min, visible.max])} />
    : <Slider {...shared} baseValue={control.defaultValue} value={asNumber(value, control.defaultValue ?? visible.min)} />;
}
