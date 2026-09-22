import type {
  ResolvedToolcraftAppSchema,
  ToolcraftArtifactExportActionRole,
} from "@/toolcraft/runtime";
import { getToolcraftArtifactExportActions } from "@/toolcraft/runtime";

function schemaHasExportPanelAction(
  schema: ResolvedToolcraftAppSchema,
  role: ToolcraftArtifactExportActionRole,
): boolean {
  return getToolcraftArtifactExportActions(schema).some(
    (action) => action.role === role,
  );
}

export function schemaHasPngExportPanelAction(schema: ResolvedToolcraftAppSchema): boolean {
  return schemaHasExportPanelAction(schema, "export-image");
}

export function schemaHasSvgExportPanelAction(schema: ResolvedToolcraftAppSchema): boolean {
  return schemaHasExportPanelAction(schema, "export-svg");
}

export function schemaHasVideoExportPanelAction(schema: ResolvedToolcraftAppSchema): boolean {
  return schemaHasExportPanelAction(schema, "export-video");
}
