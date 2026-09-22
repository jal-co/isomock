import type {
  ToolcraftChannelMixerValue,
  ToolcraftCurvesValue,
  ToolcraftGradientValue,
  ToolcraftPaletteValue,
} from "../state/control-value-types";
import type { ToolcraftOrientationPose } from "../state/orientation-pose";
import type {
  ToolcraftColorOpacityValueSchema,
  ToolcraftCurveIntent,
  ToolcraftCurveInterpolation,
  ToolcraftFontPickerValueSchema,
  ToolcraftImagePickerItemSchema,
} from "./types";

type GradientInput = Omit<ToolcraftGradientValue, "stops"> & {
  stops: readonly ToolcraftGradientValue["stops"][number][];
};
type CurvesInput = Omit<ToolcraftCurvesValue, "points"> & {
  points: { readonly [K in keyof ToolcraftCurvesValue["points"]]?: readonly { x: number; y: number }[] };
};

export type ToolcraftCompoundControlFields = {
  color: { defaultValue?: string | { hex: string } };
  colorOpacity: { defaultValue?: string | ToolcraftColorOpacityValueSchema };
  palette: { defaultValue?: ToolcraftPaletteValue };
  gradient: { defaultValue?: GradientInput };
  fontPicker: { defaultValue?: string | ToolcraftFontPickerValueSchema };
  channelMixer: { defaultValue?: ToolcraftChannelMixerValue };
  curves: {
    curveIntent?: ToolcraftCurveIntent;
    defaultValue?: CurvesInput;
    interpolation?: ToolcraftCurveInterpolation;
    variant?: "single" | "rgb";
  };
  orientationGizmo: { defaultValue?: ToolcraftOrientationPose };
  imagePicker: { defaultValue?: string; items?: readonly ToolcraftImagePickerItemSchema[] };
};
