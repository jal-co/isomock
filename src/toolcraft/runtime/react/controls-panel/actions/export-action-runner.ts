import { toolcraftArtifactActions } from "../../../composition/artifact-action-catalog";
import { isToolcraftArtifactExportActionRole } from "../../../schema/artifact-export-actions";
import type { ToolcraftExportActionRequest } from "../../../export/export-action-request";
export type { ToolcraftControlsSceneExport, ToolcraftExportActionRequest } from "../../../export/export-action-request";

export function runToolcraftExportAction(request: ToolcraftExportActionRequest): PromiseLike<unknown> | null {
  const role = request.action.role;
  return isToolcraftArtifactExportActionRole(role) ? toolcraftArtifactActions[role].run(request) : null;
}
