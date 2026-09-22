import {
  getToolcraftFiniteArtboardRect,
  resolveToolcraftProductSceneFrame,
  type ToolcraftProductSceneFrame,
  type ToolcraftProductSceneBoundsProvider,
  type ToolcraftRuntimeSceneVisibility,
} from "../scene";
import { getToolcraftCanvasFrame } from "../state/canvas-frame";
import type { ReadonlyToolcraftState } from "../state/readonly-state";
import {
  resolveToolcraftStillExportFrame,
  ToolcraftSceneExportError,
  type ToolcraftExportFrame,
} from "./export-frame";

type ToolcraftArtifactSceneFrameBaseRequest = Readonly<{
  boundsProvider: ToolcraftProductSceneBoundsProvider | undefined;
  productSceneRequired: boolean;
}>;

export type ToolcraftStillArtifactSceneFrameRequest =
  ToolcraftArtifactSceneFrameBaseRequest &
    Readonly<{ state: ReadonlyToolcraftState; visibility?: ToolcraftRuntimeSceneVisibility }>;

export type ToolcraftArtifactScenePlan = Readonly<{
  outputFrame: ToolcraftExportFrame;
  productFrame: ToolcraftProductSceneFrame;
}>;

export function resolveToolcraftArtifactProductFrame(
  state: ReadonlyToolcraftState,
  request: ToolcraftArtifactSceneFrameBaseRequest,
): ToolcraftProductSceneFrame {
  if (!request.productSceneRequired) {
    return { kind: "empty", rect: null };
  }

  const canvas = getToolcraftCanvasFrame(state.canvas);
  const productFrame = resolveToolcraftProductSceneFrame({
    boundsProvider: request.boundsProvider,
    fallbackRect:
      !request.boundsProvider && canvas.kind === "finite"
        ? getToolcraftFiniteArtboardRect(canvas.size)
        : undefined,
    state,
  });

  if (productFrame.kind === "unavailable") {
    throw new ToolcraftSceneExportError({
      code: "scene-bounds-unavailable",
      message: request.boundsProvider
        ? "Product scene bounds are unavailable or invalid."
        : "This infinite product scene does not provide export bounds.",
      ok: false,
    });
  }

  return productFrame;
}

export function resolveToolcraftStillArtifactFrame(
  request: ToolcraftStillArtifactSceneFrameRequest,
): ToolcraftArtifactScenePlan {
  const productFrame = resolveToolcraftArtifactProductFrame(request.state, request);
  return {
    outputFrame: resolveToolcraftStillExportFrame(
      request.state,
      productFrame.kind === "ready" ? [productFrame.rect] : [],
      request.visibility,
    ),
    productFrame,
  };
}
