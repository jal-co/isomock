import { clampToolcraftCanvasZoom } from "../../state/canvas-zoom";
import type { ToolcraftExternalStore } from "../../state/toolcraft-external-store";
import type { ToolcraftPoint } from "../../state/types";
import { getZoomedCanvasOffset } from "./canvas-viewport-geometry";

export type CanvasNavigationInput =
  | {
      type: "wheel";
      clientX: number;
      clientY: number;
      deltaX: number;
      deltaY: number;
      zoom: boolean;
    }
  | {
      type: "gesture";
      phase: "start" | "change" | "end";
      clientX: number;
      clientY: number;
      scale: number;
    };

/** One viewport controller for native canvas input and authenticated iframe input. */
export function createCanvasNavigationController(
  store: ToolcraftExternalStore,
  viewportElement: HTMLElement,
) {
  let timer: number | undefined;
  let gesture: { anchor: ToolcraftPoint; offset: ToolcraftPoint; zoom: number } | undefined;
  function commit() {
    if (timer === undefined && !gesture) return;
    window.clearTimeout(timer);
    timer = undefined;
    gesture = undefined;
    store.commitTransient("viewport");
  }
  function schedule() {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = undefined;
      store.commitTransient("viewport");
    }, 120);
  }
  function input(event: CanvasNavigationInput) {
    if (event.type === "gesture") {
      if (event.phase === "end") {
        commit();
        return;
      }
      if (event.phase === "start") {
        commit();
        const { offset, zoom } = store.getState().canvas;
        gesture = { anchor: { x: event.clientX, y: event.clientY }, offset, zoom };
        return;
      }
      if (!gesture || !Number.isFinite(event.scale) || event.scale <= 0) return;
      const zoom = clampToolcraftCanvasZoom(gesture.zoom * event.scale);
      store.dispatchTransient({
        type: "canvas.setViewport",
        zoom,
        offset: getZoomedCanvasOffset({
          clientX: gesture.anchor.x,
          clientY: gesture.anchor.y,
          currentZoom: gesture.zoom,
          nextZoom: zoom,
          offset: gesture.offset,
          viewportElement,
        }),
      });
      return;
    }
    if (gesture || !Number.isFinite(event.deltaX) || !Number.isFinite(event.deltaY)) return;
    const { offset, zoom } = store.getState().canvas;
    schedule();
    if (!event.zoom) {
      store.dispatchTransient({
        type: "canvas.setOffset",
        offset: { x: offset.x - event.deltaX, y: offset.y - event.deltaY },
      });
      return;
    }
    const delta = -event.deltaY * 0.5;
    const nextZoom = clampToolcraftCanvasZoom(zoom + (Math.trunc(delta) || Math.sign(delta)));
    if (nextZoom === zoom) return;
    store.dispatchTransient({
      type: "canvas.setViewport",
      zoom: nextZoom,
      offset: getZoomedCanvasOffset({
        clientX: event.clientX,
        clientY: event.clientY,
        currentZoom: zoom,
        nextZoom,
        offset,
        viewportElement,
      }),
    });
  }
  return { input, commit };
}
