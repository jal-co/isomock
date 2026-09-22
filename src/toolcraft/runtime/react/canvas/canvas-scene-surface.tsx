"use client";

import * as React from "react";

import { getToolcraftFiniteArtboardRect } from "../../scene";
import type { ToolcraftCanvasFrame } from "../../state/canvas-frame";

export function CanvasSceneSurface({
  children,
  frame,
}: {
  children: React.ReactNode;
  frame: ToolcraftCanvasFrame;
}): React.JSX.Element {
  const artboardRect =
    frame.kind === "finite"
      ? getToolcraftFiniteArtboardRect(frame.size)
      : { height: 0, width: 0, x: 0, y: 0 };
  const sceneOrigin = { x: -artboardRect.x, y: -artboardRect.y };

  return (
    <div
      className={`absolute z-10 ${
        frame.kind === "finite" ? "overflow-hidden" : "overflow-visible"
      }`}
      data-toolcraft-canvas-content=""
      data-toolcraft-canvas-mode={frame.kind}
      data-toolcraft-canvas-surface=""
      data-toolcraft-editable-canvas={
        frame.kind === "finite" ? "" : undefined
      }
      data-toolcraft-infinite-scene={
        frame.kind === "infinite" ? "" : undefined
      }
      style={{
        height: artboardRect.height,
        left: artboardRect.x,
        top: artboardRect.y,
        width: artboardRect.width,
      }}
    >
      <div
        className="absolute z-20"
        data-toolcraft-scene-origin=""
        style={{ left: sceneOrigin.x, top: sceneOrigin.y }}
      >
        {children}
      </div>
    </div>
  );
}
