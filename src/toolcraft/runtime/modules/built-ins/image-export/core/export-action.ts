import { exportToolcraftImageArtifact } from "../../../../export/image-artifact-export";
import { createSharedArtifactRequest } from "../../../../export/shared-artifact-request";
import type { ToolcraftExportActionRequest } from "../../../../export/export-action-request";

export const artifactAction = Object.freeze({
  moduleId: "image-export" as const,
  role: "export-image" as const,
  run: (request: ToolcraftExportActionRequest) => exportToolcraftImageArtifact(createSharedArtifactRequest(request)),
});
