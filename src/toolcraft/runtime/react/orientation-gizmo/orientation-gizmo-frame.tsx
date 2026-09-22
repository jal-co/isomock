"use client";

import type * as React from "react";
import { useToolcraftTheme } from "../app-shell/theme-runtime";

export const toolcraftOrientationGizmoCssSize = 70;
const inset = 16;

/** One composited opacity for the axes and their theme-aware backing. */
export function ToolcraftOrientationGizmoFrame({
  children,
  locked,
}: {
  children: React.ReactNode;
  locked: boolean;
}): React.JSX.Element {
  const { resolvedTheme } = useToolcraftTheme();
  return (
    <div
      data-slot="toolcraft-orientation-gizmo-frame"
      style={{
        bottom: inset,
        height: toolcraftOrientationGizmoCssSize,
        left: inset,
        opacity: locked ? 1 / 1.5 : 1,
        pointerEvents: "none",
        position: "absolute",
        width: toolcraftOrientationGizmoCssSize,
        zIndex: 20,
      }}
    >
      <div
        aria-hidden="true"
        data-slot="toolcraft-orientation-gizmo-backing"
        style={{
          backfaceVisibility: "hidden",
          backgroundColor: resolvedTheme === "dark" ? "#000000" : "#ececef",
          borderRadius: "50%",
          bottom: 0,
          contain: "paint",
          height: toolcraftOrientationGizmoCssSize,
          left: 0,
          pointerEvents: "none",
          position: "absolute",
          transform: "translateZ(0)",
          width: toolcraftOrientationGizmoCssSize,
          zIndex: 20,
        }}
      />
      {children}
    </div>
  );
}
