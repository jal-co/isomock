import type { ReadonlyToolcraftState } from "../state/readonly-state";
import {
  resolveToolcraftExportFrame,
  type ToolcraftExportFrame,
} from "./export-frame";

export type ToolcraftImageExportResolution = "current" | "2k" | "4k" | "8k";
export type ToolcraftVideoExportResolution = "current" | "4k";

export type ToolcraftRetinaExportSize = {
  height: number;
  pixelRatio: number;
  width: number;
};

export type ToolcraftExportSizeOptions = {
  devicePixelRatio?: number;
  frame?: ToolcraftExportFrame;
  state: ReadonlyToolcraftState;
};

export type ToolcraftImageExportSizeOptions = ToolcraftExportSizeOptions & {
  resolution?: ToolcraftImageExportResolution | string;
};

export type ToolcraftVideoExportSizeOptions = ToolcraftExportSizeOptions & {
  resolution?: ToolcraftVideoExportResolution | string;
};

const imageExportLongEdges: Record<
  Exclude<ToolcraftImageExportResolution, "current">,
  number
> = { "2k": 2048, "4k": 4096, "8k": 8192 };

const videoExportMaxSizes: Record<
  Exclude<ToolcraftVideoExportResolution, "current">,
  { height: number; width: number }
> = { "4k": { height: 2160, width: 3840 } };

function getExportFrame(options: ToolcraftExportSizeOptions): ToolcraftExportFrame {
  if (options.frame) return options.frame;
  return resolveToolcraftExportFrame(options.state);
}

function roundVideoDimension(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

export function getToolcraftRetinaExportPixelRatio(devicePixelRatio?: number): number {
  const globalPixelRatio = (globalThis as typeof globalThis & { devicePixelRatio?: number })
    .devicePixelRatio;
  const fallbackPixelRatio =
    typeof globalPixelRatio === "number" && Number.isFinite(globalPixelRatio)
      ? globalPixelRatio
      : 1;
  const requestedPixelRatio =
    typeof devicePixelRatio === "number" && Number.isFinite(devicePixelRatio)
      ? devicePixelRatio
      : fallbackPixelRatio;
  return Math.max(2, requestedPixelRatio);
}

export function getToolcraftRetinaExportSize(
  options: ToolcraftExportSizeOptions,
): ToolcraftRetinaExportSize {
  const frame = getExportFrame(options);
  const pixelRatio = getToolcraftRetinaExportPixelRatio(options.devicePixelRatio);
  return {
    height: Math.ceil(frame.height * pixelRatio),
    pixelRatio,
    width: Math.ceil(frame.width * pixelRatio),
  };
}

export function getToolcraftImageExportSize(
  options: ToolcraftImageExportSizeOptions,
): ToolcraftRetinaExportSize {
  const frame = getExportFrame(options);
  const normalizedResolution = String(options.resolution ?? "current").toLowerCase();
  const targetLongEdge = imageExportLongEdges[
    normalizedResolution as Exclude<ToolcraftImageExportResolution, "current">
  ];
  if (!targetLongEdge) return getToolcraftRetinaExportSize({ ...options, frame });

  const cssWidth = Math.max(1, frame.width);
  const cssHeight = Math.max(1, frame.height);
  const pixelRatio = targetLongEdge / Math.max(cssWidth, cssHeight);
  return cssWidth >= cssHeight
    ? {
        height: Math.max(1, Math.round(cssHeight * pixelRatio)),
        pixelRatio,
        width: targetLongEdge,
      }
    : {
        height: targetLongEdge,
        pixelRatio,
        width: Math.max(1, Math.round(cssWidth * pixelRatio)),
      };
}

export function getToolcraftVideoExportSize(
  options: ToolcraftVideoExportSizeOptions,
): ToolcraftRetinaExportSize {
  const frame = getExportFrame(options);
  const normalizedResolution = String(options.resolution ?? "current").toLowerCase();
  const targetMaxSize = videoExportMaxSizes[
    normalizedResolution as Exclude<ToolcraftVideoExportResolution, "current">
  ];
  const cssWidth = Math.max(1, frame.width);
  const cssHeight = Math.max(1, frame.height);

  if (!targetMaxSize) {
    const width = roundVideoDimension(cssWidth);
    const height = roundVideoDimension(cssHeight);
    return {
      height,
      pixelRatio: Math.max(width / cssWidth, height / cssHeight),
      width,
    };
  }

  const pixelRatio = Math.min(
    targetMaxSize.width / cssWidth,
    targetMaxSize.height / cssHeight,
  );
  const width = roundVideoDimension(cssWidth * pixelRatio);
  const height = roundVideoDimension(cssHeight * pixelRatio);
  return {
    height,
    pixelRatio: Math.max(width / cssWidth, height / cssHeight),
    width,
  };
}
