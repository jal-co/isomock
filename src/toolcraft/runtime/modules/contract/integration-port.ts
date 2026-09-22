export type ToolcraftProductIntegrationPortId =
  | "modelPresentation"
  | "scene.canvasContent"
  | "scene.rasterFrameRenderer"
  | "scene.vectorFrameRenderer";

export type ToolcraftProductIntegrationPortRequirement = {
  readonly applicability:
    | "always"
    | "product-scene"
    | "spatial-product-scene";
  readonly id: ToolcraftProductIntegrationPortId;
};
