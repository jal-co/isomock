export const TOOLCRAFT_PRODUCT_MODULE_CONTRACT_VERSION = 2;

export type ToolcraftProductModuleId =
  | "canvas-editing"
  | "image-export"
  | "masks"
  | "layers"
  | "media-source"
  | "model-3d"
  | "spatial-view"
  | "svg-export"
  | "timeline"
  | "video-export";

export type ToolcraftProductCapabilityId =
  | "artifact.image-export"
  | "artifact.svg-export"
  | "artifact.video-export"
  | "canvas.editing"
  | "foreground.soft-ellipses"
  | "layers.management"
  | "media.source"
  | "model.3d"
  | "spatial.view"
  | "timeline.keyframes"
  | "timeline.playback";

export type ToolcraftDefaultProviderId =
  | "media.source-default"
  | "timeline.playback-default";

export type ToolcraftDefaultProvider = {
  readonly capabilityId: ToolcraftProductCapabilityId;
  readonly providerId: ToolcraftDefaultProviderId;
};
