import type { ToolcraftEditableSliderRange } from "./slider-range";
import type { ToolcraftRangeInputValue } from "../state/control-value-types";
import type { ToolcraftSliderValueKind, ToolcraftTextValueKind, ToolcraftVectorCoordinateMode } from "./types";

type NumericFields = {
  editableRange?: ToolcraftEditableSliderRange;
  markerCount?: number;
  max?: number;
  min?: number;
  sliderValueKind?: ToolcraftSliderValueKind;
  step?: number;
  unit?: string;
  valueLabel?: string;
  variant?: "continuous" | "discrete";
};
type ChoiceFields = {
  defaultValue?: string;
  options?: readonly { label: string; value: string }[];
};
type TextFields = {
  commitMode?: "content" | "setting";
  defaultValue?: string;
  textValueKind?: ToolcraftTextValueKind;
};

export type ToolcraftInputControlFields = {
  slider: NumericFields & { defaultValue?: number };
  rangeSlider: NumericFields & { defaultValue?: readonly number[] };
  rangeInput: { defaultValue?: ToolcraftRangeInputValue };
  switch: { defaultValue?: boolean };
  checkbox: { defaultValue?: boolean };
  select: ChoiceFields;
  segmented: ChoiceFields & { variant?: "default" | "dots" };
  tabs: ChoiceFields;
  text: TextFields;
  code: TextFields;
  anchorGrid: { defaultValue?: string };
  vector: {
    coordinateMode?: ToolcraftVectorCoordinateMode;
    defaultValue?: { x: number | `${number}`; y: number | `${number}` };
    /** Unknown legacy variants deliberately render the default vector pad. */
    variant?: string;
    xLabel?: string;
    yLabel?: string;
  };
};
