export type ToolcraftCanvasSizingCoverage =
  | "fixed-output-size"
  | "intrinsic-media-size";

export type ToolcraftInfinityCanvasCoverage =
  | "mode-continuity-and-restoration"
  | "scene-bounds-image-export"
  | "scene-bounds-svg-export"
  | "scene-bounds-video-export";

export type ToolcraftInfinityOverflowCoverage = Readonly<{
  passIds: readonly string[];
  controlValues: Readonly<Record<string, string | number | boolean>>;
  edges: readonly ("left" | "right" | "top" | "bottom")[];
}>;

export type ToolcraftRenderScaleState =
  | "interaction"
  | "playback"
  | "steady";

export type ToolcraftRenderScaleCoverage = Readonly<{
  kind: "selected-backing-pixels";
  states: readonly ToolcraftRenderScaleState[];
}>;
