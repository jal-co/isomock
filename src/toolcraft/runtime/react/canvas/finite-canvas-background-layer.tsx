"use client";

import * as React from "react";
import { getToolcraftFiniteArtboardRect } from "../../scene";
import type { ToolcraftCanvasSize } from "../../schema/types";

export function FiniteCanvasBackgroundLayer({
  color,
  size,
}: {
  color: string;
  size: ToolcraftCanvasSize;
}): React.JSX.Element {
  const rect = getToolcraftFiniteArtboardRect(size);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute"
      data-toolcraft-finite-background-layer=""
      style={{
        backgroundColor: color,
        height: rect.height,
        left: rect.x,
        top: rect.y,
        width: rect.width,
      }}
    />
  );
}
