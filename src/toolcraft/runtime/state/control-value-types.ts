import type { ToolcraftOrientationPose } from "./orientation-pose";

export type ToolcraftRangeInputValue = { start: string; end: string };
export type ToolcraftVectorValue = { x: number; y: number };
export type ToolcraftColorOpacityValue = { hex: string; opacity: number };
export type ToolcraftPaletteValue = { family: string; shade: string };
export type ToolcraftGradientValue = {
  angle: number;
  gradientType: "linear" | "radial" | "angular" | "diamond";
  stops: { color: string; position: string; opacity?: number }[];
};
export type ToolcraftFontPickerValue = {
  color: string;
  fontId: string;
  fontSize: number;
  fontWeight: string;
  letterSpacing: "tightest" | "tighter" | "tight" | "normal" | "wide" | "wider" | "widest";
  lineHeight: "loose" | "none" | "normal" | "relaxed" | "spacious" | "snug" | "tight";
  opacity: number;
  textCase: "capitalize" | "lowercase" | "original" | "titleCase" | "uppercase";
};
export type ToolcraftColorChannel = "R" | "G" | "B";
export type ToolcraftChannelMixerValue = Record<ToolcraftColorChannel, Record<ToolcraftColorChannel, number>>;
export type ToolcraftCurveChannel = "RGB" | ToolcraftColorChannel;
export type ToolcraftCurvesValue = {
  activeChannel: ToolcraftCurveChannel;
  points: Partial<Record<ToolcraftCurveChannel, ToolcraftVectorValue[]>>;
  selectedPointIndex?: number;
};

/** Canonical values only. Cardinality and runtime-owned controls keep their owners. */
export type ToolcraftBuiltInControlValueMap = {
  actions: never;
  anchorGrid: string;
  aspectRatio: never;
  channelMixer: ToolcraftChannelMixerValue;
  checkbox: boolean;
  code: string;
  collectionActions: unknown[];
  color: string;
  colorOpacity: ToolcraftColorOpacityValue;
  curves: ToolcraftCurvesValue;
  fileDrop: Record<string, unknown>[];
  fontPicker: ToolcraftFontPickerValue;
  gradient: ToolcraftGradientValue;
  imagePicker: string;
  orientationGizmo: ToolcraftOrientationPose;
  palette: ToolcraftPaletteValue;
  panelActions: never;
  rangeInput: ToolcraftRangeInputValue;
  rangeSlider: number[];
  segmented: string;
  select: string;
  settingsTransfer: never;
  slider: number;
  sourceCollection: unknown[];
  switch: boolean;
  tabs: string;
  text: string;
  vector: ToolcraftVectorValue;
};
