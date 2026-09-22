"use client";

import * as React from "react";

import { getToolcraftCanvasFrame } from "../../state/canvas-frame";
import type { ToolcraftState } from "../../state/types";
import { useToolcraftCommittedSelector } from "../app-shell/toolcraft-selectors";

const selectCanvas = (state: ToolcraftState) => state.canvas;

function canvasStatesEqual(
  previous: ToolcraftState["canvas"],
  next: ToolcraftState["canvas"],
): boolean {
  return previous.mode === next.mode && previous.size === next.size;
}

export function useToolcraftCanvasFrame() {
  const canvas = useToolcraftCommittedSelector(selectCanvas, canvasStatesEqual);

  return React.useMemo(
    () => getToolcraftCanvasFrame(canvas),
    [canvas],
  );
}
