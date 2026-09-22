import type { ToolcraftPoint } from "./types";

export const toolcraftCanvasZoomMin = 25;
export const toolcraftCanvasZoomMax = 400;
export const toolcraftCanvasZoomStep = 10;
export const toolcraftCanvasZoomDefault = 100;

export function clampToolcraftCanvasZoom(zoom: number): number {
  return Math.min(toolcraftCanvasZoomMax, Math.max(toolcraftCanvasZoomMin, zoom));
}

/** Anchor coordinates are relative to the viewport center, in CSS pixels. */
export function zoomToolcraftCanvasOffset(
  offset: ToolcraftPoint,
  currentZoom: number,
  nextZoom: number,
  anchor: ToolcraftPoint = { x: 0, y: 0 },
): ToolcraftPoint {
  const ratio = nextZoom / currentZoom;
  return {
    x: anchor.x - (anchor.x - offset.x) * ratio,
    y: anchor.y - (anchor.y - offset.y) * ratio,
  };
}
