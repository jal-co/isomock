import {
  resolveToolcraftExportFrame,
  type ToolcraftExportFrame,
} from "../../export/export-frame";
import type { ReadonlyToolcraftState } from "../../state/readonly-state";
import type { ToolcraftModelRenderHost } from "./model-render-binding";
import { renderToolcraftModelsInWorldContext } from "./model-export-world-context";

export type ToolcraftRenderModelsToCanvas = (
  canvas: HTMLCanvasElement,
) => Promise<number>;

export type ToolcraftModelExportOptions = Readonly<{
  exportFrame?: ToolcraftExportFrame;
  signal: AbortSignal;
  suppressedTargets?: readonly string[];
}>;

function resolveModelExportOptions(
  state: ReadonlyToolcraftState,
  options: ToolcraftModelExportOptions,
): ToolcraftModelExportOptions & { exportFrame: ToolcraftExportFrame } {
  return {
    ...options,
    exportFrame: options.exportFrame ?? resolveToolcraftExportFrame(state),
  };
}

export async function renderToolcraftModelsToCanvas(
  host: ToolcraftModelRenderHost | null,
  state: ReadonlyToolcraftState,
  canvas: HTMLCanvasElement,
  options: ToolcraftModelExportOptions,
): Promise<number> {
  options.signal.throwIfAborted();
  if (!host) return 0;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Toolcraft model export requires a 2D target canvas.");
  }
  const resolved = resolveModelExportOptions(state, options);
  const scaleX = canvas.width / resolved.exportFrame.width;
  const scaleY = canvas.height / resolved.exportFrame.height;
  context.save();
  try {
    context.setTransform(
      scaleX,
      0,
      0,
      scaleY,
      -resolved.exportFrame.x * scaleX,
      -resolved.exportFrame.y * scaleY,
    );
    return await renderToolcraftModelsInWorldContext({
      canvas,
      context,
      exportFrame: resolved.exportFrame,
      host,
      signal: options.signal,
      state,
      suppressedTargets: resolved.suppressedTargets,
    });
  } finally {
    context.restore();
  }
}
