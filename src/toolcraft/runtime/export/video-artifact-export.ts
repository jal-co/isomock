import { getToolcraftRuntimeBackgroundColor } from "../state/canvas-background-state";
import {
  downloadToolcraftArtifact,
  type ToolcraftArtifactDownloadRequest,
  type ToolcraftArtifactDownloadResult,
} from "./artifact-download";
import type { ToolcraftArtifactExportRequest } from "./artifact-export-request";
import { resolveToolcraftVideoExportSettings } from "./artifact-export-settings";
import { renderToolcraftArtifactFrame } from "./artifact-frame-renderer";
import { resolveToolcraftArtifactProductFrame } from "./artifact-scene-frame";
import { createToolcraftArtifactFrameState } from "./artifact-frame-state";
import { yieldToolcraftArtifactExport } from "./artifact-export-yield";
import {
  resolveToolcraftExportFrame,
  ToolcraftSceneExportError,
  validateToolcraftArtifactSize,
} from "./export-frame";
import {
  normalizeToolcraftExportError,
  ToolcraftArtifactExportError,
} from "./export-error";
import { getToolcraftVideoExportSize } from "./export-sizing";
import {
  createToolcraftVideoEncoderBackend,
  type ToolcraftVideoEncoderBackend,
  type ToolcraftVideoEncoderBackendFactory,
} from "./video-encoding-backend";
import { TOOLCRAFT_MAX_VIDEO_ARTIFACT_BYTES } from "./video-encoding-policy";
import { createToolcraftVideoFrameSchedule } from "./video-frame-schedule";

export type ToolcraftVideoArtifactExportResult = Readonly<{
  byteLength: number;
  durationSeconds: number;
  extension: ".mp4" | ".webm";
  frameCount: number;
  height: number;
  mediaType: "video/mp4" | "video/webm";
  width: number;
}>;

export type ToolcraftVideoArtifactExportRequest = ToolcraftArtifactExportRequest &
  Readonly<{
    backendFactory?: ToolcraftVideoEncoderBackendFactory;
    canvasFactory?: () => HTMLCanvasElement;
    downloadArtifact?: (
      request: ToolcraftArtifactDownloadRequest,
    ) => ToolcraftArtifactDownloadResult;
    yieldToBrowser?: () => Promise<void>;
  }>;

export async function exportToolcraftVideoArtifact(
  request: ToolcraftVideoArtifactExportRequest,
): Promise<ToolcraftVideoArtifactExportResult> {
  request.signal.throwIfAborted();
  const settings = resolveToolcraftVideoExportSettings(request.state);
  const durationSeconds = request.state.timeline.durationSeconds;
  const schedule = createToolcraftVideoFrameSchedule(durationSeconds);
  const outputFrame = resolveToolcraftExportFrame(request.state);
  const size = getToolcraftVideoExportSize({
    frame: outputFrame,
    resolution: settings.resolution,
    state: request.state,
  });
  const sizeValidation = validateToolcraftArtifactSize(size);
  if (!sizeValidation.ok) {
    throw new ToolcraftSceneExportError(sizeValidation);
  }

  // Let the UI paint/cancel before allocating the encoder and export backing.
  await (request.yieldToBrowser ?? yieldToolcraftArtifactExport)();
  request.signal.throwIfAborted();

  const canvas = (request.canvasFactory ?? (() => document.createElement("canvas")))();
  let backend: ToolcraftVideoEncoderBackend | null = null;
  let finalized = false;

  try {
    canvas.width = size.width;
    canvas.height = size.height;
    backend = await (request.backendFactory ??
      createToolcraftVideoEncoderBackend)({
      canvas,
      durationSeconds,
      height: size.height,
      requestedFormat: settings.format,
      signal: request.signal,
      width: size.width,
    });
    for (const entry of schedule) {
      request.signal.throwIfAborted();
      const state = createToolcraftArtifactFrameState(request.state, entry.timeSeconds);
      const productFrame = resolveToolcraftArtifactProductFrame(state, {
        boundsProvider: request.boundsProvider,
        productSceneRequired: request.exportRenderer !== undefined,
      });
      await renderToolcraftArtifactFrame({
        backgroundColor:
          getToolcraftRuntimeBackgroundColor(state) ?? "#000000",
        canvas,
        includeBackground: true,
        outputFrame,
        pixelRatio: size.pixelRatio,
        productFrame,
        renderProductFrame: request.exportRenderer?.renderFrame ?? null,
        renderRuntimeScene: request.renderRuntimeScene,
        rendererPipeline: request.rendererPipeline,
        signal: request.signal,
        state,
      });
      request.signal.throwIfAborted();
      await backend.addFrame(
        entry.timeSeconds,
        entry.durationSeconds,
        entry.index === 0 || entry.index % 60 === 0,
      );
      request.signal.throwIfAborted();
      request.reportProgress(
        ((entry.index + 1) / schedule.length) * 0.95,
      );
      await (request.yieldToBrowser ?? yieldToolcraftArtifactExport)();
      request.signal.throwIfAborted();
    }

    request.reportProgress(0.98);
    request.signal.throwIfAborted();
    const blob = await backend.finalize();
    finalized = true;
    request.signal.throwIfAborted();
    if (blob.size > TOOLCRAFT_MAX_VIDEO_ARTIFACT_BYTES) {
      throw new ToolcraftArtifactExportError({
        code: "video-artifact-too-large",
        message: "The encoded video exceeds Toolcraft's artifact limit.",
      });
    }
    (request.downloadArtifact ?? downloadToolcraftArtifact)({
      blob,
      extension: backend.extension,
      rawBaseFileName: request.exportRenderer?.baseFileName ?? "toolcraft-export",
    });
    request.reportProgress(1);

    return {
      byteLength: blob.size,
      durationSeconds,
      extension: backend.extension,
      frameCount: schedule.length,
      height: size.height,
      mediaType: backend.mediaType,
      width: size.width,
    };
  } catch (error) {
    if (!finalized && backend) {
      try {
        await backend.cancel();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Video export and cleanup failed.", { cause: error });
      }
    }
    if (request.signal.aborted && error === request.signal.reason) throw error;
    throw normalizeToolcraftExportError(error, {
      code: "video-encode-failed",
      message: "Toolcraft could not encode the video export.",
    });
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}
