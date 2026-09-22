import { clampToolcraftCanvasZoom, zoomToolcraftCanvasOffset } from "../../state/canvas-zoom";
import type { ToolcraftPoint } from "../../state/types";

type CanvasPointerPosition = ToolcraftPoint & {
  pointerId: number;
};

export type CanvasPinchState = {
  pointerIds: readonly [number, number];
  startCenter: ToolcraftPoint;
  startDistance: number;
  startOffset: ToolcraftPoint;
  startZoom: number;
};

export function getZoomedCanvasOffset({
  clientX,
  clientY,
  currentZoom,
  nextZoom,
  offset,
  viewportElement,
}: {
  clientX: number;
  clientY: number;
  currentZoom: number;
  nextZoom: number;
  offset: ToolcraftPoint;
  viewportElement: HTMLElement;
}): ToolcraftPoint {
  const rect = viewportElement.getBoundingClientRect();
  const pointerX = clientX - rect.left - rect.width / 2;
  const pointerY = clientY - rect.top - rect.height / 2;
  return zoomToolcraftCanvasOffset(offset, currentZoom, nextZoom, { x: pointerX, y: pointerY });
}

export function getCanvasPointerCenter(
  first: CanvasPointerPosition,
  second: CanvasPointerPosition,
): ToolcraftPoint {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

export function getCanvasPointerDistance(
  first: CanvasPointerPosition,
  second: CanvasPointerPosition,
): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function getFirstTouchPair(
  pointers: ReadonlyMap<number, ToolcraftPoint>,
): readonly [CanvasPointerPosition, CanvasPointerPosition] | null {
  const entries = Array.from(pointers.entries()).slice(0, 2);

  if (entries.length < 2) {
    return null;
  }

  return [
    { pointerId: entries[0][0], ...entries[0][1] },
    { pointerId: entries[1][0], ...entries[1][1] },
  ];
}

export function createCanvasPinchState(
  pointers: ReadonlyMap<number, ToolcraftPoint>,
  offset: ToolcraftPoint,
  zoom: number,
): CanvasPinchState | null {
  const pair = getFirstTouchPair(pointers);

  if (!pair) {
    return null;
  }

  const startDistance = getCanvasPointerDistance(pair[0], pair[1]);

  if (startDistance <= 0) {
    return null;
  }

  return {
    pointerIds: [pair[0].pointerId, pair[1].pointerId],
    startCenter: getCanvasPointerCenter(pair[0], pair[1]),
    startDistance,
    startOffset: offset,
    startZoom: zoom,
  };
}

export function getPinchedCanvasViewport({
  currentCenter,
  currentDistance,
  pinch,
  viewportElement,
}: {
  currentCenter: ToolcraftPoint;
  currentDistance: number;
  pinch: CanvasPinchState;
  viewportElement: HTMLElement;
}): { offset: ToolcraftPoint; zoom: number } {
  const zoom = clampToolcraftCanvasZoom(
    pinch.startZoom * (currentDistance / pinch.startDistance),
  );
  const anchoredOffset = getZoomedCanvasOffset({
    clientX: pinch.startCenter.x,
    clientY: pinch.startCenter.y,
    currentZoom: pinch.startZoom,
    nextZoom: zoom,
    offset: pinch.startOffset,
    viewportElement,
  });

  return {
    offset: {
      x: anchoredOffset.x + currentCenter.x - pinch.startCenter.x,
      y: anchoredOffset.y + currentCenter.y - pinch.startCenter.y,
    },
    zoom,
  };
}
