import type { ToolcraftExportActionRequest } from "./export-action-request";
import type { ToolcraftArtifactExportRequest } from "./artifact-export-request";

export function createSharedArtifactRequest(
  request: ToolcraftExportActionRequest,
): ToolcraftArtifactExportRequest {
  return {
    boundsProvider: request.sceneExport.boundsProvider,
    exportRenderer: request.sceneExport.exportRenderer,
    renderRuntimeScene: request.renderRuntimeScene,
    rendererPipeline: request.rendererPipeline,
    reportProgress: request.reportProgress,
    signal: request.signal,
    state: request.state,
    visibility: request.sceneExport.visibility,
  };
}
