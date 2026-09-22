import { createToolcraftArtifactSnapshot } from "../../../export/artifact-export-snapshot";
import { createToolcraftArtifactExportResources } from "../../../export/artifact-export-resources";
import type { ToolcraftArtifactJobContext } from "../../../export/artifact-export-owner";
import type { ToolcraftSourceAssetCoordinator } from "../../../source-assets/source-asset-coordinator";
import type { ToolcraftState } from "../../../state/types";
import type { ToolcraftModelRenderHost } from "../../model-rendering/model-render-binding";
import type { createToolcraftPipelineExportLifetime } from "../../app-shell/toolcraft-pipeline-export-lifetime";
import { renderToolcraftRuntimeSceneToCanvas } from "../../canvas/runtime-scene-export";
import { runToolcraftExportAction, type ToolcraftExportActionRequest } from "./export-action-runner";

type ExportSessionRequest = ToolcraftArtifactJobContext & Pick<
  ToolcraftExportActionRequest, "action" | "rendererPipeline" | "sceneExport"
> & Readonly<{
  cancel: () => void;
  coordinator: ToolcraftSourceAssetCoordinator;
  host: ToolcraftModelRenderHost | null;
  pipelineLifetime: ReturnType<typeof createToolcraftPipelineExportLifetime> | null;
  retainSourceOwner: () => () => void;
  state: ToolcraftState;
}>;

/** Acquires existing owners synchronously; the slot is held through every cleanup settlement. */
export async function runToolcraftExportSession(request: ExportSessionRequest): Promise<unknown> {
  const state = createToolcraftArtifactSnapshot(request.state);
  const releases: Array<() => void> = [];
  let resources: ReturnType<typeof createToolcraftArtifactExportResources> | undefined;
  let failure: { error: unknown } | undefined;
  try {
    releases.push(request.retainSourceOwner());
    if (request.pipelineLifetime) releases.push(request.pipelineLifetime.retain(request.cancel));
    if (request.host) releases.push(request.host.retain());
    resources = createToolcraftArtifactExportResources({
      state,
      signal: request.signal,
      resolveResource: request.coordinator.resolveResource,
      retainResourceRef: request.coordinator.retainResourceRef,
    });
    const loadImage = resources.loadImage;
    return await runToolcraftExportAction({
      action: request.action,
      renderRuntimeScene: (canvas, frame, frameState) => renderToolcraftRuntimeSceneToCanvas({
        canvas,
        host: request.host,
        outputFrame: frame,
        loadImage,
        signal: request.signal,
        state: frameState,
        visibility: request.sceneExport.visibility,
      }),
      rendererPipeline: request.rendererPipeline,
      reportProgress: request.reportProgress,
      sceneExport: request.sceneExport,
      signal: request.signal,
      state,
    });
  } catch (error) {
    failure = { error };
    throw error;
  } finally {
    const cleanupErrors: unknown[] = [];
    try { await resources?.dispose(); } catch (error) { cleanupErrors.push(error); }
    for (const release of releases.reverse()) {
      try { release(); } catch (error) { cleanupErrors.push(error); }
    }
    if (cleanupErrors.length) {
      throw new AggregateError(
        [...(failure ? [failure.error] : []), ...cleanupErrors],
        "Toolcraft export resource cleanup failed.",
        failure ? { cause: failure.error } : undefined,
      );
    }
  }
}
