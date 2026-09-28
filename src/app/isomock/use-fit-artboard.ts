import * as React from "react";
import {
  useToolcraftDispatch,
  useToolcraftSelector,
} from "@/toolcraft/runtime/react";

const margin = 24;
const minZoom = 25;
const maxZoom = 100;
const panelSettleMs = 300;

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

export function useIsomockFitArtboard(viewport: HTMLElement | null): void {
  const dispatch = useToolcraftDispatch();
  const width = useToolcraftSelector((state) => state.canvas.size.width);
  const height = useToolcraftSelector((state) => state.canvas.size.height);
  const panelLayout = useToolcraftSelector((state) =>
    Object.entries(state.panels)
      .map(([id, panel]) =>
        [id, panel.offset.x, panel.offset.y, panel.collapsed, panel.hidden, panel.extended, panel.snapEdge].join(":"),
      )
      .join("|"),
  );

  const fit = React.useCallback(() => {
    if (!viewport) return;
    const bounds = viewport.getBoundingClientRect();
    const panelBoxes = Array.from(
      document.querySelectorAll("[data-panel-id]"),
      (panel) => panel.getBoundingClientRect(),
    );
    const { offset, zoom } = getIsomockFitViewport(
      bounds,
      getIsomockFreeArea(bounds, panelBoxes),
      { height, width },
    );
    dispatch({ offset, type: "canvas.setViewport", zoom });
  }, [dispatch, height, viewport, width]);

  React.useEffect(() => {
    if (!viewport) return undefined;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    observer.observe(viewport);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [fit, viewport]);

  React.useEffect(() => {
    const timeout = setTimeout(fit, panelSettleMs);
    return () => clearTimeout(timeout);
  }, [fit, panelLayout]);
}
