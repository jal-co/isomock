import type {
  ToolcraftControlSectionModuleContribution,
  ToolcraftPanelActionModuleContribution,
} from "../contract/contribution";
import { snapshotToolcraftModuleData } from "../contract/module-data";

/** Compose the shared still-image settings without coupling the two renderers. */
export function composeToolcraftStillExportSettings(
  settings: readonly ToolcraftControlSectionModuleContribution[],
  actions: readonly ToolcraftPanelActionModuleContribution[],
): readonly ToolcraftControlSectionModuleContribution[] {
  if (!actions.some(({ role }) => role === "export-svg")) return settings;
  return Object.freeze(settings.map((contribution) => {
    if (contribution.id !== "image-export.settings") return contribution;
    const { imageFormat, imageResolution } = contribution.section.controls;
    return snapshotToolcraftModuleData<ToolcraftControlSectionModuleContribution>({
      ...contribution,
      section: {
        ...contribution.section,
        layoutGroups: contribution.section.layoutGroups.map((group) => ({
          ...group,
          preserveColumns: true,
        })),
        controls: {
          imageFormat: {
            ...imageFormat,
            options: [...imageFormat.options, { label: "SVG", value: "svg" }],
          },
          imageResolution: {
            ...imageResolution,
            applicability: {
              mode: "conditional",
              all: [{ target: imageFormat.target, oneOf: ["png", "jpg"] }],
            },
          },
        },
      },
    });
  }));
}
