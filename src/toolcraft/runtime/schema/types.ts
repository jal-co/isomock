import type {
  ToolcraftControlLayoutGroupColumns,
  ToolcraftControlLayoutGroupLayout,
  ToolcraftSectionLayout,
} from "../contracts/types";
import type { ToolcraftControlSchema, ResolvedToolcraftControlSchema } from "./control-schema";
import type {
  ToolcraftColorOpacityValue,
  ToolcraftFontPickerValue,
} from "../state/control-value-types";
export type * from "./control-schema";
export type { ToolcraftControlSchemaBase } from "./control-schema-common";
export type {
  ToolcraftCollectionItemControlSchema,
  ToolcraftCollectionItemControlsSchema,
} from "./control-schema-collections";

export type ToolcraftCanvasSize = {
  height: number;
  unit: "px";
  width: number;
};

export type ToolcraftAppIdentitySchema = {
  id: string;
  title: string;
};

export type ResolvedToolcraftAppIdentity = Readonly<{
  id: string;
  title: string;
}>;

export type ToolcraftCanvasSizeSource = "app" | "runtime-default";

export type ToolcraftCanvasSizingMode =
  | "editable-output"
  | "fixed-output"
  | "intrinsic-media";

export type ToolcraftCanvasSizingSchema =
  | {
      defaultMode?: "finite" | "infinite";
      mode: "editable-output";
    }
  | {
      defaultMode?: never;
      mode: Exclude<ToolcraftCanvasSizingMode, "editable-output">;
    };

export type ToolcraftCanvasRenderScaleSchema =
  | boolean
  | {
      defaultValue?: never;
      enabled?: never;
      max?: never;
      min?: never;
      step?: number;
    };

export type ResolvedToolcraftCanvasRenderScaleSchema = {
  defaultValue: number;
  enabled: boolean;
  max: number;
  min: number;
  step: number;
};

export type ToolcraftPngExportBackground = "include" | "transparent";

export type ToolcraftPngExportSchema = {
  background?: ToolcraftPngExportBackground;
};

export type ToolcraftExportSchema = {
  png?: ToolcraftPngExportSchema;
};

export type ResolvedToolcraftExportSchema = {
  png: Required<ToolcraftPngExportSchema>;
};

export type ToolcraftAssemblyComponentId =
  | "canvas"
  | "controlsPanel"
  | "layersPanel"
  | "timelinePanel"
  | "toolbar";

export type ToolcraftAssemblyCapability =
  | "canvas.draggable"
  | "canvas.editableSize"
  | "canvas.infinity"
  | "canvas.renderScale"
  | "canvas.upload"
  | "controls.defaults"
  | "controls.panel"
  | "history.undoRedo"
  | "layers.groups"
  | "layers.panel"
  | "layers.selection"
  | "layers.visibility"
  | "panels.doubleClickReset"
  | "panels.draggable"
  | "panels.snap"
  | "timeline.duration"
  | "timeline.keyframes"
  | "timeline.panel"
  | "timeline.playback"
  | "toolbar.history"
  | "toolbar.radar"
  | "toolbar.theme"
  | "toolbar.zoom";

export type ToolcraftAssemblyCommand =
  | "canvas.center"
  | "canvas.panBy"
  | "canvas.setOffset"
  | "canvas.setSize"
  | "canvas.setViewport"
  | "canvas.zoomIn"
  | "canvas.zoomOut"
  | "canvas.zoomReset"
  | "controls.apply"
  | "controls.addCollectionItem"
  | "controls.removeCollectionItem"
  | "controls.reset"
  | "controls.resetTargets"
  | "controls.selectCollectionItem"
  | "controls.setCollectionItemField"
  | "controls.setValue"
  | "history.redo"
  | "history.undo"
  | "layers.add"
  | "layers.delete"
  | "layers.moveToGroup"
  | "layers.rename"
  | "layers.reorder"
  | "layers.select"
  | "layers.toggleCollapsed"
  | "layers.toggleVisibility"
  | "media.delete"
  | "media.importBatch"
  | "media.reorder"
  | "media.transform"
  | "panels.resetOffset"
  | "panels.setSectionCollapsed"
  | "panels.setHidden"
  | "panels.setOffset"
  | "panels.update"
  | "timeline.changeKeyframeEasing"
  | "timeline.deleteControlKeyframes"
  | "timeline.deleteKeyframe"
  | "timeline.moveKeyframe"
  | "timeline.selectKeyframe"
  | "timeline.setCurrentTime"
  | "timeline.setDuration"
  | "timeline.setExpanded"
  | "timeline.setPlaying"
  | "timeline.toggleControlKeyframes"
  | "timeline.toggleExpanded"
  | "timeline.toggleLoop"
  | "timeline.togglePlayback";

export type ToolcraftAssemblyPanelContract = {
  capabilities: readonly ToolcraftAssemblyCapability[];
  commands: readonly ToolcraftAssemblyCommand[];
  defaultPlacement: "bottom" | "left" | "right" | "top";
  dragMode: "handle" | "panel";
  enabled: boolean;
  requiredWrapper: "PanelHost";
  snapEdges: readonly ("bottom" | "left" | "right" | "top")[];
  visualComponent: string;
};

export type ToolcraftAssemblyCanvasContract = {
  capabilities: readonly ToolcraftAssemblyCapability[];
  commands: readonly ToolcraftAssemblyCommand[];
  enabled: boolean;
  visualComponent: "CanvasShell";
};

export type ToolcraftAssemblyContract = {
  capabilities: readonly ToolcraftAssemblyCapability[];
  commands: readonly ToolcraftAssemblyCommand[];
  components: readonly ToolcraftAssemblyComponentId[];
  surfaces: {
    canvas: ToolcraftAssemblyCanvasContract;
    panels: {
      controls?: ToolcraftAssemblyPanelContract;
      layers?: ToolcraftAssemblyPanelContract;
      timeline?: ToolcraftAssemblyPanelContract;
      toolbar: ToolcraftAssemblyPanelContract;
    };
  };
};

export type ToolcraftCanvasSchema = {
  /** Background is independent by default; required explicitly couples it to Infinity. */
  infinityBackgroundPolicy?: "required" | "optional";
  draggable?: boolean;
  enabled: boolean;
  renderScale?: ToolcraftCanvasRenderScaleSchema;
  size?: ToolcraftCanvasSize;
  sizing?: ToolcraftCanvasSizingSchema;
  upload?: boolean;
};

export type ToolcraftToolbarSchema = {
  history?: boolean;
  radar?: boolean;
  theme?: boolean;
  zoom?: boolean;
};

export type ToolcraftTimelineMode = "keyframes" | "playback";

export type ToolcraftTimelinePanelSchema =
  | boolean
  | {
      defaultDurationSeconds?: number;
      enabled?: boolean;
      mode?: ToolcraftTimelineMode;
    };

export type ResolvedToolcraftTimelinePanelSchema = {
  defaultDurationSeconds: number;
  enabled: boolean;
  mode: ToolcraftTimelineMode;
};

export type ToolcraftPersistableStateSlice =
  | "canvas"
  | "layers"
  | "media"
  | "panels"
  | "timeline"
  | "values";

export type ToolcraftNoPersistenceSchema = {
  storage: "none";
};

export type ToolcraftLocalStoragePersistenceSchema = {
  additionalValueTargets?: readonly string[];
  include: readonly ToolcraftPersistableStateSlice[];
  key: `toolcraft:${string}:state:v${number}`;
  storage: "localStorage";
  version: number;
};

export type ResolvedToolcraftLocalStoragePersistenceSchema = Readonly<{
  additionalValueTargets: readonly string[];
  include: readonly ToolcraftPersistableStateSlice[];
  key: `toolcraft:${string}:state:v${number}`;
  storage: "localStorage";
  version: number;
}>;

export type ToolcraftPersistenceSchema =
  | ToolcraftNoPersistenceSchema
  | ToolcraftLocalStoragePersistenceSchema;

export type ResolvedToolcraftPersistenceSchema =
  | { storage: "none" }
  | ResolvedToolcraftLocalStoragePersistenceSchema;

export type ToolcraftSettingsTransferMode = boolean | "auto";

export type ToolcraftSettingsTransferObjectSchema = {
  additionalValueTargets?: readonly string[];
  appId?: string;
  enabled?: ToolcraftSettingsTransferMode;
  fileName?: string;
};

export type ToolcraftSettingsTransferSchema =
  | ToolcraftSettingsTransferMode
  | ToolcraftSettingsTransferObjectSchema;

export type ResolvedToolcraftSettingsTransferSchema = {
  additionalValueTargets: readonly string[];
  appId: string;
  enabled: boolean;
  fileName: string;
  mode: ToolcraftSettingsTransferMode;
};

export type ToolcraftActionCommand = "controls.apply" | "controls.reset";

export type ToolcraftActionRole =
  | "copy-output"
  | "download-output"
  | "export-image"
  | "export-svg"
  | "export-video";

export type ToolcraftActionSchema = {
  command?: ToolcraftActionCommand;
  icon?:
    | "check"
    | "copy"
    | "download"
    | "download-simple"
    | "eraser"
    | "export"
    | "rotate-ccw"
    | "shuffle"
    | "upload-simple"
    | "wand-sparkles";
  label?: string;
  role?: ToolcraftActionRole;
  value: string;
  variant?: "default" | "destructive" | "ghost" | "link" | "outline" | "secondary";
};

export type ToolcraftImagePickerItemSchema = {
  alt?: string;
  src: string;
  value: string;
};

export type ToolcraftControlOrderRole =
  | "action"
  | "advanced"
  | "color"
  | "detail"
  | "input"
  | "mode"
  | "primary"
  | "spatial"
  | "strength";

export type ToolcraftControlPerformanceRole = "responsiveness" | "workload";

export type ToolcraftCurveIntent = "color-channels" | "single-value-map";

export type ToolcraftSliderValueKind = "continuous" | "discrete";

export type ToolcraftTextValueKind = "multiline" | "single-line" | "structured";

export type ToolcraftModelFormat = "fbx" | "glb" | "gltf" | "obj" | "ply" | "stl";

export type ToolcraftModelTopologyProfile = "realtime-mesh" | "solid-mesh";

export type ToolcraftModelImportLimits = {
  maxArchiveCompressionRatio: number;
  maxArchiveEntries: number;
  maxArchiveEntryBytes: number;
  maxArchivePathLength: number;
  maxArchiveUncompressedBytes: number;
  maxBundleFiles: number;
  maxDecodedBytes: number;
  maxEstimatedWorkerBytes: number;
  maxNodes: number;
  maxPrimitives: number;
  maxSourceBytes: number;
  maxTextureBytes: number;
  maxTextureCount: number;
  maxTextureDimension: number;
  maxTexturePixels: number;
  maxTriangles: number;
  maxVertices: number;
};

export type ToolcraftMediaAssetKind = "file" | "image";

export type ToolcraftFileDropAssetKind = ToolcraftMediaAssetKind | "model";

export type ToolcraftMediaPositionSchema = {
  x: number;
  y: number;
};

export type ToolcraftMediaTransformSchema = {
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  rotationDeg?: 0 | 90 | 180 | 270;
};

type ToolcraftDefaultBinaryAssetSchema = {
  dataUrl: string;
  fileName: string;
  id?: string;
  layerId?: string;
  layerName?: string;
  mimeType?: string;
  sourceTarget?: string;
};

export type ToolcraftDefaultFileAssetSchema = ToolcraftDefaultBinaryAssetSchema & {
  assetKind: "file";
  position?: ToolcraftMediaPositionSchema;
};

export type ToolcraftDefaultPreparedImageAssetSchema = ToolcraftDefaultBinaryAssetSchema & {
  assetKind?: "image";
  ingressPolicy: "prepared-source";
  position: ToolcraftMediaPositionSchema;
  size?: never;
  sourceSize: ToolcraftCanvasSize;
  transform?: ToolcraftMediaTransformSchema;
};

export type ToolcraftDefaultCanonicalImageAssetSchema = ToolcraftDefaultBinaryAssetSchema & {
  assetKind?: "image";
  ingressPolicy: "canonical-runtime";
  position: ToolcraftMediaPositionSchema;
  size: ToolcraftCanvasSize;
  sourceSize: ToolcraftCanvasSize;
  transform?: ToolcraftMediaTransformSchema;
};

export type ToolcraftDefaultImageOrFileAssetSchema =
  | ToolcraftDefaultCanonicalImageAssetSchema
  | ToolcraftDefaultFileAssetSchema
  | ToolcraftDefaultPreparedImageAssetSchema;

export type ToolcraftDefaultModelAssetSchema = {
  assetKind: "model";
  fileName: string;
  id?: string;
  layerId?: string;
  layerName?: string;
  mimeType?: string;
  sourceFiles: readonly {
    dataUrl: string;
    mimeType?: string;
    path: string;
  }[];
  sourceTarget?: string;
};

export type ToolcraftDefaultMediaAssetSchema =
  | ToolcraftDefaultImageOrFileAssetSchema
  | ToolcraftDefaultModelAssetSchema;

export type ToolcraftMediaSchema = {
  defaultAssets?: readonly ToolcraftDefaultMediaAssetSchema[];
};

export type ResolvedToolcraftMediaSchema = {
  defaultAssets: readonly ToolcraftDefaultMediaAssetSchema[];
};

export type ToolcraftControlPredicateSchema = Readonly<{
  equals?: unknown;
  greaterThan?: number;
  greaterThanOrEqual?: number;
  lessThan?: number;
  lessThanOrEqual?: number;
  notOneOf?: readonly unknown[];
  notEquals?: unknown;
  oneOf?: readonly unknown[];
  target: string;
}>;

export type ToolcraftControlConditionSchema = ToolcraftControlPredicateSchema;

export type ToolcraftControlApplicabilitySchema =
  | Readonly<{ mode: "always" }>
  | Readonly<{
      all: readonly ToolcraftControlPredicateSchema[];
      mode: "conditional";
    }>;

export type ToolcraftResolvedControlApplicabilitySchema =
  | Readonly<{
      mode: "always";
      origin: "explicit";
    }>
  | Readonly<{
      all: readonly ToolcraftControlPredicateSchema[];
      mode: "conditional";
      origin: "explicit";
    }>;

export type ToolcraftControlDisabledConditionSchema = ToolcraftControlConditionSchema;

export type ToolcraftColorOpacityValueSchema = Pick<ToolcraftColorOpacityValue, "hex"> &
  Partial<Pick<ToolcraftColorOpacityValue, "opacity">>;

export type ToolcraftFontPickerValueSchema = Pick<ToolcraftFontPickerValue, "fontId"> &
  Partial<Omit<ToolcraftFontPickerValue, "fontId">>;

export type ToolcraftCurveInterpolation = "monotone" | "smooth";

export type ToolcraftVectorCoordinateMode = "cartesian" | "screen";

export type ToolcraftControlLayoutGroupSchema = {
  columns?: ToolcraftControlLayoutGroupColumns;
  /** Keep the declared column count when only one control remains visible. */
  preserveColumns?: boolean;
  controls: readonly string[];
  layout: ToolcraftControlLayoutGroupLayout;
};

export type ToolcraftControlSectionSchemaBase<TControl extends ToolcraftControlSchema> = {
  actionGroup?: "primary" | "secondary";
  controls: Record<string, TControl>;
  /** Tooltip-only product context shown by the runtime-owned section help icon. */
  description?: string;
  layout?: ToolcraftSectionLayout;
  layoutGroups?: readonly ToolcraftControlLayoutGroupSchema[];
  title?: string;
  visibleWhen?: ToolcraftControlConditionSchema;
};

export type ToolcraftControlSectionSchema =
  ToolcraftControlSectionSchemaBase<ToolcraftControlSchema> & {
    /** Stable lowercase ASCII segments separated by `.`, `_`, or `-`; runtime/internal namespaces are reserved. */
    id: string;
  };

export type ToolcraftControlSectionSchemaFor<TControl extends ToolcraftControlSchema> =
  ToolcraftControlSectionSchemaBase<TControl> & {
    /** Stable lowercase ASCII segments separated by `.`, `_`, or `-`; runtime/internal namespaces are reserved. */
    id: string;
  };

export type ResolvedToolcraftControlSectionSchema =
  ToolcraftControlSectionSchemaBase<ResolvedToolcraftControlSchema> & {
    id: string;
  };

export type ToolcraftControlsPanelSchemaFor<TControl extends ToolcraftControlSchema> = {
  sections: readonly ToolcraftControlSectionSchemaFor<TControl>[];
  title: string;
};

export type ToolcraftControlsPanelSchema = ToolcraftControlsPanelSchemaFor<ToolcraftControlSchema>;

export type ResolvedToolcraftControlsPanelSchema = {
  sections: readonly ResolvedToolcraftControlSectionSchema[];
  title: string;
};

export type ToolcraftPanelsSchema = {
  controls?: ToolcraftControlsPanelSchema;
  layers?: boolean;
  timeline?: ToolcraftTimelinePanelSchema;
};

export type ResolvedToolcraftPanelsSchema = {
  controls?: ResolvedToolcraftControlsPanelSchema;
  layers?: boolean;
  timeline?: ResolvedToolcraftTimelinePanelSchema;
};
