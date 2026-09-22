import type { ToolcraftArtifactExportActionRole } from "../../schema/artifact-export-actions";
import type { ToolcraftSettingsContribution } from "./control-section-contribution";
import type {
  ToolcraftControlApplicabilitySchema,
  ToolcraftControlLayoutGroupSchema,
  ToolcraftControlSchema,
  ToolcraftControlSectionSchema,
  ToolcraftFileDropAssetKind,
  ToolcraftTimelinePanelSchema,
} from "../../schema/types";

export type ToolcraftProductModuleContributionId =
  | "canvas-editing.behavior"
  | "image-export.action"
  | "image-export.settings"
  | "masks.settings"
  | "layers.persistence"
  | "layers.surface"
  | "media-source.persistence"
  | "media-source.policy"
  | "spatial-view.behavior"
  | "svg-export.action"
  | "timeline.persistence"
  | "timeline.surface"
  | "video-export.action"
  | "video-export.settings";

export type ToolcraftArtifactSettingsContributionId =
  | "image-export.settings"
  | "video-export.settings";

export const TOOLCRAFT_ARTIFACT_SETTINGS_SECTION_IDS = Object.freeze({
  image: "runtime.image-export",
  video: "runtime.video-export",
} as const);

export type ToolcraftModuleOwnershipKey =
  | "canvas-behavior:editing"
  | "canvas-behavior:spatial-view"
  | `control-section:${string}`
  | `control-target:${string}`
  | "media-policy:source-workflow"
  | `panel-action:${ToolcraftArtifactExportActionRole}`
  | "panel-surface:layers"
  | "panel-surface:timeline"
  | "persistence-slice:layers"
  | "persistence-slice:media"
  | "persistence-slice:timeline";

export type ToolcraftArtifactSettingsSelectOption = Readonly<
  NonNullable<ToolcraftControlSchema["options"]>[number]
>;

type ToolcraftArtifactSettingsPerformanceRole = NonNullable<
  ToolcraftControlSchema["performanceRole"]
>;

export const TOOLCRAFT_ARTIFACT_SETTINGS_PERFORMANCE_ROLES = Object.freeze({
  "image-export.settings": Object.freeze({
    imageFormat: "responsiveness",
    imageResolution: "workload",
  }),
  "video-export.settings": Object.freeze({
    videoFormat: "responsiveness",
    videoResolution: "responsiveness",
  }),
} as const);
type ToolcraftArtifactSettingsPerformanceRoleFor<
  ContributionId extends keyof typeof TOOLCRAFT_ARTIFACT_SETTINGS_PERFORMANCE_ROLES,
  ControlId extends keyof (typeof TOOLCRAFT_ARTIFACT_SETTINGS_PERFORMANCE_ROLES)[ContributionId],
> = (typeof TOOLCRAFT_ARTIFACT_SETTINGS_PERFORMANCE_ROLES)[ContributionId][ControlId];

export type ToolcraftArtifactSettingsSelectControl<
  PerformanceRole extends ToolcraftArtifactSettingsPerformanceRole =
    ToolcraftArtifactSettingsPerformanceRole,
> = Readonly<{
  applicability: ToolcraftControlApplicabilitySchema;
  defaultValue: string;
  label: Extract<NonNullable<ToolcraftControlSchema["label"]>, string>;
  options: readonly ToolcraftArtifactSettingsSelectOption[];
  performanceRole: PerformanceRole;
  target: ToolcraftControlSchema["target"];
  type: ToolcraftControlSchema["type"] & "select";
}>;

export type ToolcraftArtifactSettingsLayoutGroup = Readonly<{
  columns: NonNullable<ToolcraftControlLayoutGroupSchema["columns"]>;
  preserveColumns?: ToolcraftControlLayoutGroupSchema["preserveColumns"];
  controls: readonly string[];
  layout: ToolcraftControlLayoutGroupSchema["layout"];
}>;

type ToolcraftArtifactSettingsSectionFields<
  Controls extends Readonly<Record<string, ToolcraftArtifactSettingsSelectControl>>,
> = Readonly<{
  controls: Controls;
  layoutGroups: readonly ToolcraftArtifactSettingsLayoutGroup[];
  title: NonNullable<ToolcraftControlSectionSchema["title"]>;
}>;

export type ToolcraftImageExportSettingsSection = ToolcraftArtifactSettingsSectionFields<
  Readonly<{
    imageFormat: ToolcraftArtifactSettingsSelectControl<
      ToolcraftArtifactSettingsPerformanceRoleFor<"image-export.settings", "imageFormat">
    >;
    imageResolution: ToolcraftArtifactSettingsSelectControl<
      ToolcraftArtifactSettingsPerformanceRoleFor<"image-export.settings", "imageResolution">
    >;
  }>
>;

export type ToolcraftVideoExportSettingsSection = ToolcraftArtifactSettingsSectionFields<
  Readonly<{
    videoFormat: ToolcraftArtifactSettingsSelectControl<
      ToolcraftArtifactSettingsPerformanceRoleFor<"video-export.settings", "videoFormat">
    >;
    videoResolution: ToolcraftArtifactSettingsSelectControl<
      ToolcraftArtifactSettingsPerformanceRoleFor<"video-export.settings", "videoResolution">
    >;
  }>
>;

export type ToolcraftArtifactSettingsSection =
  | ToolcraftImageExportSettingsSection
  | ToolcraftVideoExportSettingsSection;

type ToolcraftArtifactSettingsContributionFields<Section extends ToolcraftArtifactSettingsSection> =
  Readonly<{
    kind: "control-section";
    placement: Readonly<{
      after: readonly ToolcraftArtifactSettingsContributionId[];
      before: readonly ToolcraftArtifactSettingsContributionId[];
      slot: "artifact-settings";
    }>;
    runtimeSectionId: `runtime.${string}`;
    section: Section;
  }>;

export type ToolcraftControlSectionModuleContribution =
  | Readonly<{
      id: "masks.settings";
      kind: "control-section";
      moduleId: "masks";
      placement: Readonly<{ after: readonly "masks.settings"[]; before: readonly "masks.settings"[]; slot: "product-settings" }>;
      runtimeSectionId: "runtime.masks";
      section: ToolcraftSettingsContribution["section"];
    }>
  | (ToolcraftArtifactSettingsContributionFields<ToolcraftImageExportSettingsSection> &
      Readonly<{
        id: "image-export.settings";
        moduleId: "image-export";
      }>)
  | (ToolcraftArtifactSettingsContributionFields<ToolcraftVideoExportSettingsSection> &
      Readonly<{
        id: "video-export.settings";
        moduleId: "video-export";
      }>);

export type ToolcraftPanelActionModuleContribution =
  | Readonly<{
      id: "image-export.action";
      kind: "panel-action";
      moduleId: "image-export";
      role: Extract<ToolcraftArtifactExportActionRole, "export-image">;
    }>
  | Readonly<{
      id: "svg-export.action";
      kind: "panel-action";
      moduleId: "svg-export";
      role: Extract<ToolcraftArtifactExportActionRole, "export-svg">;
    }>
  | Readonly<{
      id: "video-export.action";
      kind: "panel-action";
      moduleId: "video-export";
      role: Extract<ToolcraftArtifactExportActionRole, "export-video">;
    }>;

export const TOOLCRAFT_CANVAS_EDITING_OPERATIONS = Object.freeze([
  "drag",
  "handles",
  "resize",
  "selection",
] as const);

export const TOOLCRAFT_SPATIAL_VIEW_OPERATIONS = Object.freeze([
  "gizmo",
  "orbit",
  "paused-live-sync",
  "pose",
] as const);

export const TOOLCRAFT_MEDIA_SOURCE_KINDS = Object.freeze([
  "file",
  "image",
  "model",
] as const) satisfies readonly ToolcraftFileDropAssetKind[];

export type ToolcraftCanvasBehaviorModuleContribution =
  | Readonly<{
      behavior: "editing";
      id: "canvas-editing.behavior";
      kind: "canvas-behavior";
      moduleId: "canvas-editing";
      operations: typeof TOOLCRAFT_CANVAS_EDITING_OPERATIONS;
    }>
  | Readonly<{
      behavior: "spatial-view";
      id: "spatial-view.behavior";
      kind: "canvas-behavior";
      moduleId: "spatial-view";
      operations: typeof TOOLCRAFT_SPATIAL_VIEW_OPERATIONS;
    }>;

export type ToolcraftMediaPolicyModuleContribution = Readonly<{
  id: "media-source.policy";
  kind: "media-policy";
  moduleId: "media-source";
  policy: "source-workflow";
  sourceKinds: typeof TOOLCRAFT_MEDIA_SOURCE_KINDS;
}>;

export type ToolcraftTimelinePanelSurfaceModuleContribution = Readonly<{
  id: "timeline.surface";
  kind: "panel-surface";
  moduleId: "timeline";
  surface: "timeline";
  configuration: Readonly<Exclude<ToolcraftTimelinePanelSchema, boolean>>;
}>;

export type ToolcraftLayersPanelSurfaceModuleContribution = Readonly<{
  id: "layers.surface";
  kind: "panel-surface";
  configuration: true;
  moduleId: "layers";
  surface: "layers";
}>;

export type ToolcraftPanelSurfaceModuleContribution =
  | ToolcraftLayersPanelSurfaceModuleContribution
  | ToolcraftTimelinePanelSurfaceModuleContribution;

export type ToolcraftTimelinePersistenceModuleContribution = Readonly<{
  id: "timeline.persistence";
  kind: "persistence-requirement";
  moduleId: "timeline";
  slice: "timeline";
}>;

export type ToolcraftLayersPersistenceModuleContribution = Readonly<{
  id: "layers.persistence";
  kind: "persistence-requirement";
  moduleId: "layers";
  slice: "layers";
}>;

export type ToolcraftMediaSourcePersistenceModuleContribution = Readonly<{
  id: "media-source.persistence";
  kind: "persistence-requirement";
  moduleId: "media-source";
  slice: "media";
}>;

export type ToolcraftPersistenceModuleContribution =
  | ToolcraftLayersPersistenceModuleContribution
  | ToolcraftMediaSourcePersistenceModuleContribution
  | ToolcraftTimelinePersistenceModuleContribution;

export type ToolcraftProductModuleContribution =
  | ToolcraftCanvasBehaviorModuleContribution
  | ToolcraftControlSectionModuleContribution
  | ToolcraftMediaPolicyModuleContribution
  | ToolcraftPanelActionModuleContribution
  | ToolcraftPanelSurfaceModuleContribution
  | ToolcraftPersistenceModuleContribution;
