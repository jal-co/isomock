import type { ToolcraftRendererPipelineClient } from "../rendering";
import type {
  ToolcraftProductSceneBoundsProvider,
  ToolcraftRuntimeSceneVisibility,
} from "../scene";
import {
  getToolcraftRuntimeBackgroundColor,
  isToolcraftRuntimeBackgroundEnabled,
} from "../state/canvas-background-state";
import type { ReadonlyToolcraftState } from "../state/readonly-state";
import {
  downloadToolcraftArtifact,
  type ToolcraftArtifactDownloadRequest,
  type ToolcraftArtifactDownloadResult,
} from "./artifact-download";
import {
  createToolcraftArtifactFrameState,
  getToolcraftArtifactTimelineProgress,
} from "./artifact-frame-state";
import { resolveToolcraftStillArtifactContentFrame } from "./still-artifact-content-frame";
import {
  ToolcraftSceneExportError,
  validateToolcraftArtifactSize,
} from "./export-frame";
import { normalizeToolcraftExportError } from "./export-error";
import type { ToolcraftProductSvgExportRenderer } from "./product-svg-export-renderer";
import {
  createToolcraftSvgDocument,
  createToolcraftSvgProductContainer,
  serializeToolcraftSvgDocument,
} from "./svg-document";

export type ToolcraftSvgArtifactExportResult = Readonly<{
  byteLength: number;
  extension: ".svg";
  height: number;
  mediaType: "image/svg+xml";
  vectorElementCount: number;
  width: number;
}>;

export type ToolcraftSvgArtifactExportRequest = Readonly<{
  boundsProvider: ToolcraftProductSceneBoundsProvider | undefined;
  downloadArtifact?: (
    request: ToolcraftArtifactDownloadRequest,
  ) => ToolcraftArtifactDownloadResult;
  rendererPipeline: ToolcraftRendererPipelineClient | null;
  reportProgress: (progress: number) => void;
  signal: AbortSignal;
  state: ReadonlyToolcraftState;
  svgExportRenderer: ToolcraftProductSvgExportRenderer;
  visibility: ToolcraftRuntimeSceneVisibility;
}>;

export async function exportToolcraftSvgArtifact(
  request: ToolcraftSvgArtifactExportRequest,
): Promise<ToolcraftSvgArtifactExportResult> {
  request.signal.throwIfAborted();
  const frameState = createToolcraftArtifactFrameState(
    request.state,
    request.state.timeline.currentTimeSeconds,
  );
  const scenePlan = await resolveToolcraftStillArtifactContentFrame({
    boundsProvider: request.boundsProvider,
    getContentBounds: request.svgExportRenderer?.getContentBounds,
    rendererPipeline: request.rendererPipeline,
    signal: request.signal,
    visibility: request.visibility,
    productSceneRequired: request.svgExportRenderer !== undefined,
    state: frameState,
  });
  const sizeValidation = validateToolcraftArtifactSize(scenePlan.outputFrame);
  if (!sizeValidation.ok) {
    throw new ToolcraftSceneExportError(sizeValidation);
  }

  const { document: svgDocument } = createToolcraftSvgDocument(
    scenePlan.outputFrame,
  );
  const { container } = createToolcraftSvgProductContainer();
  request.reportProgress(0.1);
  request.signal.throwIfAborted();
  try {
    if (scenePlan.productFrame.kind === "ready") {
      await request.svgExportRenderer.renderFrame({
        container,
        frame: scenePlan.productFrame.rect,
        rendererPipeline: request.rendererPipeline,
        signal: request.signal,
        state: frameState,
        timeSeconds: frameState.timeline.currentTimeSeconds,
        timelineProgress: getToolcraftArtifactTimelineProgress(frameState),
      });
    }
  } catch (error) {
    if (request.signal.aborted && error === request.signal.reason) throw error;
    throw normalizeToolcraftExportError(error, {
      code: "svg-render-failed",
      message: "Toolcraft could not render product vectors for SVG export.",
    });
  }
  request.signal.throwIfAborted();
  request.reportProgress(0.65);

  const serialized = serializeToolcraftSvgDocument({
    backgroundColor: isToolcraftRuntimeBackgroundEnabled(frameState)
      ? (getToolcraftRuntimeBackgroundColor(frameState) ?? "#000000")
      : null,
    container,
    document: svgDocument,
    frame: scenePlan.outputFrame,
  });
  const blob = new Blob([serialized.source], {
    type: "image/svg+xml;charset=utf-8",
  });
  request.reportProgress(0.9);
  request.signal.throwIfAborted();
  (request.downloadArtifact ?? downloadToolcraftArtifact)({
    blob,
    extension: ".svg",
    rawBaseFileName: request.svgExportRenderer.baseFileName,
  });
  request.reportProgress(1);

  return Object.freeze({
    byteLength: blob.size,
    extension: ".svg",
    height: scenePlan.outputFrame.height,
    mediaType: "image/svg+xml",
    vectorElementCount: serialized.vectorElementCount,
    width: scenePlan.outputFrame.width,
  });
}
