import type {
  CurveInterpolation,
  VectorPadCoordinateMode,
  VectorPadVariant,
} from "@/toolcraft/ui";

import {
  asString,
  isRecord,
} from "./controls-panel-value-primitives";

export function asRangeInputValue(value: unknown): { end: string; start: string } {
  if (isRecord(value)) {
    return {
      end: asString(value.end, "100%"),
      start: asString(value.start, "0%"),
    };
  }

  return { end: "100%", start: "0%" };
}

export function asVectorValue(value: unknown): { x: string; y: string } {
  if (isRecord(value)) {
    const asVectorComponent = (component: unknown): string =>
      typeof component === "number" && Number.isFinite(component)
        ? String(component)
        : asString(component, "0.00");

    return {
      x: asVectorComponent(value.x),
      y: asVectorComponent(value.y),
    };
  }

  return { x: "0.00", y: "0.00" };
}

export function asVectorPadVariant(
  value: string | undefined,
): VectorPadVariant {
  if (
    value === "whiteBalance" ||
    value === "colorBalance" ||
    value === "chromaOffset" ||
    value === "toneBias"
  ) {
    return value;
  }

  return "default";
}

export function asVectorPadCoordinateMode(
  value: string | undefined,
  padVariant: VectorPadVariant,
): VectorPadCoordinateMode {
  if (value === "cartesian" || value === "screen") {
    return value;
  }

  return padVariant === "default" ? "screen" : "cartesian";
}

export function asCurveInterpolation(
  value: string | undefined,
): CurveInterpolation | undefined {
  return value === "monotone" || value === "smooth" ? value : undefined;
}
