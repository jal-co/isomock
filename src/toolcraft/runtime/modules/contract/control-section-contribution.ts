import { snapshotToolcraftModuleData } from "./module-data";
import type { ToolcraftControlSchema, ToolcraftControlLayoutGroupSchema, ToolcraftControlSectionSchema } from "../../schema/types";

export type ToolcraftSettingsContribution = Readonly<{
  id: string;
  kind: "control-section";
  moduleId: string;
  placement: Readonly<{ after: readonly string[]; before: readonly string[]; slot: "artifact-settings" | "product-settings"; }>;
  runtimeSectionId: `runtime.${string}`;
  section: Readonly<{
    layout?: ToolcraftControlSectionSchema["layout"];
    controls: Readonly<Record<string, Readonly<ToolcraftControlSchema>>>;
    layoutGroups: readonly Readonly<ToolcraftControlLayoutGroupSchema>[];
    title: string;
  }>;
}>;

export function normalizeToolcraftSettingsContribution<Contribution extends ToolcraftSettingsContribution>(contribution: Contribution): Contribution {
  const { id, kind, moduleId, runtimeSectionId, placement, section } = snapshotToolcraftModuleData(contribution);
  const controls = Object.values(section.controls);
  if (controls.length === 0 || controls.some(control => typeof control.target !== "string" || !control.target || !control.type)) {
    throw new Error(`Invalid settings contribution "${id}": controls need types and targets.`);
  }
  if (new Set(controls.map(control => control.target)).size !== controls.length) throw new Error(`Duplicate control target in "${id}".`);
  for (const group of section.layoutGroups) {
    if (group.controls.some(control => !Object.hasOwn(section.controls, control))) throw new Error(`Unknown layout control in "${id}".`);
  }
  return snapshotToolcraftModuleData({
    id, kind, moduleId, runtimeSectionId,
    placement: { after: placement.after, before: placement.before, slot: placement.slot },
    section: { ...(section.layout ? { layout: section.layout } : {}), controls: section.controls, layoutGroups: section.layoutGroups, title: section.title },
  }) as Contribution;
}
