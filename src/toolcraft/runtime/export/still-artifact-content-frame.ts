import type { ToolcraftRendererPipelineClient } from "../rendering";
import { resolveToolcraftProductSceneBounds } from "../scene";
import { getToolcraftArtifactTimelineProgress } from "./artifact-frame-state";
import {
  resolveToolcraftStillArtifactFrame,
  type ToolcraftArtifactScenePlan,
  type ToolcraftStillArtifactSceneFrameRequest,
} from "./artifact-scene-frame";
import { resolveToolcraftStillExportFrame, ToolcraftSceneExportError } from "./export-frame";
import type { ToolcraftProductExportBoundsProvider } from "./product-export-bounds";

export async function resolveToolcraftStillArtifactContentFrame(
  request: ToolcraftStillArtifactSceneFrameRequest & Readonly<{
    getContentBounds?: ToolcraftProductExportBoundsProvider;
    rendererPipeline: ToolcraftRendererPipelineClient | null;
    signal: AbortSignal;
  }>,
): Promise<ToolcraftArtifactScenePlan> {
  request.signal.throwIfAborted();
  const plan = resolveToolcraftStillArtifactFrame(request);
  if (request.state.canvas.mode !== "infinite" || plan.productFrame.kind !== "ready" || !request.getContentBounds) return plan;

  let bounds;
  try {
    bounds = resolveToolcraftProductSceneBounds(await request.getContentBounds({
      frame: plan.productFrame.rect,
      rendererPipeline: request.rendererPipeline,
      signal: request.signal,
      state: request.state,
      timeSeconds: request.state.timeline.currentTimeSeconds,
      timelineProgress: getToolcraftArtifactTimelineProgress(request.state),
    }));
  } catch {
    request.signal.throwIfAborted();
    throw new ToolcraftSceneExportError({
      code: "scene-bounds-unavailable", message: "Product content bounds could not be measured.", ok: false,
    });
  }
  request.signal.throwIfAborted();
  if (!bounds.ok) {
    if (bounds.code === "empty-scene") return plan;
    throw new ToolcraftSceneExportError(bounds);
  }
  return {
    productFrame: plan.productFrame,
    outputFrame: resolveToolcraftStillExportFrame(
      request.state, [plan.productFrame.rect, bounds.bounds], request.visibility,
    ),
  };
}
