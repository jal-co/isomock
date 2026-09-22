import { artifactAction as image } from "../modules/built-ins/image-export/core/export-action";
import { artifactAction as svg } from "../modules/built-ins/svg-export/core/export-action";
import { artifactAction as video } from "../modules/built-ins/video-export/core/export-action";
import type { ToolcraftPanelActionModuleContribution } from "../modules/contract/contribution";
import type { ToolcraftExportActionRequest } from "../export/export-action-request";

export type ToolcraftArtifactActionCatalog = {
  readonly [Declaration in ToolcraftPanelActionModuleContribution as Declaration["role"]]: Readonly<{
    moduleId: Declaration["moduleId"];
    role: Declaration["role"];
    run: (request: ToolcraftExportActionRequest) => PromiseLike<unknown>;
  }>;
};

export const toolcraftArtifactActions = Object.freeze({
  [image.role]: image, [svg.role]: svg, [video.role]: video,
} satisfies ToolcraftArtifactActionCatalog);
