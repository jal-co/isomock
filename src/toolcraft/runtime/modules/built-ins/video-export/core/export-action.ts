import { exportToolcraftVideoArtifact } from "../../../../export/video-artifact-export";
import { createSharedArtifactRequest } from "../../../../export/shared-artifact-request";
import type { ToolcraftExportActionRequest } from "../../../../export/export-action-request";

export const artifactAction = Object.freeze({
  moduleId: "video-export" as const,
  role: "export-video" as const,
  run: (request: ToolcraftExportActionRequest) => exportToolcraftVideoArtifact(createSharedArtifactRequest(request)),
});
