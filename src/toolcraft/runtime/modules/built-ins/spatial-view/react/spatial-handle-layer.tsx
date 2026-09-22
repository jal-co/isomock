"use client";
import * as React from "react";

export const spatialHandleLayer = Object.freeze({
  controlType: "orientationGizmo" as const,
  Layer: React.lazy(async () => {
    const module = await import("../../../../react/orientation-gizmo/orientation-gizmo-layer");
    return { default: module.ToolcraftOrientationGizmoLayer };
  }),
});
