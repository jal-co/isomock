import { getToolcraftCanvasAspectRatioPreset } from "../../../schema/canvas-aspect-ratio-presets";
import {
  asNumber,
  isRecord,
} from "./controls-panel-value-primitives";

export type CanvasAspectRatioValue = {
  height: number;
  mode: "custom" | "preset";
  value: string;
  width: number;
};

export function parseCanvasAspectRatioOption(
  value: string,
): CanvasAspectRatioValue | null {
  const preset = getToolcraftCanvasAspectRatioPreset(value);

  if (preset) {
    return {
      height: preset.ratioHeight,
      mode: "preset",
      value: preset.value,
      width: preset.ratioWidth,
    };
  }

  const match = /^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/u.exec(value);

  if (!match) {
    return null;
  }

  const width = Number.parseFloat(match[1] ?? "");
  const height = Number.parseFloat(match[2] ?? "");

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    height: Math.round(height),
    mode: "custom",
    value: `${Math.round(width)}:${Math.round(height)}`,
    width: Math.round(width),
  };
}

export function asCanvasAspectRatioValue(
  value: unknown,
  fallback: unknown,
): CanvasAspectRatioValue {
  if (isRecord(value)) {
    const width = asNumber(value.width, NaN);
    const height = asNumber(value.height, NaN);
    const mode = value.mode === "preset" ? "preset" : "custom";

    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return {
        height: Math.round(height),
        mode,
        value:
          typeof value.value === "string"
            ? value.value
            : `${Math.round(width)}:${Math.round(height)}`,
        width: Math.round(width),
      };
    }
  }

  if (typeof value === "string") {
    const parsed = parseCanvasAspectRatioOption(value);

    if (parsed) {
      return parsed;
    }
  }

  if (fallback !== value) {
    return asCanvasAspectRatioValue(fallback, {
      height: 1,
      mode: "preset",
      value: "1:1",
      width: 1,
    });
  }

  return {
    height: 1,
    mode: "preset",
    value: "1:1",
    width: 1,
  };
}
