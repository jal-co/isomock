import {
  TOOLCRAFT_BUILT_IN_CONTROL_TYPES,
  type ToolcraftBuiltInControlType,
} from "../../../contracts/component-contracts";

export type ToolcraftControlRendererKind =
  | "action"
  | "basic"
  | "canvas-handle"
  | "collection"
  | "compound"
  | "media"
  | "settings";

export type ToolcraftControlRendererStateDependency =
  | "canvas.size"
  | "mediaAssets"
  | "value";

export const TOOLCRAFT_CONTROL_RENDERER_STATE_DEPENDENCIES = {
  action: [],
  basic: ["value"],
  "canvas-handle": [],
  collection: ["value"],
  compound: ["value"],
  media: ["canvas.size", "mediaAssets", "value"],
  settings: [],
} as const satisfies Record<
  ToolcraftControlRendererKind,
  readonly ToolcraftControlRendererStateDependency[]
>;

export const TOOLCRAFT_CONTROL_RENDERER_REGISTRY = {
  actions: "action",
  anchorGrid: "basic",
  aspectRatio: "basic",
  channelMixer: "compound",
  checkbox: "basic",
  code: "basic",
  collectionActions: "collection",
  sourceCollection: "collection",
  color: "compound",
  colorOpacity: "compound",
  curves: "compound",
  fileDrop: "media",
  fontPicker: "compound",
  gradient: "compound",
  imagePicker: "compound",
  orientationGizmo: "canvas-handle",
  palette: "compound",
  panelActions: "action",
  rangeInput: "basic",
  rangeSlider: "basic",
  segmented: "basic",
  select: "basic",
  settingsTransfer: "settings",
  slider: "basic",
  switch: "basic",
  tabs: "basic",
  text: "basic",
  vector: "basic",
} as const satisfies Record<
  ToolcraftBuiltInControlType,
  ToolcraftControlRendererKind
>;

export function getToolcraftControlRendererKind(
  controlType: string,
): ToolcraftControlRendererKind | null {
  return TOOLCRAFT_BUILT_IN_CONTROL_TYPES.includes(
    controlType as ToolcraftBuiltInControlType,
  )
    ? TOOLCRAFT_CONTROL_RENDERER_REGISTRY[
        controlType as ToolcraftBuiltInControlType
      ]
    : null;
}

export function getToolcraftControlRendererStateDependencies(
  controlType: string,
): readonly ToolcraftControlRendererStateDependency[] {
  const kind = getToolcraftControlRendererKind(controlType);

  return kind ? TOOLCRAFT_CONTROL_RENDERER_STATE_DEPENDENCIES[kind] : ["value"];
}
