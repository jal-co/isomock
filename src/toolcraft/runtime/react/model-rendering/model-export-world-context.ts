import type { ReadonlyToolcraftState } from "../../state/readonly-state";
import type { ToolcraftExportFrame } from "../../export/export-frame";
import { getToolcraftSceneElementRect } from "../../scene";
import type { ToolcraftModelRenderHost } from "./model-render-binding";
import { getToolcraftVisibleModelExportRequests } from "./model-render-state";

export type ToolcraftModelWorldContextRenderRequest = Readonly<{
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  exportFrame: ToolcraftExportFrame;
  host: ToolcraftModelRenderHost;
  signal: AbortSignal;
  state: ReadonlyToolcraftState;
  suppressedTargets?: readonly string[];
}>;

function getExportPixelRatio(
  frame: ToolcraftExportFrame,
  canvas: HTMLCanvasElement,
): number {
  const pixelRatio = Math.min(
    canvas.width / frame.width,
    canvas.height / frame.height,
  );
  return Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
}

export async function renderToolcraftModelsInWorldContext({
  canvas,
  context,
  exportFrame,
  host,
  signal,
  state,
  suppressedTargets,
}: ToolcraftModelWorldContextRenderRequest): Promise<number> {
  signal.throwIfAborted();
  const pixelRatio = getExportPixelRatio(exportFrame, canvas);
  const requests = getToolcraftVisibleModelExportRequests(state, {
    suppressedTargets,
    viewportForAsset: (asset) => {
      const rect = getToolcraftSceneElementRect(asset);
      return { height: rect.height, width: rect.width };
    },
  });

  for (const request of requests) {
    signal.throwIfAborted();
    const rect = getToolcraftSceneElementRect(request.asset);
    await host.renderExport(request, {
      height: rect.height,
      onRendered: (source) => {
        signal.throwIfAborted();
        context.drawImage(source, rect.x, rect.y, rect.width, rect.height);
      },
      pixelRatio,
      signal,
      width: rect.width,
    });
    signal.throwIfAborted();
  }

  return requests.length;
}
