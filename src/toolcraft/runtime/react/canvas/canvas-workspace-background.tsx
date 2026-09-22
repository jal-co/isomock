"use client";

import { CanvasDotPattern } from "@/toolcraft/ui";
import { toolcraftCanvasWorkspaceBackgroundTarget } from "../../schema/runtime-targets";
import { useToolcraftValue } from "../app-shell/use-toolcraft";
import { useCanvasViewportTransform } from "./canvas-viewport-world";

function WorkspaceDots({ color }: { color?: string }): React.JSX.Element {
  const { offsetX, offsetY, zoom } = useCanvasViewportTransform();
  return <CanvasDotPattern color={color} offset={{ x: offsetX, y: offsetY }} scale={zoom / 100} />;
}

export function CanvasWorkspaceBackground(): React.JSX.Element | null {
  const mode = useToolcraftValue(toolcraftCanvasWorkspaceBackgroundTarget);
  return mode === "dots" ? <WorkspaceDots /> : null;
}
