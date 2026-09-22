"use client";

import { type HsvColor } from "../../../lib/style-guide-color-utils";
import { cn } from "../../../lib/utils";
import { Slider } from "../../primitives";
import {
  getColorChannels,
  type ColorSurfaceModel,
} from "./style-guide-color-picker-channel-utils";

const HUE_RAIL_BACKGROUND =
  "linear-gradient(90deg, #ff0000 0%, #ffff00 16.67%, #00ff00 33.33%, #00ffff 50%, #0000ff 66.67%, #ff00ff 83.33%, #ff0000 100%)";
const RGB_BLUE_RAIL_BACKGROUND =
  "linear-gradient(90deg, rgb(0 0 0), rgb(0 0 255))";

type ColorModelSliderProps = {
  label: string;
  disabled: boolean;
  max: number;
  railBackground: string;
  value: number;
  onDragStateChange: (nextIsDragging: boolean) => void;
  onPreviewChange: (nextValue: number) => void;
  onCommit: (nextValue: number) => void;
};

export function getColorSurfaceSliderConfig({
  colorModel,
  currentColorHex,
  hueLabel,
  optimisticColor,
}: {
  colorModel: ColorSurfaceModel;
  currentColorHex: string;
  hueLabel: string;
  optimisticColor: HsvColor;
}): {
  label: string;
  max: number;
  railBackground: string;
  value: number;
} {
  if (colorModel === "rgb") {
    const [, , blue] = getColorChannels(currentColorHex).rgb;

    return {
      label: "RGB blue channel",
      max: 255,
      railBackground: RGB_BLUE_RAIL_BACKGROUND,
      value: blue,
    };
  }

  return {
    label: hueLabel,
    max: 360,
    railBackground: HUE_RAIL_BACKGROUND,
    value: optimisticColor.h,
  };
}

export function ColorModelSlider({
  label,
  disabled,
  max,
  railBackground,
  value,
  onDragStateChange,
  onPreviewChange,
  onCommit,
}: ColorModelSliderProps) {
  return (
    <div
      data-slot="style-guide-color-hue"
      className={cn(
        "relative w-full",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <div
        data-slot="style-guide-color-hue-rail"
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
        style={{ background: railBackground }}
      />
      <Slider
        className="relative h-[18px] w-full [--slider-track-color:transparent]"
        disabled={disabled}
        getAriaLabel={() => label}
        max={max}
        min={0}
        onPointerDraggingChange={onDragStateChange}
        onValueChange={onPreviewChange}
        onValueCommitted={(nextValue) => {
          onCommit(nextValue);
        }}
        showFill={false}
        step={1}
        value={value}
      />
    </div>
  );
}
