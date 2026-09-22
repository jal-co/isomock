import { getToolcraftCanvasAspectRatioPreset } from "../schema/canvas-aspect-ratio-presets";
import type { ToolcraftState } from "./types";

export const toolcraftCanvasAspectRatioTarget = "canvas.aspectRatio";
export const toolcraftCanvasSizeWidthTarget = "canvas.size.width";
export const toolcraftCanvasSizeHeightTarget = "canvas.size.height";

export type ToolcraftCanvasAspectRatioValue = {
  height: number;
  mode: "custom" | "preset";
  value: string;
  width: number;
};

export function asToolcraftCanvasSizeDimension(value: unknown): number | null {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  return Math.max(1, Math.round(numberValue));
}

function getGreatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(Math.round(left));
  let b = Math.abs(Math.round(right));

  while (b !== 0) {
    const next = b;
    b = a % b;
    a = next;
  }

  return a || 1;
}

export function getToolcraftCanvasAspectRatioFromSize(
  size: ToolcraftState["canvas"]["size"],
): ToolcraftCanvasAspectRatioValue {
  const divisor = getGreatestCommonDivisor(size.width, size.height);
  const width = Math.max(1, Math.round(size.width / divisor));
  const height = Math.max(1, Math.round(size.height / divisor));
  const value = `${width}:${height}`;

  return {
    height,
    mode: "custom",
    value,
    width,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCanvasAspectRatioString(
  value: string,
): ToolcraftCanvasAspectRatioValue | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/u.exec(value);

  if (!match) {
    return null;
  }

  const width = asToolcraftCanvasSizeDimension(match[1]);
  const height = asToolcraftCanvasSizeDimension(match[2]);

  if (width === null || height === null) {
    return null;
  }

  return {
    height,
    mode: getToolcraftCanvasAspectRatioPreset(`${width}:${height}`)
      ? "preset"
      : "custom",
    value: `${width}:${height}`,
    width,
  };
}

export function decodeToolcraftCanvasAspectRatioValue(
  value: unknown,
): ToolcraftCanvasAspectRatioValue | null {
  if (typeof value === "string") {
    return parseCanvasAspectRatioString(value);
  }

  if (!isRecord(value)) {
    return null;
  }

  const width = asToolcraftCanvasSizeDimension(value.width);
  const height = asToolcraftCanvasSizeDimension(value.height);

  if (width === null || height === null) {
    return null;
  }

  const rawValue =
    typeof value.value === "string" ? value.value : `${width}:${height}`;
  const mode = value.mode === "preset" ? "preset" : "custom";

  return {
    height,
    mode,
    value: mode === "preset" ? rawValue : `${width}:${height}`,
    width,
  };
}

export function normalizeToolcraftCanvasAspectRatioValue(
  value: unknown,
  fallbackSize: ToolcraftState["canvas"]["size"],
): ToolcraftCanvasAspectRatioValue {
  return (
    decodeToolcraftCanvasAspectRatioValue(value) ??
    getToolcraftCanvasAspectRatioFromSize(fallbackSize)
  );
}

export function toolcraftCanvasAspectRatioValuesEqual(
  first: unknown,
  second: ToolcraftCanvasAspectRatioValue,
): boolean {
  if (!isRecord(first)) {
    return false;
  }

  return (
    first.height === second.height &&
    first.mode === second.mode &&
    first.value === second.value &&
    first.width === second.width
  );
}

export function applyToolcraftCanvasAspectRatioToSize({
  anchor,
  ratio,
  size,
  value,
}: {
  anchor: "height" | "width";
  ratio: ToolcraftCanvasAspectRatioValue;
  size: ToolcraftState["canvas"]["size"];
  value: number;
}): ToolcraftState["canvas"]["size"] {
  if (anchor === "width") {
    return {
      ...size,
      height: Math.max(1, Math.round((value * ratio.height) / ratio.width)),
      width: value,
    };
  }

  return {
    ...size,
    height: value,
    width: Math.max(1, Math.round((value * ratio.width) / ratio.height)),
  };
}

export function getToolcraftCanvasAspectRatioPresetSize(
  ratio: ToolcraftCanvasAspectRatioValue,
): ToolcraftState["canvas"]["size"] | null {
  if (ratio.mode !== "preset") {
    return null;
  }

  const preset = getToolcraftCanvasAspectRatioPreset(ratio.value);

  if (!preset) {
    return null;
  }

  return {
    height: preset.height,
    unit: "px",
    width: preset.width,
  };
}

export function getToolcraftResetCanvasSize(
  state: ToolcraftState,
): ToolcraftState["canvas"]["size"] | null {
  const width = asToolcraftCanvasSizeDimension(
    state.defaults[toolcraftCanvasSizeWidthTarget],
  );
  const height = asToolcraftCanvasSizeDimension(
    state.defaults[toolcraftCanvasSizeHeightTarget],
  );

  if (width === null && height === null) {
    return null;
  }

  return {
    ...state.canvas.size,
    height: height ?? state.canvas.size.height,
    width: width ?? state.canvas.size.width,
  };
}

export function toolcraftCanvasSizesEqual(
  first: ToolcraftState["canvas"]["size"],
  second: ToolcraftState["canvas"]["size"],
): boolean {
  return (
    first.height === second.height &&
    first.unit === second.unit &&
    first.width === second.width
  );
}
