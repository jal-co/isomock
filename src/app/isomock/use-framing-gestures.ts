import * as React from "react";
import { useToolcraftDispatch } from "@/toolcraft/runtime/react";
import { createControlHistoryGroupId } from "@/toolcraft/ui";

import { getIsomockFrameScale } from "./camera";
import { isomockTargets, type Vec2 } from "./settings";

export const ISOMOCK_ZOOM_RANGE = { max: 12, min: 0.5 } as const;

type Framing = Readonly<{ offset: Vec2; zoom: number }>;
type FramingGesture = {
  framing: Framing;
  group: string;
  lastAt: number;
  pinchStartZoom: number;
};

export function zoomFramingAround(
  framing: Framing,
  nextZoom: number,
  anchor: Vec2,
  imageAspect: number,
  frameAspect: number,
): Framing {
  const zoom = Math.min(
    ISOMOCK_ZOOM_RANGE.max,
    Math.max(ISOMOCK_ZOOM_RANGE.min, nextZoom),
  );
  const before = getIsomockFrameScale(framing.zoom, imageAspect, frameAspect);
  const after = getIsomockFrameScale(zoom, imageAspect, frameAspect);
  return {
    offset: {
      x: framing.offset.x + anchor.x / after - anchor.x / before,
      y: framing.offset.y + anchor.y / after - anchor.y / before,
    },
    zoom,
  };
}

export function panFraming(
  framing: Framing,
  delta: Vec2,
  imageAspect: number,
  frameAspect: number,
): Framing {
  const frameScale = getIsomockFrameScale(
    framing.zoom,
    imageAspect,
    frameAspect,
  );
  return {
    offset: {
      x: framing.offset.x + delta.x / frameScale,
      y: framing.offset.y + delta.y / frameScale,
    },
    zoom: framing.zoom,
  };
}

const gestureIdleMs = 300;

export function useIsomockFramingGestures(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  framing: Framing,
  imageAspect: number | null,
): void {
  const dispatch = useToolcraftDispatch();
  const latest = React.useRef({ framing, imageAspect });
  const gesture = React.useRef<FramingGesture | null>(null);
  latest.current = { framing, imageAspect };

  React.useEffect(() => {
    const view = canvasRef.current?.ownerDocument.defaultView;
    if (!view) return undefined;

    const begin = (): FramingGesture => {
      const now = performance.now();
      const current = gesture.current;
      if (current && now - current.lastAt < gestureIdleMs) {
        current.lastAt = now;
        return current;
      }
      const next: FramingGesture = {
        framing: latest.current.framing,
        group: createControlHistoryGroupId("isomock-framing"),
        lastAt: now,
        pinchStartZoom: latest.current.framing.zoom,
      };
      gesture.current = next;
      return next;
    };

    const commit = (next: Framing) => {
      const current = gesture.current;
      if (!current) return;
      current.framing = next;
      for (const [target, value] of [
        [isomockTargets.zoom, next.zoom],
        [isomockTargets.offset, next.offset],
      ] as const) {
        dispatch({
          history: "merge",
          historyGroup: current.group,
          label: "Frame screenshot",
          target,
          type: "controls.setValue",
          value,
        });
      }
    };

    const locate = (event: Event) => {
      const canvas = canvasRef.current;
      const aspect = latest.current.imageAspect;
      if (!canvas || !aspect || event.target !== canvas) return null;
      const bounds = canvas.getBoundingClientRect();
      const clientX =
        "clientX" in event
          ? Number(event.clientX)
          : bounds.left + bounds.width / 2;
      const clientY =
        "clientY" in event
          ? Number(event.clientY)
          : bounds.top + bounds.height / 2;
      return {
        anchor: {
          x: (clientX - bounds.left - bounds.width / 2) / bounds.height,
          y: (clientY - bounds.top - bounds.height / 2) / bounds.height,
        },
        frameAspect: bounds.width / bounds.height,
        frameHeight: bounds.height,
        imageAspect: aspect,
      };
    };

    const wheel = (event: WheelEvent) => {
      const located = locate(event);
      if (!located) return;
      event.preventDefault();
      event.stopPropagation();
      const { framing: start } = begin();
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? located.frameHeight
            : 1;
      if (event.ctrlKey || event.metaKey) {
        commit(
          zoomFramingAround(
            start,
            start.zoom * Math.exp(-event.deltaY * unit * 0.01),
            located.anchor,
            located.imageAspect,
            located.frameAspect,
          ),
        );
      } else {
        commit(
          panFraming(
            start,
            {
              x: (-event.deltaX * unit) / located.frameHeight,
              y: (-event.deltaY * unit) / located.frameHeight,
            },
            located.imageAspect,
            located.frameAspect,
          ),
        );
      }
    };

    const pinch = (event: Event) => {
      const located = locate(event);
      if (!located) return;
      event.preventDefault();
      event.stopPropagation();
      const current = begin();
      const scaleFactor = "scale" in event ? Number(event.scale) : 1;
      commit(
        zoomFramingAround(
          current.framing,
          current.pinchStartZoom * scaleFactor,
          located.anchor,
          located.imageAspect,
          located.frameAspect,
        ),
      );
    };

    const options: AddEventListenerOptions = { capture: true, passive: false };
    view.addEventListener("wheel", wheel, options);
    view.addEventListener("gesturestart", pinch, options);
    view.addEventListener("gesturechange", pinch, options);
    return () => {
      view.removeEventListener("wheel", wheel, options);
      view.removeEventListener("gesturestart", pinch, options);
      view.removeEventListener("gesturechange", pinch, options);
    };
  }, [canvasRef, dispatch]);
}
