import { validateContribution } from "./declaration";
import { TOOLCRAFT_ARTIFACT_SETTINGS_SECTION_IDS } from "../../contract/contribution";
import { createBuiltInToolcraftProductModuleDefinition } from "../../contract/module-definition";
import { TOOLCRAFT_ARTIFACT_SETTINGS_PERFORMANCE_ROLES } from "../../contract/contribution";

const imageExportModuleDefinition =
  createBuiltInToolcraftProductModuleDefinition({
    contributions: [
      {
        id: "image-export.settings",
        kind: "control-section",
        moduleId: "image-export",
        placement: {
          after: [],
          before: ["video-export.settings"],
          slot: "artifact-settings",
        },
        runtimeSectionId: TOOLCRAFT_ARTIFACT_SETTINGS_SECTION_IDS.image,
        section: {
          controls: {
            imageFormat: {
              applicability: { mode: "always" as const },
              defaultValue: "png",
              label: "Format",
              options: [
                { label: "PNG", value: "png" },
                { label: "JPG", value: "jpg" },
              ],
              performanceRole:
                TOOLCRAFT_ARTIFACT_SETTINGS_PERFORMANCE_ROLES[
                  "image-export.settings"
                ].imageFormat,
              target: "export.image.format",
              type: "select",
            },
            imageResolution: {
              applicability: { mode: "always" as const },
              defaultValue: "4k",
              label: "Resolution",
              options: [
                { label: "2K", value: "2k" },
                { label: "4K", value: "4k" },
                { label: "8K", value: "8k" },
              ],
              performanceRole:
                TOOLCRAFT_ARTIFACT_SETTINGS_PERFORMANCE_ROLES[
                  "image-export.settings"
                ].imageResolution,
              target: "export.image.resolution",
              type: "select",
            },
          },
          layoutGroups: [
            {
              columns: 2,
              controls: ["imageFormat", "imageResolution"],
              layout: "inline",
            },
          ],
          title: "Image Export",
        },
      },
      {
        id: "image-export.action",
        kind: "panel-action",
        moduleId: "image-export",
        role: "export-image",
      },
    ],
    defaultProviders: [],
    id: "image-export",
    portRequirements: [
      {
        applicability: "product-scene",
        id: "scene.rasterFrameRenderer",
      },
    ],
    provides: ["artifact.image-export"],
    requires: [],
  }, validateContribution);

export function imageExportModule() {
  return imageExportModuleDefinition;
}
