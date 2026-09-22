import type { ReadonlyToolcraftState } from "../../state/readonly-state";
import type { ToolcraftExportFrame } from "../../export/export-frame";
import type { ToolcraftRuntimeSceneVisibility } from "../../scene";
import type { ToolcraftImageAsset } from "../../state/types";
import type { ToolcraftModelRenderHost } from "../model-rendering/model-render-binding";
import { renderToolcraftModelsInWorldContext } from "../model-rendering/model-export-world-context";
import { getVisibleCanvasImageAssets } from "./canvas-default-media-layer";
import { normalizeCanvasMediaRotation } from "./canvas-media-transform";

export type ToolcraftRuntimeSceneExportResult = Readonly<{
  imageCount: number;
  modelCount: number;
}>;

export type ToolcraftCanvasImageLoader = (
  asset: ToolcraftImageAsset,
) => Promise<CanvasImageSource>;

function drawImageAsset(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  asset: ToolcraftImageAsset,
): void {
  const rotation = normalizeCanvasMediaRotation(asset.transform?.rotationDeg);
  const sourceAspect = asset.sourceSize.width / asset.sourceSize.height;
  const sceneAspect = asset.size.width / asset.size.height;
  const sourceWidth = sourceAspect > sceneAspect
    ? asset.sourceSize.height * sceneAspect
    : asset.sourceSize.width;
  const sourceHeight = sourceAspect > sceneAspect
    ? asset.sourceSize.height
    : asset.sourceSize.width / sceneAspect;
  const sourceX = (asset.sourceSize.width - sourceWidth) / 2;
  const sourceY = (asset.sourceSize.height - sourceHeight) / 2;

  context.save();
  context.translate(asset.position.x, asset.position.y);
  context.rotate((rotation * Math.PI) / 180);
  context.scale(
    asset.transform?.flipHorizontal ? -1 : 1,
    asset.transform?.flipVertical ? -1 : 1,
  );
  context.drawImage(
    source,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    -asset.size.width / 2,
    -asset.size.height / 2,
    asset.size.width,
    asset.size.height,
  );
  context.restore();
}

export async function renderToolcraftRuntimeSceneToCanvas({
  canvas,
  host,
  loadImage,
  signal,
  state,
  visibility,
  outputFrame,
}: Readonly<{
  canvas: HTMLCanvasElement;
  host: ToolcraftModelRenderHost | null;
  loadImage: ToolcraftCanvasImageLoader;
  signal: AbortSignal;
  state: ReadonlyToolcraftState;
  visibility: ToolcraftRuntimeSceneVisibility;
  outputFrame: ToolcraftExportFrame;
}>): Promise<ToolcraftRuntimeSceneExportResult> {
  signal.throwIfAborted();
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Toolcraft scene export requires a 2D target canvas.");
  }

  const modelCount = host
    ? await renderToolcraftModelsInWorldContext({
        canvas,
        context,
        exportFrame: outputFrame,
        host,
        signal,
        state,
        suppressedTargets: visibility.suppressedModelTargets,
      })
    : 0;
  signal.throwIfAborted();
  const images = visibility.renderDefaultImages
    ? getVisibleCanvasImageAssets(state)
    : [];
  for (const asset of images) {
    signal.throwIfAborted();
    const source = await loadImage(asset);
    signal.throwIfAborted();
    drawImageAsset(context, source, asset);
  }

  return { imageCount: images.length, modelCount };
}
