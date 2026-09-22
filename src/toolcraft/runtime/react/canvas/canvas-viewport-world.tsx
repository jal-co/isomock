"use client";

import * as React from "react";

import type { ToolcraftState } from "../../state/types";
import { useToolcraftDependencySelector } from "../app-shell/toolcraft-selectors";

type CanvasViewportWorldProps = {
  children: React.ReactNode;
};

type CanvasViewportTransform = {
  offsetX: number;
  offsetY: number;
  zoom: number;
};

const viewportDependencies = [
  { kind: "viewport.offset" },
  { kind: "viewport.zoom" },
] as const;

const selectViewportTransform = (
  state: ToolcraftState,
): CanvasViewportTransform => ({
  offsetX: state.canvas.offset.x,
  offsetY: state.canvas.offset.y,
  zoom: state.canvas.zoom,
});

function viewportTransformsEqual(
  previous: CanvasViewportTransform,
  next: CanvasViewportTransform,
): boolean {
  return (
    Object.is(previous.offsetX, next.offsetX) &&
    Object.is(previous.offsetY, next.offsetY) &&
    Object.is(previous.zoom, next.zoom)
  );
}

export function useCanvasViewportTransform(): CanvasViewportTransform {
  return useToolcraftDependencySelector(
    selectViewportTransform,
    viewportTransformsEqual,
    viewportDependencies,
  );
}

export function CanvasViewportWorld({
  children,
}: CanvasViewportWorldProps): React.JSX.Element {
  const transform = useCanvasViewportTransform();

  return (
    <div
      className="absolute top-1/2 left-1/2 size-0"
      data-toolcraft-canvas-offset-x={transform.offsetX}
      data-toolcraft-canvas-offset-y={transform.offsetY}
      data-toolcraft-canvas-zoom={transform.zoom}
      data-toolcraft-canvas-world=""
      style={{
        transform: `translate(${transform.offsetX}px, ${transform.offsetY}px) scale(${transform.zoom / 100})`,
        transformOrigin: "0 0",
      }}
    >
      {children}
    </div>
  );
}
