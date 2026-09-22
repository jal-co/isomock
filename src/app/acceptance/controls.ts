import type { ToolcraftControlSchema } from "@/toolcraft/runtime";

import { isRuntimeSetupControlTarget } from "./runtime-setup";

export function getControlLabelText(control: ToolcraftControlSchema): string {
  return typeof control.label === "string" ? control.label : "";
}

export function hasVisibleControlLabel(control: ToolcraftControlSchema): boolean {
  return typeof control.label === "string" && control.label.trim().length > 0;
}

export function isSliderLikeControl(control: ToolcraftControlSchema): boolean {
  return control.type === "slider" || control.type === "rangeSlider";
}

export function isToolcraftProductSectionControl(control: ToolcraftControlSchema): boolean {
  return (
    control.type !== "panelActions" &&
    control.type !== "settingsTransfer" &&
    !isRuntimeSetupControlTarget(control.target)
  );
}

export function isLegacyToolcraftControlSectionId(id: string): boolean {
  return id.startsWith("legacy.");
}

export function isToolcraftVisibleAcceptanceControl(control: ToolcraftControlSchema): boolean {
  return control.type === "panelActions" || isToolcraftProductSectionControl(control);
}
