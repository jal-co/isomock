import type { ToolcraftActionSchema } from "../schema/types";
import type { ToolcraftStillExportFormat } from "./artifact-export-settings";

/** Typed backend actions remain in the schema for capability-specific proof. */
export function getToolcraftVisibleExportActions(
  actions: readonly ToolcraftActionSchema[],
): readonly ToolcraftActionSchema[] {
  return actions.some(({ role }) => role === "export-image")
    ? actions.filter(({ role }) => role !== "export-svg")
    : actions;
}

export function resolveToolcraftStillExportAction(
  action: ToolcraftActionSchema,
  actions: readonly ToolcraftActionSchema[],
  format: ToolcraftStillExportFormat | null,
): ToolcraftActionSchema {
  if (action.role !== "export-image" || format !== "svg") return action;
  const svgAction = actions.find(({ role }) => role === "export-svg");
  if (!svgAction) throw new Error("SVG export requires the svg-export capability.");
  return svgAction;
}
