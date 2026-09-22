import { getToolcraftControlKeyframeCapability } from "@/toolcraft/runtime";

import { getConditionValidationErrors } from "./conditions";
import {
  getCodeTextareaControlError,
  getCurveIntentError,
  getSingleActionsControlLabelError,
  getTimelineTransportControlText,
  getToggleControlLabelError,
  shouldUseSingleCurveVariant,
} from "./control-component-rules";
import type { ToolcraftControlRuleContext } from "./control-acceptance-context";

const timelineTransportControlPattern =
  /\b(play|pause|paused|resume|animate|restart)\b/i;

function getControlComponentPolicyErrors({
  control,
  controlId,
  label,
}: Pick<
  ToolcraftControlRuleContext,
  "control" | "controlId" | "label"
>): string[] {
  const errors: string[] = [];
  const toggleLabelError = getToggleControlLabelError(control);
  const singleActionsLabelError = getSingleActionsControlLabelError(control);
  const codeTextareaError = getCodeTextareaControlError({
    control,
    controlId,
    label,
  });
  const curveIntentError = getCurveIntentError(control, label);

  if (toggleLabelError) {
    errors.push(`${label} ${toggleLabelError}`);
  }

  if (singleActionsLabelError) {
    errors.push(`${label} ${singleActionsLabelError}`);
  }

  if (codeTextareaError) {
    errors.push(codeTextareaError);
  }

  if (curveIntentError) {
    errors.push(curveIntentError);
  }

  if (
    control.type === "rangeSlider" &&
    Array.isArray(control.defaultValue) &&
    typeof control.defaultValue[0] === "number" &&
    typeof control.defaultValue[1] === "number" &&
    control.defaultValue[0] === control.defaultValue[1]
  ) {
    errors.push(
      `${label} rangeSlider defaultValue must start with different lower and upper values so the two-thumb control does not collapse into a single-value slider.`,
    );
  }

  if (shouldUseSingleCurveVariant(control)) {
    errors.push(
      `${label} is a semantic single curve and must set variant: "single"; RGB/R/G/B curve tabs are reserved for color-correction or channel-specific curves.`,
    );
  }

  return errors;
}

function getControlTimelinePolicyErrors({
  control,
  controlId,
  label,
  timelineMode,
}: Pick<
  ToolcraftControlRuleContext,
  "control" | "controlId" | "label" | "timelineMode"
>): string[] {
  const errors: string[] = [];
  const keyframeCapability = getToolcraftControlKeyframeCapability(control);

  if (
    control.type !== "panelActions" &&
    timelineTransportControlPattern.test(getTimelineTransportControlText(controlId, control))
  ) {
    errors.push(
      `${label} looks like an app-wide timeline transport control. Play, Pause, Animate, Resume, and Restart animation belong to the top timeline; keep right-panel controls for renderer parameters, generation/apply actions, and output delivery.`,
    );
  }

  if (control.keyframeable === true && !keyframeCapability.capable) {
    errors.push(
      `${label} sets keyframeable true, but this control type or runtime-owned target cannot create timeline keyframes.`,
    );
  }

  if (
    timelineMode === "keyframes" &&
    keyframeCapability.capable &&
    control.keyframeable === false
  ) {
    errors.push(
      `${label} is keyframe-capable by Toolcraft control type; remove keyframeable: false and provide keyframe evaluator coverage instead of hiding the diamond.`,
    );
  }

  return errors;
}

function getControlLayerPolicyErrors({
  control,
  label,
  layersEnabled,
}: Pick<
  ToolcraftControlRuleContext,
  "control" | "label" | "layersEnabled"
>): string[] {
  const errors: string[] = [];
  const isSelectedLayerTarget = control.target.startsWith("selectedLayer.");

  if (isSelectedLayerTarget && !layersEnabled) {
    errors.push(
      `${label} uses reserved selectedLayer.* target without panels.layers enabled. Use an app-specific target for single-layer apps or enable layers with layerCoverage.`,
    );
  }

  return errors;
}

function getControlStatePolicyErrors({
  control,
  controlTargets,
  label,
}: Pick<
  ToolcraftControlRuleContext,
  "control" | "controlTargets" | "label"
>): string[] {
  const errors: string[] = [];

  if (control.disabledWhen) {
    errors.push(
      ...getConditionValidationErrors({
        condition: control.disabledWhen,
        conditionName: "disabledWhen",
        controlTargets,
        label,
      }),
    );
  }

  if (control.disabled === true) {
    errors.push(
      `${label} sets disabled: true. Generated product panels should show only controls usable in the current state; declare conditional applicability instead of rendering disabled controls.`,
    );
  }

  if (control.disabledWhen) {
    errors.push(
      `${label} uses disabledWhen. Generated product panels should show only controls usable in the current state; declare conditional applicability instead of rendering disabled controls.`,
    );
  }

  return errors;
}

export function getControlPreAcceptanceErrors(
  context: ToolcraftControlRuleContext,
): string[] {
  return [
    ...getControlComponentPolicyErrors(context),
    ...getControlTimelinePolicyErrors(context),
    ...getControlLayerPolicyErrors(context),
    ...getControlStatePolicyErrors(context),
  ];
}
