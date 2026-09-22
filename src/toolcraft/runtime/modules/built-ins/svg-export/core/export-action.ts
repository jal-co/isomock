import type { ToolcraftProductSvgExportRenderer } from "../../../../export/product-svg-export-renderer";
import { ToolcraftArtifactExportError } from "../../../../export/export-error";
import { exportToolcraftSvgArtifact, type ToolcraftSvgArtifactExportRequest } from "../../../../export/svg-artifact-export";
import type { ToolcraftExportActionRequest } from "../../../../export/export-action-request";

function requireSvgExportRenderer(
  renderer: ToolcraftProductSvgExportRenderer | undefined,
): ToolcraftProductSvgExportRenderer {
  if (!renderer) {
    throw new ToolcraftArtifactExportError({
      code: "svg-render-failed",
      message: "SVG export requires svgExportRenderer.",
    });
  }
  return renderer;
}

function createSvgArtifactRequest(
  request: ToolcraftExportActionRequest,
): ToolcraftSvgArtifactExportRequest {
  return {
    boundsProvider: request.sceneExport.boundsProvider,
    rendererPipeline: request.rendererPipeline,
    reportProgress: request.reportProgress,
    signal: request.signal,
    state: request.state,
    svgExportRenderer: requireSvgExportRenderer(
      request.sceneExport.svgExportRenderer,
    ),
    visibility: request.sceneExport.visibility,
  };
}

export const artifactAction = Object.freeze({
  moduleId: "svg-export" as const,
  role: "export-svg" as const,
  run: (request: ToolcraftExportActionRequest) => exportToolcraftSvgArtifact(createSvgArtifactRequest(request)),
});
