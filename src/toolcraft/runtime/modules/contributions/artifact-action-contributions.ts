import { createToolcraftArtifactExportActions } from "../../schema/artifact-export-actions";
import { registerToolcraftInternalControlSection } from "../../schema/controls-panel-section-id";
import type { ToolcraftControlSectionSchema } from "../../schema/types";
import type { ToolcraftPanelActionModuleContribution } from "../contract/contribution";

export const TOOLCRAFT_ARTIFACT_ACTION_SECTION_ID = "runtime.export";
export const TOOLCRAFT_ARTIFACT_ACTION_TARGET = "actions.output";

export function resolveToolcraftArtifactActionContributions(
  actionContributions: readonly ToolcraftPanelActionModuleContribution[],
): ToolcraftControlSectionSchema | undefined {
  if (actionContributions.length === 0) {
    return undefined;
  }

  const actions = createToolcraftArtifactExportActions(
    actionContributions.map(({ role }) => role),
  );
  const outputActions = Object.freeze({
    applicability: { mode: "always" as const },
    actions,
    target: TOOLCRAFT_ARTIFACT_ACTION_TARGET,
    type: "panelActions",
  });
  const section = Object.freeze({
    actionGroup: "secondary",
    controls: Object.freeze({ outputActions }),
    id: TOOLCRAFT_ARTIFACT_ACTION_SECTION_ID,
    title: "Export",
  }) satisfies ToolcraftControlSectionSchema;

  return registerToolcraftInternalControlSection(section);
}
