import type { ToolcraftControlRanges } from "./control-ranges";
import type { ToolcraftTimelineCommand } from "../modules/built-ins/timeline/contracts";
import type { ToolcraftLayersCommand } from "../modules/built-ins/layers/contracts";
import type { ToolcraftCanvasSize } from "../schema/types";
import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import type { ToolcraftModelAssetRecord } from "../model-import/model-import-types";
import type { ToolcraftPanelSnapEdge } from "../contracts/types";
import type { ToolcraftCanvasAspectRatioValue } from "./canvas-state";

export type ToolcraftSettingsState = {
  assets: readonly ToolcraftMediaAsset[];
  canvas: Pick<ToolcraftCanvasState, "mode" | "size"> & {
    aspectRatio?: ToolcraftCanvasAspectRatioValue;
  };
  timeline: Pick<
    ToolcraftTimelineState,
    "currentTimeSeconds" | "durationSeconds" | "expanded" | "isLooping"
  > & { isPlaying: false };
  values: Record<string, unknown>;
};

export type ToolcraftCollectionItemAddress =
  | { itemId: string; itemIndex?: never }
  | { itemId?: never; itemIndex: number };
export type ToolcraftCollectionSelectionAddress =
  | { itemId: string | null; itemIndex?: never }
  | { itemId?: never; itemIndex: number | null };

export type ToolcraftCommand =
  | {
      type: "controls.editSlider";
      target: string;
      value: number | readonly number[];
      displayedValue?: unknown;
      label?: string;
      reason?: "reset";
    }
  | { type: "settings.apply"; settings: ToolcraftSettingsState }
  | {
      history?: ToolcraftHistoryMode;
      historyGroup?: string;
      label?: string;
      target: string;
      type: "controls.setValue";
      value: unknown;
    }
  | {
      history?: ToolcraftHistoryMode;
      historyGroup?: string;
      label?: string;
      type: "controls.apply";
      values?: Record<string, unknown>;
    }
  | { itemId?: string; label?: string; target: string; type: "controls.addCollectionItem" }
  | { itemId?: string; label?: string; target: string; type: "controls.removeCollectionItem" }
  | (ToolcraftCollectionSelectionAddress & {
      label?: string;
      target: string;
      type: "controls.selectCollectionItem";
    })
  | (ToolcraftCollectionItemAddress & {
      fieldId: string;
      history?: ToolcraftHistoryMode;
      historyGroup?: string;
      label?: string;
      target: string;
      type: "controls.setCollectionItemField";
      value: unknown;
    })
  | { type: "controls.reset" }
  | { label?: string; targets: string[]; type: "controls.resetTargets"; baseline?: Pick<ToolcraftState, "values" | "controlRanges" | "canvas" | "timeline"> }
  | ToolcraftLayersCommand
  | { delta: ToolcraftPoint; type: "canvas.panBy" }
  | { offset: ToolcraftPoint; type: "canvas.setOffset" }
  | { size: ToolcraftCanvasSize; type: "canvas.setSize" }
  | {
      aspectRatio?: unknown;
      history?: ToolcraftHistoryMode;
      historyGroup?: string;
      label?: string;
      mode: ToolcraftCanvasState["mode"];
      size: ToolcraftCanvasSize;
      type: "canvas.applySettings";
    }
  | { type: "canvas.center" }
  | { type: "canvas.zoomIn" }
  | { type: "canvas.zoomOut" }
  | { type: "canvas.zoomReset" }
  | { offset: ToolcraftPoint; type: "canvas.setViewport"; zoom: number }
  | {
      offset: ToolcraftPanelState["offset"];
      panelId: ToolcraftPanelId;
      type: "panels.setOffset";
    }
  | {
      hidden: boolean;
      panelId: ToolcraftPanelId;
      type: "panels.setHidden";
    }
  | {
      panelId: ToolcraftPanelId;
      patch: ToolcraftPanelPatch;
      type: "panels.update";
    }
  | {
      collapsed: boolean;
      sectionId: string;
      type: "panels.setSectionCollapsed";
    }
  | { panelId: ToolcraftPanelId; type: "panels.resetOffset" }
  | {
      assets: readonly ToolcraftMediaBatchImportAsset[];
      replaceExisting?: boolean;
      type: "media.importBatch";
    }
  | {
      /** Runtime-internal: coordinator-owned canonical allocation commit. */
      allocation: ToolcraftCanonicalMediaImportAllocation;
      type: "media.commitCanonicalImportAllocation";
    }
  | {
      activeDocumentRef: string;
      analysis: ToolcraftModelAsset["analysis"];
      appliedRepairRecipeId: string;
      assetId: string;
      expectedActiveDocumentRef: string;
      expectedRepairPlanRef: string;
      expectedSourceBundleDigest: string;
      expectedTopologyProfile: ToolcraftModelAsset["topologyProfile"];
      repairedDocumentRef: string;
      type: "media.commitModelRepair";
    }
  | {
      asset: ToolcraftModelAsset;
      expectedSourceBundleDigest: string;
      expectedTopologyProfile: ToolcraftModelAsset["topologyProfile"];
      type: "media.hydrateModel";
    }
  | {
      asset: ToolcraftModelAsset;
      expectedPlaceholderRef: string;
      type: "media.hydrateDefaultModel";
    }
  | {
      assetId: string;
      error?: ToolcraftMediaResourceError;
      expectedResourceRef: string;
      lifecycle: "ready" | "unavailable";
      type: "media.setBinaryResourceState";
    }
  | {
      assetId: string;
      expectedActiveDocumentRef: string;
      expectedSourceBundleDigest: string;
      feedback: ToolcraftModelAsset["lastRepairError"] | null;
      type: "media.setModelRepairError";
    }
  | { mediaId: string; type: "media.delete" }
  | { mediaIds: string[]; type: "media.reorder" }
  | {
      mediaId: string;
      operation: ToolcraftMediaTransformOperation;
      type: "media.transform";
    }
  | ToolcraftTimelineCommand
  | { type: "history.undo" }
  | { type: "history.redo" };

export const toolcraftRuntimeCommandTypes = [
  "controls.editSlider",
  "controls.setValue",
  "controls.apply",
  "controls.addCollectionItem",
  "controls.removeCollectionItem",
  "controls.reset",
  "controls.resetTargets",
  "controls.selectCollectionItem",
  "controls.setCollectionItemField",
  "layers.add",
  "layers.delete",
  "layers.moveToGroup",
  "layers.select",
  "layers.rename",
  "layers.toggleCollapsed",
  "layers.toggleVisibility",
  "layers.reorder",
  "canvas.panBy",
  "canvas.setOffset",
  "canvas.setSize",
  "canvas.applySettings",
  "canvas.center",
  "canvas.zoomIn",
  "canvas.zoomOut",
  "canvas.zoomReset",
  "canvas.setViewport",
  "panels.setOffset",
  "panels.setHidden",
  "panels.update",
  "panels.setSectionCollapsed",
  "panels.resetOffset",
  "media.importBatch",
  "settings.apply",
  "media.commitCanonicalImportAllocation",
  "media.commitModelRepair",
  "media.hydrateDefaultModel",
  "media.hydrateModel",
  "media.setBinaryResourceState",
  "media.setModelRepairError",
  "media.delete",
  "media.reorder",
  "media.transform",
  "timeline.setCurrentTime",
  "timeline.setDuration",
  "timeline.setExpanded",
  "timeline.setPlaying",
  "timeline.toggleExpanded",
  "timeline.togglePlayback",
  "timeline.toggleLoop",
  "timeline.selectKeyframe",
  "timeline.deleteKeyframe",
  "timeline.deleteControlKeyframes",
  "timeline.toggleControlKeyframes",
  "timeline.upsertControlKeyframe",
  "timeline.moveKeyframe",
  "timeline.changeKeyframeEasing",
  "history.undo",
  "history.redo",
] as const satisfies readonly ToolcraftCommand["type"][];

export type ToolcraftPoint = {
  x: number;
  y: number;
};

export type ToolcraftSceneElementFrame = {
  position: ToolcraftPoint;
  size: ToolcraftCanvasSize;
};

export type ToolcraftCanvasState = {
  mode: "finite" | "infinite";
  offset: ToolcraftPoint;
  size: ToolcraftCanvasSize;
  zoom: number;
};

export type ToolcraftLayerKind = "group" | "layer";

export type ToolcraftLayer = {
  collapsed?: boolean;
  displayName?: string;
  id: string;
  kind?: ToolcraftLayerKind;
  name: string;
  parentGroupId?: string;
  visible: boolean;
};

export type ToolcraftLayerDraft = {
  collapsed?: boolean;
  displayName?: string;
  id?: string;
  kind?: ToolcraftLayerKind;
  name?: string;
  parentGroupId?: string;
  visible?: boolean;
};

export type ToolcraftMediaAssetBase<AssetKind extends "file" | "image" | "model"> = {
  assetKind: AssetKind;
  fileName: string;
  id: string;
  layerId: string;
  mimeType: string;
  /** Browser-visible names/folder-relative paths, never filesystem authority. */
  sourcePaths?: readonly string[];
  sourceTarget?: string;
};

export type ToolcraftMediaResourceError = {
  code: string;
  message: string;
};

export type ToolcraftMediaResourceState =
  | { lifecycle: "ready" | "restoring"; resourceRef: string }
  | {
      error: ToolcraftMediaResourceError;
      lifecycle: "unavailable";
      resourceRef: string;
    };

type ToolcraftBinaryMediaAssetBase<AssetKind extends "file" | "image"> =
  ToolcraftMediaAssetBase<AssetKind> & ToolcraftMediaResourceState;

export type ToolcraftImageAsset = ToolcraftBinaryMediaAssetBase<"image"> &
  ToolcraftSceneElementFrame & {
    sourceSize: ToolcraftCanvasSize;
    transform?: ToolcraftMediaTransform;
  };

export type ToolcraftFileAsset = ToolcraftBinaryMediaAssetBase<"file"> & {
  position: ToolcraftPoint;
};

export type ToolcraftModelAsset = ToolcraftMediaAssetBase<"model"> &
  ToolcraftSceneElementFrame &
  ToolcraftModelAssetRecord;

export type ToolcraftMediaAsset = ToolcraftFileAsset | ToolcraftImageAsset | ToolcraftModelAsset;

type ToolcraftAssetDraftFor<Asset extends { id: string; layerId: string }> = Asset extends unknown
  ? Omit<Asset, "id" | "layerId"> & {
      id?: string;
      layerId?: string;
      layerName?: string;
    }
  : never;

type ToolcraftMediaAssetDraftFor<Asset extends ToolcraftMediaAsset> = ToolcraftAssetDraftFor<Asset>;

export type ToolcraftFileAssetDraft = ToolcraftMediaAssetDraftFor<ToolcraftFileAsset>;

export type ToolcraftImageAssetDraft = ToolcraftMediaAssetDraftFor<ToolcraftImageAsset>;

type ToolcraftImageAssetWithoutSceneSize<Asset> = Asset extends unknown
  ? Omit<Asset, "size"> & { size?: never }
  : never;

export type ToolcraftPreparedSourceImageAssetDraft =
  ToolcraftImageAssetWithoutSceneSize<ToolcraftImageAssetDraft>;

export type ToolcraftPreparedSourceImageAsset =
  ToolcraftImageAssetWithoutSceneSize<ToolcraftImageAsset>;

export type ToolcraftModelAssetDraft = ToolcraftMediaAssetDraftFor<ToolcraftModelAsset>;

export type ToolcraftMediaAssetDraft =
  | ToolcraftFileAssetDraft
  | ToolcraftImageAssetDraft
  | ToolcraftModelAssetDraft;

export type ToolcraftImageAssetIngress =
  | { asset: ToolcraftImageAssetDraft; policy: "canonical-runtime" }
  | {
      asset: ToolcraftPreparedSourceImageAssetDraft;
      policy: "prepared-source";
    };

export type ToolcraftInitialImageAssetIngress =
  | { asset: ToolcraftImageAsset; policy: "canonical-runtime" }
  | { asset: ToolcraftPreparedSourceImageAsset; policy: "prepared-source" };

export type ToolcraftMediaBatchImportAsset =
  | ToolcraftFileAssetDraft
  | ToolcraftImageAssetIngress
  | ToolcraftModelAssetDraft;

export type ToolcraftCanonicalMediaImportAllocationItem = {
  draft: ToolcraftMediaAssetDraft;
  layerId: string;
  layerName: string;
  mediaId: string;
};

export type ToolcraftCanonicalMediaImportAllocation = {
  baseLayers: readonly ToolcraftLayer[];
  baseMediaAssets: readonly ToolcraftMediaAsset[];
  items: readonly ToolcraftCanonicalMediaImportAllocationItem[];
};

export type ToolcraftInitialMediaAsset = ToolcraftInitialImageAssetIngress | ToolcraftMediaAsset;

export type ToolcraftMediaTransform = {
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  rotationDeg?: 0 | 90 | 180 | 270;
};

export type ToolcraftMediaTransformOperation =
  | "flip-horizontal"
  | "flip-vertical"
  | "rotate-left"
  | "rotate-right";

export type ToolcraftHistoryPatch = {
  after: Record<string, unknown>;
  before: Record<string, unknown>;
  group?: string;
  label: string;
};

export type ToolcraftHistoryMode = "merge" | "record" | "skip";

export type ToolcraftTimelineBezierControlPoints = [number, number, number, number];

export type ToolcraftTimelineKeyframeEasing =
  | {
      controlPoints: ToolcraftTimelineBezierControlPoints;
      type: "bezier";
    }
  | {
      type: "step";
    };

export type ToolcraftTimelineKeyframe = {
  controlId: string;
  controlLabel: string;
  easing?: ToolcraftTimelineKeyframeEasing;
  id: string;
  timeSeconds: number;
  value?: unknown;
  valueLabel: string;
};

export type ToolcraftTimelineKeyframeGroup = {
  controlId: string;
  keyframes: ToolcraftTimelineKeyframe[];
  label: string;
};

export type ToolcraftTimelineState = {
  currentTimeSeconds: number;
  durationSeconds: number;
  expanded: boolean;
  isLooping: boolean;
  isPlaying: boolean;
  keyframeGroups: ToolcraftTimelineKeyframeGroup[];
  selectedKeyframeId: string | null;
};

export type ToolcraftPanelId = "controls" | "layers" | "timeline" | "toolbar";

export type ToolcraftPanelState = {
  collapsed?: boolean;
  extended?: boolean;
  hidden?: boolean;
  offset: { x: number; y: number };
  scrollTop?: number;
  snapEdge?: ToolcraftPanelSnapEdge;
};

export type ToolcraftPanelPatch = Partial<
  Pick<
    ToolcraftPanelState,
    "collapsed" | "extended" | "hidden" | "offset" | "scrollTop" | "snapEdge"
  >
>;

export type ToolcraftControlsPanelState = ToolcraftPanelState & {
  collapsedSections: Record<string, boolean>;
};

export type ToolcraftPanelsState = {
  controls: ToolcraftControlsPanelState;
  layers: ToolcraftPanelState;
  timeline: ToolcraftPanelState;
  toolbar: ToolcraftPanelState;
};

export type ToolcraftState = {
  controlRanges: ToolcraftControlRanges;
  canvas: ToolcraftCanvasState;
  defaults: Record<string, unknown>;
  history: {
    authority?: { canUndo: boolean; canRedo: boolean };
    redo: ToolcraftHistoryPatch[];
    undo: ToolcraftHistoryPatch[];
  };
  layers: ToolcraftLayer[];
  mediaAssets: ToolcraftMediaAsset[];
  panels: ToolcraftPanelsState;
  schema: ResolvedToolcraftAppSchema;
  selectedLayerId: string | null;
  timeline: ToolcraftTimelineState;
  values: Record<string, unknown>;
};

export type ToolcraftInitialState = {
  controlRanges?: ToolcraftControlRanges;
  canvas?: Partial<ToolcraftCanvasState>;
  layers?: ToolcraftLayer[];
  mediaAssets?: ToolcraftInitialMediaAsset[];
  panels?: {
    controls?: Partial<ToolcraftControlsPanelState>;
    layers?: Partial<ToolcraftPanelState>;
    timeline?: Partial<ToolcraftPanelState>;
    toolbar?: Partial<ToolcraftPanelState>;
  };
  selectedLayerId?: string | null;
  timeline?: Partial<ToolcraftTimelineState>;
  values?: Record<string, unknown>;
};
