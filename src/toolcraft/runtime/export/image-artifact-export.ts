import {
  getToolcraftRuntimeBackgroundColor,
  isToolcraftRuntimeBackgroundEnabled,
} from "../state/canvas-background-state";
import {
  downloadToolcraftArtifact,
  type ToolcraftArtifactDownloadRequest,
  type ToolcraftArtifactDownloadResult,
  type ToolcraftArtifactFileExtension,
} from "./artifact-download";
import type { ToolcraftArtifactExportRequest } from "./artifact-export-request";
import { resolveToolcraftImageExportSettings } from "./artifact-export-settings";
import { renderToolcraftArtifactFrame } from "./artifact-frame-renderer";
import { resolveToolcraftStillArtifactContentFrame } from "./still-artifact-content-frame";
import { createToolcraftArtifactFrameState } from "./artifact-frame-state";
import {
  ToolcraftSceneExportError,
  validateToolcraftArtifactSize,
} from "./export-frame";
import { ToolcraftArtifactExportError } from "./export-error";
import { getToolcraftImageExportSize } from "./export-sizing";

export type ToolcraftImageArtifactExportResult = Readonly<{
  byteLength: number;
  extension: ".jpg" | ".png";
  height: number;
  mediaType: "image/jpeg" | "image/png";
  width: number;
}>;

export type ToolcraftImageArtifactExportRequest = ToolcraftArtifactExportRequest &
  Readonly<{
    canvasFactory?: () => HTMLCanvasElement;
    downloadArtifact?: (
      request: ToolcraftArtifactDownloadRequest,
    ) => ToolcraftArtifactDownloadResult;
  }>;

function encodeCanvas(
  canvas: HTMLCanvasElement,
  mediaType: "image/jpeg" | "image/png",
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(
              new ToolcraftArtifactExportError({
                code: "image-encode-failed",
                message: "Toolcraft could not encode the image export.",
              }),
            );
          }
        },
        mediaType,
        mediaType === "image/jpeg" ? 0.95 : undefined,
      );
    } catch (error) {
      reject(
        new ToolcraftArtifactExportError(
          {
            code: "image-encode-failed",
            message: "Toolcraft could not encode the image export.",
          },
          { cause: error },
        ),
      );
    }
  });
}

export async function exportToolcraftImageArtifact(
  request: ToolcraftImageArtifactExportRequest,
): Promise<ToolcraftImageArtifactExportResult> {
  request.signal.throwIfAborted();
  const settings = resolveToolcraftImageExportSettings(request.state);
  const frameState = createToolcraftArtifactFrameState(
    request.state,
    request.state.timeline.currentTimeSeconds,
  );
  const scenePlan = await resolveToolcraftStillArtifactContentFrame({
    boundsProvider: request.boundsProvider,
    getContentBounds: request.exportRenderer?.getContentBounds,
    rendererPipeline: request.rendererPipeline,
    signal: request.signal,
    visibility: request.visibility,
    productSceneRequired: request.exportRenderer !== undefined,
    state: frameState,
  });
  const size = getToolcraftImageExportSize({
    frame: scenePlan.outputFrame,
    resolution: settings.resolution,
    state: frameState,
  });
  const sizeValidation = validateToolcraftArtifactSize(size);
  if (!sizeValidation.ok) {
    throw new ToolcraftSceneExportError(sizeValidation);
  }

  const canvas = (request.canvasFactory ?? (() => document.createElement("canvas")))();
  const mediaType = settings.format === "jpg" ? "image/jpeg" : "image/png";
  const extension: ToolcraftArtifactFileExtension =
    settings.format === "jpg" ? ".jpg" : ".png";
  const includeBackground =
    mediaType === "image/jpeg" || isToolcraftRuntimeBackgroundEnabled(frameState);
  try {
    canvas.width = size.width;
    canvas.height = size.height;
    request.reportProgress(0.1);

    await renderToolcraftArtifactFrame({
      backgroundColor:
        getToolcraftRuntimeBackgroundColor(frameState) ?? "#000000",
      canvas,
      includeBackground,
      outputFrame: scenePlan.outputFrame,
      pixelRatio: size.pixelRatio,
      productFrame: scenePlan.productFrame,
      renderProductFrame: request.exportRenderer?.renderFrame ?? null,
      renderRuntimeScene: request.renderRuntimeScene,
      rendererPipeline: request.rendererPipeline,
      signal: request.signal,
      state: frameState,
    });
    request.reportProgress(0.75);
    request.signal.throwIfAborted();

    const blob = await encodeCanvas(canvas, mediaType);
    request.signal.throwIfAborted();
    request.reportProgress(0.9);
    request.signal.throwIfAborted();
    (request.downloadArtifact ?? downloadToolcraftArtifact)({
      blob,
      extension,
      rawBaseFileName:
        request.exportRenderer?.baseFileName ?? "toolcraft-export",
    });
    request.reportProgress(1);

    return {
      byteLength: blob.size,
      extension,
      height: size.height,
      mediaType,
      width: size.width,
    };
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}
