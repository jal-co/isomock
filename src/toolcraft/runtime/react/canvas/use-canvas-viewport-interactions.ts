"use client";

import * as React from "react";

import type { CanvasNavigationInput } from "./canvas-navigation-controller";
import { useCanvasWheelGestures } from "./use-canvas-wheel-gestures";
import { useCanvasPanShortcut } from "./use-canvas-pan-shortcut";
import type { ToolcraftExternalStore } from "../../state/toolcraft-external-store";
import type { ToolcraftPoint } from "../../state/types";
import {
  createCanvasPinchState,
  getCanvasPointerCenter,
  getCanvasPointerDistance,
  getPinchedCanvasViewport,
  type CanvasPinchState,
} from "./canvas-viewport-geometry";

type CanvasDragState = {
  originX: number;
  originY: number;
  pointerId: number;
  startX: number;
  startY: number;
};

export function useCanvasViewportInteractions({
  draggable,
  store,
}: {
  draggable: boolean;
  store: ToolcraftExternalStore;
}): {
  handleViewportInput(input: CanvasNavigationInput): void;
  handlePointerDown: React.PointerEventHandler<HTMLDivElement>;
  handlePointerDownCapture: React.PointerEventHandler<HTMLDivElement>;
  handlePointerMoveCapture: React.PointerEventHandler<HTMLDivElement>;
  handlePointerUp: React.PointerEventHandler<HTMLDivElement>;
  handlePointerUpCapture: React.PointerEventHandler<HTMLDivElement>;
  panState: "idle" | "ready" | "dragging";
  viewportRef: React.RefObject<HTMLDivElement | null>;
} {
  const activeTouchPointersRef = React.useRef<Map<number, ToolcraftPoint>>(
    new Map(),
  );
  const dragRef = React.useRef<CanvasDragState | null>(null);
  const pinchRef = React.useRef<CanvasPinchState | null>(null);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const { commitPendingWheel, handleViewportInput } = useCanvasWheelGestures(store, viewportRef);
  const [dragging, setDragging] = React.useState(false);
  const finishDrag = React.useCallback((): void => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDragging(false);
    if (viewportRef.current?.hasPointerCapture?.(drag.pointerId)) {
      viewportRef.current.releasePointerCapture(drag.pointerId);
    }
    store.commitTransient("viewport");
  }, [store]);
  const spacePressed = useCanvasPanShortcut({ draggable, onCancel: finishDrag, viewportRef });
  const startDrag = React.useCallback<React.PointerEventHandler<HTMLDivElement>>((event) => {
    event.preventDefault();
    commitPendingWheel();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const { offset } = store.getState().canvas;
    dragRef.current = {
      originX: offset.x,
      originY: offset.y,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    setDragging(true);
  }, [commitPendingWheel, store]);
  const moveDrag = React.useCallback<React.PointerEventHandler<HTMLDivElement>>((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    store.dispatchTransient({
      offset: {
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      },
      type: "canvas.setOffset",
    });
  }, [store]);

  React.useEffect(() => () => {
    if (dragRef.current || pinchRef.current || activeTouchPointersRef.current.size) {
      activeTouchPointersRef.current.clear();
      dragRef.current = null;
      pinchRef.current = null;
      store.commitTransient("viewport");
    }
  }, [store]);

  const handlePointerDownCapture: React.PointerEventHandler<HTMLDivElement> =
    React.useCallback(
      (event) => {
        if (event.pointerType !== "touch") {
          if (spacePressed && event.button === 0 && !dragRef.current) {
            event.stopPropagation();
            startDrag(event);
          }
          return;
        }

        activeTouchPointersRef.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });

        if (activeTouchPointersRef.current.size < 2) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        commitPendingWheel();

        if (typeof event.currentTarget.setPointerCapture === "function") {
          for (const pointerId of activeTouchPointersRef.current.keys()) {
            event.currentTarget.setPointerCapture(pointerId);
          }
        }

        const { offset, zoom } = store.getState().canvas;
        dragRef.current = null;
        setDragging(false);
        pinchRef.current = createCanvasPinchState(
          activeTouchPointersRef.current,
          offset,
          zoom,
        );
      },
      [commitPendingWheel, spacePressed, startDrag, store],
    );

  const handlePointerMoveCapture: React.PointerEventHandler<HTMLDivElement> =
    React.useCallback(
      (event) => {
        if (dragRef.current?.pointerId === event.pointerId && !pinchRef.current) {
          moveDrag(event);
        }
        if (
          event.pointerType !== "touch" ||
          !activeTouchPointersRef.current.has(event.pointerId)
        ) {
          return;
        }

        activeTouchPointersRef.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });

        const pinch = pinchRef.current;

        if (!pinch) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const first = activeTouchPointersRef.current.get(pinch.pointerIds[0]);
        const second = activeTouchPointersRef.current.get(pinch.pointerIds[1]);

        if (!first || !second) {
          return;
        }

        const firstPointer = { pointerId: pinch.pointerIds[0], ...first };
        const secondPointer = { pointerId: pinch.pointerIds[1], ...second };
        const currentDistance = getCanvasPointerDistance(
          firstPointer,
          secondPointer,
        );

        if (currentDistance <= 0) {
          return;
        }

        store.dispatchTransient({
          ...getPinchedCanvasViewport({
            currentCenter: getCanvasPointerCenter(firstPointer, secondPointer),
            currentDistance,
            pinch,
            viewportElement: event.currentTarget,
          }),
          type: "canvas.setViewport",
        });
      },
      [moveDrag, store],
    );

  const handlePointerUpCapture: React.PointerEventHandler<HTMLDivElement> =
    React.useCallback(
      (event) => {
        if (event.pointerType !== "touch" && dragRef.current?.pointerId === event.pointerId) {
          event.preventDefault();
          event.stopPropagation();
          finishDrag();
          return;
        }
        if (
          event.pointerType !== "touch" ||
          !activeTouchPointersRef.current.has(event.pointerId)
        ) {
          return;
        }

        if (
          typeof event.currentTarget.hasPointerCapture === "function" &&
          event.currentTarget.hasPointerCapture(event.pointerId)
        ) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }

        activeTouchPointersRef.current.delete(event.pointerId);

        if (!pinchRef.current) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const { offset, zoom } = store.getState().canvas;
        pinchRef.current = createCanvasPinchState(
          activeTouchPointersRef.current,
          offset,
          zoom,
        );

        if (pinchRef.current) {
          return;
        }

        const remainingTouch = activeTouchPointersRef.current.entries().next();

        if (!remainingTouch.done && draggable) {
          const [pointerId, point] = remainingTouch.value;
          dragRef.current = {
            originX: offset.x,
            originY: offset.y,
            pointerId,
            startX: point.x,
            startY: point.y,
          };
          setDragging(true);
          return;
        }

        for (const pointerId of activeTouchPointersRef.current.keys()) {
          if (
            typeof event.currentTarget.hasPointerCapture === "function" &&
            event.currentTarget.hasPointerCapture(pointerId)
          ) {
            event.currentTarget.releasePointerCapture(pointerId);
          }
        }

        activeTouchPointersRef.current.clear();
        dragRef.current = null;
        setDragging(false);
        store.commitTransient("viewport");
      },
      [draggable, finishDrag, store],
    );

  const handlePointerDown: React.PointerEventHandler<HTMLDivElement> = React.useCallback(
    (event) => {
      if (
        !draggable ||
        event.pointerType !== "touch" ||
        dragRef.current !== null
      ) {
        return;
      }

      startDrag(event);
    },
    [draggable, startDrag],
  );

  const handlePointerUp: React.PointerEventHandler<HTMLDivElement> = React.useCallback(
    (event) => {
      if (dragRef.current?.pointerId !== event.pointerId) {
        return;
      }

      finishDrag();
    },
    [finishDrag],
  );

  return {
    handleViewportInput,
    handlePointerDown,
    handlePointerDownCapture,
    handlePointerMoveCapture,
    handlePointerUp,
    handlePointerUpCapture,
    panState: dragging ? "dragging" : spacePressed ? "ready" : "idle",
    viewportRef,
  };
}
