import { validateContribution } from "./declaration";
import { TOOLCRAFT_ARTIFACT_SETTINGS_SECTION_IDS } from "../../contract/contribution";
import { createBuiltInToolcraftProductModuleDefinition } from "../../contract/module-definition";
import { TOOLCRAFT_ARTIFACT_SETTINGS_PERFORMANCE_ROLES } from "../../contract/contribution";

const videoExportModuleDefinition =
  createBuiltInToolcraftProductModuleDefinition({
    contributions: [
      {
        id: "video-export.settings",
        kind: "control-section",
        moduleId: "video-export",
        placement: {
          after: [],
          before: [],
          slot: "artifact-settings",
        },
        runtimeSectionId: TOOLCRAFT_ARTIFACT_SETTINGS_SECTION_IDS.video,
        section: {
          controls: {
            videoFormat: {
              applicability: { mode: "always" as const },
              defaultValue: "mp4",
              label: "Format",
              options: [
                { label: "MP4", value: "mp4" },
                { label: "WebM", value: "webm" },
              ],
              performanceRole:
                TOOLCRAFT_ARTIFACT_SETTINGS_PERFORMANCE_ROLES[
                  "video-export.settings"
                ].videoFormat,
              target: "export.video.format",
              type: "select",
            },
            videoResolution: {
              applicability: { mode: "always" as const },
              defaultValue: "current",
              label: "Resolution",
              options: [
                { label: "Current", value: "current" },
                { label: "4K", value: "4k" },
              ],
              performanceRole:
                TOOLCRAFT_ARTIFACT_SETTINGS_PERFORMANCE_ROLES[
                  "video-export.settings"
                ].videoResolution,
              target: "export.video.resolution",
              type: "select",
            },
          },
          layoutGroups: [
            {
              columns: 2,
              controls: ["videoFormat", "videoResolution"],
              layout: "inline",
            },
          ],
          title: "Video Export",
        },
      },
      {
        id: "video-export.action",
        kind: "panel-action",
        moduleId: "video-export",
        role: "export-video",
      },
    ],
    defaultProviders: [
      {
        capabilityId: "timeline.playback",
        providerId: "timeline.playback-default",
      },
    ],
    id: "video-export",
    portRequirements: [
      {
        applicability: "product-scene",
        id: "scene.rasterFrameRenderer",
      },
    ],
    provides: ["artifact.video-export"],
    requires: ["timeline.playback"],
  }, validateContribution);

export function videoExportModule() {
  return videoExportModuleDefinition;
}
