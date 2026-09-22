export const TOOLCRAFT_MAX_MASKS = 16;
export const toolcraftMaskTargets = Object.freeze({ apply: "masks.apply", items: "masks.items", selection: "masks.selection", show: "masks.show" } as const);
export const TOOLCRAFT_MASK_TRANSIENT_TARGETS = Object.freeze([toolcraftMaskTargets.selection, toolcraftMaskTargets.show]);
export type ToolcraftMaskEdgeMetric = "ellipse-distance" | "normalized-radius";
export type ToolcraftMaskPoint = Readonly<{ x: number; y: number }>;
export type ToolcraftMaskReferenceFrame = ToolcraftMaskPoint & Readonly<{ width: number; height: number }>;
/** Authored values: position signed normalized X-right/Y-up; radius percentage of reference height; clockwise angle. */
export type ToolcraftMaskItem = Readonly<{
  id: string;
  position: ToolcraftMaskPoint;
  radius: number;
  stretch: number;
  rotation: number;
  feather: number;
  opacity: number;
  enabled: boolean;
  edgeMetric: ToolcraftMaskEdgeMetric;
}>;
/** Evaluated mathematical output, never a second authored document. */
export type EvaluatedToolcraftSoftEllipse = Readonly<{
  id: string;
  enabled: boolean;
  center: ToolcraftMaskPoint;
  radiusX: number;
  radiusY: number;
  rotationDegrees: number;
  opacity: number;
  edge: Readonly<{ metric: ToolcraftMaskEdgeMetric; width: number }>;
}>;
export type EvaluatedToolcraftMasks = Readonly<{ version: 1; enabled: boolean; items: readonly EvaluatedToolcraftSoftEllipse[] }>;
export type ToolcraftMasksModuleOptions = Readonly<{ spatialFields?: "editable" | "read-only"; guideSurface?: "canvas" }>;
