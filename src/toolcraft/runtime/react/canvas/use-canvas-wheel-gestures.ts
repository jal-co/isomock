"use client";
import * as React from "react";
import type { ToolcraftExternalStore } from "../../state/toolcraft-external-store";
import {
  createCanvasNavigationController,
  type CanvasNavigationInput,
} from "./canvas-navigation-controller";

export function useCanvasWheelGestures(
  store: ToolcraftExternalStore,
  viewportRef: React.RefObject<HTMLDivElement | null>,
) {
  const controller = React.useRef<ReturnType<typeof createCanvasNavigationController> | null>(null);
  const commitPendingWheel = React.useCallback(() => controller.current?.commit(), []);
  const handleViewportInput = React.useCallback(
    (input: CanvasNavigationInput) => controller.current?.input(input),
    [],
  );
  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const owner = createCanvasNavigationController(store, viewport);
    controller.current = owner;
    const options: AddEventListenerOptions = { capture: true, passive: false };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const zoom = event.ctrlKey || event.metaKey;
      if (
        event.target instanceof HTMLIFrameElement &&
        !zoom &&
        event.target.dataset.toolcraftDocumentScroll !== "canvas"
      )
        return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
      owner.input({
        type: "wheel",
        clientX: event.clientX,
        clientY: event.clientY,
        deltaX: event.deltaX * unit,
        deltaY: event.deltaY * unit,
        zoom,
      });
    };
    const pinch = (event: Event) => {
      event.preventDefault();
      const native = event as Event & { clientX?: number; clientY?: number; scale?: number };
      const rect = viewport.getBoundingClientRect();
      owner.input({
        type: "gesture",
        phase: event.type.slice(7) as "start" | "change" | "end",
        clientX: native.clientX ?? rect.left + rect.width / 2,
        clientY: native.clientY ?? rect.top + rect.height / 2,
        scale: native.scale ?? 1,
      });
    };
    viewport.addEventListener("wheel", wheel, options);
    viewport.addEventListener("gesturestart", pinch, options);
    viewport.addEventListener("gesturechange", pinch, options);
    viewport.ownerDocument.addEventListener("gestureend", pinch, options);
    return () => {
      viewport.removeEventListener("wheel", wheel, options);
      viewport.removeEventListener("gesturestart", pinch, options);
      viewport.removeEventListener("gesturechange", pinch, options);
      viewport.ownerDocument.removeEventListener("gestureend", pinch, options);
      owner.commit();
      controller.current = null;
    };
  }, [store, viewportRef]);
  return { commitPendingWheel, handleViewportInput };
}
