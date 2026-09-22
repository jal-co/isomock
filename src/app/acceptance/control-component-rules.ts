import {
  getToolcraftSliderStepPositionCount,
  TOOLCRAFT_VISUAL_DISCRETE_POSITION_LIMIT,
  type ToolcraftActionSchema,
  type ToolcraftControlSchema,
} from "@/toolcraft/runtime";

import {
  getActionLabelText,
  getActionSearchText,
  getControlActions,
} from "./actions";
import { getControlLabelText } from "./controls";
import { normalizeToolcraftSemanticText } from "./semantic";
import type { ToolcraftVisibleControl } from "./types";

export function getStepMarkerCount(control: ToolcraftControlSchema): number | undefined {
  return getToolcraftSliderStepPositionCount(control);
}

function isIntegerStepDomain(control: ToolcraftControlSchema): boolean {
  return (
    typeof control.min === "number" &&
    typeof control.max === "number" &&
    typeof control.step === "number" &&
    Number.isInteger(control.min) &&
    Number.isInteger(control.max) &&
    Number.isInteger(control.step)
  );
}

function shouldUseVisualDiscreteSlider(
  control: ToolcraftControlSchema,
): boolean {
  const positionCount = getToolcraftSliderStepPositionCount(control);

  if (
    control.sliderValueKind !== "discrete" ||
    !positionCount ||
    !isIntegerStepDomain(control)
  ) {
    return false;
  }
  return positionCount <= TOOLCRAFT_VISUAL_DISCRETE_POSITION_LIMIT;
}

export function getSliderVariantClassificationErrors({
  control,
  label,
}: {
  control: ToolcraftControlSchema;
  controlId: string;
  label: string;
}): string[] {
  const errors: string[] = [];
  const positionCount = getToolcraftSliderStepPositionCount(control);

  if (!positionCount) {
    return errors;
  }

  if (
    shouldUseVisualDiscreteSlider(control) &&
    control.variant !== "discrete"
  ) {
    errors.push(
      `${label} has ${positionCount} semantic integer positions and must use variant "discrete" so Toolcraft renders tick markers.`,
    );
  }

  if (
    control.variant === "discrete" &&
    control.sliderValueKind !== "discrete"
  ) {
    errors.push(
      `${label} uses variant "discrete" and must declare sliderValueKind "discrete" so tick semantics are explicit and language-independent.`,
    );
  }

  if (
    control.variant === "discrete" &&
    positionCount > TOOLCRAFT_VISUAL_DISCRETE_POSITION_LIMIT
  ) {
    errors.push(
      `${label} declares variant "discrete" with ${positionCount} positions, which would overload tick markers. Keep it stepped continuous or use a different control.`,
    );
  }

  return errors;
}

export function getCodeTextareaControlError({
  control,
  label,
}: {
  control: ToolcraftControlSchema;
  controlId: string;
  label: string;
}): string | undefined {
  if (control.type !== "code" && control.type !== "text") {
    return undefined;
  }

  if (!control.textValueKind) {
    return `${label} must declare textValueKind "single-line", "multiline", or "structured" so TextInput versus CodeTextarea selection does not depend on labels or prose.`;
  }

  if (control.type === "code" && control.textValueKind === "single-line") {
    return `${label} declares textValueKind "single-line" and must use type "text"; reserve type "code" for multiline or structured values.`;
  }

  if (control.type === "text" && control.textValueKind !== "single-line") {
    return `${label} declares textValueKind "${control.textValueKind}" and must use type "code" for multiline or structured values.`;
  }

  return undefined;
}

export function shouldUseSingleCurveVariant(
  control: ToolcraftControlSchema,
): boolean {
  return (
    control.type === "curves" &&
    control.curveIntent === "single-value-map" &&
    control.variant !== "single"
  );
}

export function getCurveIntentError(
  control: ToolcraftControlSchema,
  label: string,
): string | undefined {
  if (control.type !== "curves") {
    return undefined;
  }
  if (!control.curveIntent) {
    return `${label} must declare curveIntent "single-value-map" or "color-channels" so the curve composition does not depend on its label.`;
  }
  if (control.curveIntent === "color-channels" && control.variant === "single") {
    return `${label} declares curveIntent "color-channels" and must use the channel curve composition instead of variant "single".`;
  }
  return undefined;
}

export function getToggleControlLabelError(
  control: ToolcraftControlSchema,
): string | undefined {
  if (control.type !== "switch" && control.type !== "checkbox") {
    return undefined;
  }

  const label = getControlLabelText(control).trim();

  if (/^(enable|disable)\b/i.test(label)) {
    return `toggle labels must name the setting context only; use "CRT", "Background", "Glow", or "Loop" instead of "${label}".`;
  }

  return undefined;
}

export function getSingleActionsControlLabelError(
  control: ToolcraftControlSchema,
): string | undefined {
  if (control.type !== "actions") {
    return undefined;
  }

  const actions = getControlActions(control);

  if (actions.length !== 1) {
    return undefined;
  }

  const label = getControlLabelText(control).trim();
  const actionLabel = getActionLabelText(actions[0] as ToolcraftActionSchema | string).trim();

  if (
    label &&
    actionLabel &&
    normalizeToolcraftSemanticText(label) === normalizeToolcraftSemanticText(actionLabel)
  ) {
    return `single Actions control label "${label}" duplicates its only button label "${actionLabel}". Keep the button as the command and use a short context label such as "Ink wash", "Palette action", or "Current layer".`;
  }

  return undefined;
}

export function getTimelineTransportControlText(
  controlId: string,
  control: ToolcraftControlSchema,
): string {
  return [
    controlId,
    control.target,
    getControlLabelText(control),
    ...getControlActions(control).map(getActionSearchText),
  ].join(" ");
}

export function getAnimationIntentControlText({
  control,
  controlId,
  sectionTitle,
}: ToolcraftVisibleControl): string {
  return [
    sectionTitle ?? "",
    controlId,
    control.target,
    getControlLabelText(control),
  ].join(" ");
}
