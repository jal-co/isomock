import { getToolcraftSegmentedStaticFitError } from "@/toolcraft/runtime";
import type {
  ToolcraftCollectionItemControlSchema,
  ToolcraftControlSchema,
} from "@/toolcraft/runtime";

import { getActionValue, isResetPanelAction } from "./actions";
import {
  getSliderVariantClassificationErrors,
  getStepMarkerCount,
} from "./control-component-rules";
import { isSliderLikeControl } from "./controls";
import { hasCoverageForValues } from "./coverage";
import type { ToolcraftComponentAcceptance } from "./types";

function getControlOptionValues(
  control: ToolcraftControlSchema,
): readonly string[] {
  if (control.type === "imagePicker") {
    return control.items?.map((item) => item.value) ?? [];
  }

  return control.options?.map((option) => option.value) ?? [];
}

function getSliderControlAcceptanceErrors({
  control,
  controlId,
  label,
}: {
  control: ToolcraftControlSchema;
  controlId: string;
  label: string;
}): string[] {
  if (!isSliderLikeControl(control)) {
    return [];
  }

  const errors: string[] = [];
  const expectedMarkerCount = getStepMarkerCount(control);

  if (control.unit === "x") {
    errors.push(
      `${label} uses unit "x", but Toolcraft slider values do not use x suffixes. Omit unit for scale, multiplier, intensity, opacity, strength, depth, and shader amount values unless a real measurement unit applies.`,
    );
  }

  if (
    control.variant === "discrete" &&
    expectedMarkerCount &&
    control.markerCount !== expectedMarkerCount
  ) {
    errors.push(
      `${label} discrete slider must render one marker per step; expected markerCount ${expectedMarkerCount}, received ${String(control.markerCount)}.`,
    );
  }

  errors.push(
    ...getSliderVariantClassificationErrors({
      control,
      controlId,
      label,
    }),
  );

  return errors;
}

function getOptionControlAcceptanceErrors({
  control,
  entry,
  label,
}: {
  control: ToolcraftControlSchema;
  entry: ToolcraftComponentAcceptance;
  label: string;
}): string[] {
  const errors: string[] = [];

  if (control.type === "imagePicker") {
    const itemValues = getControlOptionValues(control);

    if (!hasCoverageForValues(entry.optionCoverage, itemValues)) {
      errors.push(
        `${label} must cover every visible ImagePicker item: ${itemValues.join(", ")}.`,
      );
    }
  }

  if (control.type === "select" || control.type === "segmented" || control.type === "tabs") {
    const optionValues = getControlOptionValues(control);

    if (
      optionValues.length > 1 &&
      !hasCoverageForValues(entry.optionCoverage, optionValues)
    ) {
      errors.push(
        `${label} must cover every visible option: ${optionValues.join(", ")}.`,
      );
    }

    const segmentedLayoutError = getToolcraftSegmentedStaticFitError(control);

    if (segmentedLayoutError) {
      errors.push(`${label} ${segmentedLayoutError}`);
    }
  }

  const nestedItemControls: Array<
    [string, ToolcraftCollectionItemControlSchema]
  > = [];

  if (control.itemControl) {
    nestedItemControls.push(["itemControl", control.itemControl]);
  }

  if (control.itemControls) {
    nestedItemControls.push(
      ...Object.entries(control.itemControls).map(
        ([itemId, itemControl]): [string, ToolcraftCollectionItemControlSchema] =>
          [`itemControls.${itemId}`, itemControl],
      ),
    );
  }

  for (const [itemId, itemControl] of nestedItemControls) {
    const segmentedLayoutError =
      getToolcraftSegmentedStaticFitError(itemControl);

    if (segmentedLayoutError) {
      errors.push(`${label} ${itemId} ${segmentedLayoutError}`);
    }
  }

  return errors;
}

function getPanelActionsAcceptanceErrors({
  control,
  entry,
  label,
}: {
  control: ToolcraftControlSchema;
  entry: ToolcraftComponentAcceptance;
  label: string;
}): string[] {
  if (control.type !== "panelActions") {
    return [];
  }

  const errors: string[] = [];
  const actionValues = control.actions?.map(getActionValue) ?? [];
  const resetActionValues =
    control.actions?.filter(isResetPanelAction).map(getActionValue) ?? [];

  if (resetActionValues.length > 0) {
    errors.push(
      `${label} must not include Reset footer actions (${resetActionValues.join(", ")}). The controls panel header owns Reset controls; sticky panelActions are only for product delivery actions such as Export, Copy, Generate, Apply, or Download.`,
    );
  }

  if (!hasCoverageForValues(entry.actionCoverage, actionValues)) {
    errors.push(
      `${label} must cover every footer action: ${actionValues.join(", ")}.`,
    );
  }

  return errors;
}

function getOrientationGizmoAcceptanceErrors({
  control,
  entry,
  label,
}: {
  control: ToolcraftControlSchema;
  entry: ToolcraftComponentAcceptance;
  label: string;
}): string[] {
  if (control.type !== "orientationGizmo") {
    return [];
  }

  if (entry.kind !== "canvas-handle") {
    return [
      `${label} is runtime canvas chrome and must use acceptance kind "canvas-handle", not a panel-control proof.`,
    ];
  }

  if (entry.canvasHandle?.testId !== "toolcraft-orientation-gizmo") {
    return [
      `${label} must use the runtime gizmo testId "toolcraft-orientation-gizmo" so protected browser proof targets the built-in handle.`,
    ];
  }

  return [];
}

export function getControlKindAcceptanceErrors({
  control,
  controlId,
  entry,
  label,
}: {
  control: ToolcraftControlSchema;
  controlId: string;
  entry: ToolcraftComponentAcceptance;
  label: string;
}): string[] {
  return [
    ...getSliderControlAcceptanceErrors({ control, controlId, label }),
    ...getOptionControlAcceptanceErrors({ control, entry, label }),
    ...getPanelActionsAcceptanceErrors({ control, entry, label }),
    ...getOrientationGizmoAcceptanceErrors({ control, entry, label }),
  ];
}
