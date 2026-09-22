import type {
  ChannelMixerValues,
  ColorOpacityValue,
  GradientStop,
  GradientType,
} from "@/toolcraft/ui";

import {
  asNumber,
  asString,
  isRecord,
} from "./controls-panel-value-primitives";

const defaultGradientStops = [
  { color: "#FFFFFF", position: "0%" },
  { color: "#7CFF3A", position: "46%" },
  { color: "#111111", position: "100%" },
] as const satisfies readonly GradientStop[];

export const defaultChannelMixerValues = {
  B: { B: 100, G: 0, R: 0 },
  G: { B: 0, G: 100, R: 0 },
  R: { B: 0, G: 0, R: 100 },
} satisfies ChannelMixerValues;

export function asColorValue(value: unknown): { hex: string } {
  return { hex: asString(value, "#C1FF00") };
}

export function asColorOpacityValue(value: unknown): ColorOpacityValue {
  if (typeof value === "string") {
    return { hex: value, opacity: 100 };
  }

  if (isRecord(value)) {
    return {
      hex: asString(value.hex, "#C1FF00"),
      opacity: Math.min(100, Math.max(0, Math.round(asNumber(value.opacity, 100)))),
    };
  }

  return { hex: "#C1FF00", opacity: 100 };
}

function asGradientType(value: unknown): GradientType {
  return value === "linear" ||
    value === "radial" ||
    value === "angular" ||
    value === "diamond"
    ? value
    : "linear";
}

export function asGradientValue(value: unknown): {
  angle: number;
  gradientType: GradientType;
  stops: readonly GradientStop[];
} {
  if (isRecord(value)) {
    return {
      angle: asNumber(value.angle, 90),
      gradientType: asGradientType(value.gradientType),
      stops: Array.isArray(value.stops)
        ? (value.stops as readonly GradientStop[])
        : defaultGradientStops,
    };
  }

  return {
    angle: 90,
    gradientType: "linear",
    stops: defaultGradientStops,
  };
}
