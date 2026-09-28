import * as React from "react";
import {
  useToolcraftDispatch,
  useToolcraftSelector,
} from "@/toolcraft/runtime/react";

const margin = 32;
const minZoom = 25;
const maxZoom = 100;

type Box = { bottom: number; left: number; right: number; top: number };

export function getIsomockFreeArea(viewport: Box, panels: readonly Box[]): Box {
  const free = {
    bottom: viewport.bottom,
    left: viewport.left,
    right: viewport.right,
    top: viewport.top,
  };
  const centerX = (viewport.left + viewport.right) / 2;
  const centerY = (viewport.top + viewport.bottom) / 2;
  for (const panel of panels) {
    if (panel.right <= panel.left || panel.bottom <= panel.top) continue;
    const gaps = [
      { edge: "left", size: panel.right - viewport.left, fits: panel.right < centerX },
      { edge: "right", size: viewport.right - panel.left, fits: panel.left > centerX },
      { edge: "top", size: panel.bottom - viewport.top, fits: panel.bottom < centerY },
      { edge: "bottom", size: viewport.bottom - panel.top, fits: panel.top > centerY },
    ].filter((gap) => gap.fits);
    const smallest = gaps.sort((a, b) => a.size - b.size)[0];
    if (!smallest) continue;
    if (smallest.edge === "left") free.left = Math.max(free.left, panel.right);
    if (smallest.edge === "right") free.right = Math.min(free.right, panel.left);
    if (smallest.edge === "top") free.top = Math.max(free.top, panel.bottom);
    if (smallest.edge === "bottom") free.bottom = Math.min(free.bottom, panel.top);
  }
  return free;
}

export function getIsomockFitViewport(
  viewport: Box,
  free: Box,
  artboard: Readonly<{ height: number; width: number }>,
) {
  const width = Math.max(1, free.right - free.left - margin * 2);
  const height = Math.max(1, free.bottom - free.top - margin * 2);
  const zoom = Math.min(
    maxZoom,
    Math.max(
      minZoom,
      Math.floor(Math.min(width / artboard.width, height / artboard.height) * 100),
    ),
  );
  return {
    offset: {
      x: (free.left + free.right) / 2 - (viewport.left + viewport.right) / 2,
      y: (free.top + free.bottom) / 2 - (viewport.top + viewport.bottom) / 2,
    },
    zoom,
  };
}

export function useIsomockFitArtboard(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
): void {
  const dispatch = useToolcraftDispatch();
  const width = useToolcraftSelector((state) => state.canvas.size.width);
  const height = useToolcraftSelector((state) => state.canvas.size.height);

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const viewport = canvasRef.current
        ?.closest('[data-slot="toolcraft-runtime-canvas"]')
        ?.getBoundingClientRect();
      if (!viewport) return;
      const panels = Array.from(
        document.querySelectorAll("[data-panel-id]"),
        (panel) => panel.getBoundingClientRect(),
      );
      const { offset, zoom } = getIsomockFitViewport(
        viewport,
        getIsomockFreeArea(viewport, panels),
        { height, width },
      );
      dispatch({ offset, type: "canvas.setViewport", zoom });
    });
    return () => cancelAnimationFrame(frame);
  }, [canvasRef, dispatch, height, width]);
}
