import {
  type ResolvedToolcraftAppSchema,
  type ResolvedToolcraftControlSchema,
  type ToolcraftControlSchema,
} from "@/toolcraft/runtime";

import {
  getControlLabelText,
  isToolcraftProductSectionControl,
} from "./controls";
import { getToolcraftSectionLabel } from "./sections";
import {
  getToolcraftLooseTargetPrefix,
  normalizeToolcraftSemanticText,
} from "./semantic";

const maxInlineSwitchLabelLength = 16;
const maxInlineSwitchLabelWordCount = 2;
const normalizedVideoExportSectionTitle =
  normalizeToolcraftSemanticText("Video Export");

type ToolcraftControlsSection = NonNullable<
  ResolvedToolcraftAppSchema["panels"]["controls"]
>["sections"][number];

type ToolcraftControlLayoutGroup = NonNullable<
  ToolcraftControlsSection["layoutGroups"]
>[number];

function getInlineSwitchLabelText(
  controlId: string,
  control: ToolcraftControlSchema,
): string {
  if (control.label === false) {
    return "";
  }

  const label = getControlLabelText(control).trim();

  return label || controlId;
}

function isInlineSwitchLabelSafe(
  controlId: string,
  control: ToolcraftControlSchema,
): boolean {
  const label = getInlineSwitchLabelText(controlId, control);

  if (!label) {
    return true;
  }

  const wordCount = label.split(/\s+/u).filter(Boolean).length;

  return label.length <= maxInlineSwitchLabelLength && wordCount <= maxInlineSwitchLabelWordCount;
}

function isBooleanControl(control: ToolcraftControlSchema | undefined): boolean {
  return control?.type === "checkbox" || control?.type === "switch";
}

function controlsShareToolcraftTargetEntity(
  firstControl: ToolcraftControlSchema,
  secondControl: ToolcraftControlSchema,
): boolean {
  const firstPrefix = getToolcraftLooseTargetPrefix(firstControl.target);
  const secondPrefix = getToolcraftLooseTargetPrefix(secondControl.target);

  return Boolean(firstPrefix && firstPrefix === secondPrefix);
}

function isToolcraftVideoExportSegmentedInlinePair({
  layoutGroup,
  section,
  segmentedControlId,
}: {
  layoutGroup: ToolcraftControlLayoutGroup;
  section: ToolcraftControlsSection;
  segmentedControlId: string;
}): boolean {
  if (
    normalizeToolcraftSemanticText(section.title) !==
      normalizedVideoExportSectionTitle ||
    layoutGroup.columns !== 2 ||
    layoutGroup.controls.length !== 2
  ) {
    return false;
  }

  const formatControl = section.controls[segmentedControlId];
  const resolutionControlId = layoutGroup.controls.find(
    (controlId) => controlId !== segmentedControlId,
  );
  const resolutionControl = resolutionControlId
    ? section.controls[resolutionControlId]
    : undefined;

  return (
    formatControl?.type === "segmented" &&
    formatControl.target === "export.video.format" &&
    resolutionControl?.type === "select" &&
    resolutionControl.target === "export.video.resolution"
  );
}

export function sectionHasInlineLayoutGroupForPair(
  section: ToolcraftControlsSection,
  firstControlId: string,
  secondControlId: string,
): boolean {
  return (section.layoutGroups ?? []).some(
    (layoutGroup) =>
      layoutGroup.layout === "inline" &&
      layoutGroup.columns === 2 &&
      layoutGroup.controls.length === 2 &&
      layoutGroup.controls.includes(firstControlId) &&
      layoutGroup.controls.includes(secondControlId),
  );
}

export function getToolcraftInlineLayoutErrors(
  schema: ResolvedToolcraftAppSchema,
): string[] {
  const errors: string[] = [];

  for (const [sectionIndex, section] of (schema.panels.controls?.sections ?? []).entries()) {
    const sectionLabel = getToolcraftSectionLabel(section.title, sectionIndex);

    for (const layoutGroup of section.layoutGroups ?? []) {
      if (layoutGroup.layout !== "inline") {
        continue;
      }

      const rangeSliderIds = layoutGroup.controls.filter(
        (controlId) => section.controls[controlId]?.type === "rangeSlider",
      );

      if (rangeSliderIds.length > 0) {
        errors.push(
          `${sectionLabel} layoutGroups inline row "${layoutGroup.controls.join(", ")}" includes rangeSlider ${rangeSliderIds.join(", ")}. RangeSlider is a full-width two-thumb control and must not share a row with another slider or range slider.`,
        );
      }

      const segmentedIds = layoutGroup.controls.filter(
        (controlId) =>
          section.controls[controlId]?.type === "segmented" &&
          !isToolcraftVideoExportSegmentedInlinePair({
            layoutGroup,
            section,
            segmentedControlId: controlId,
          }),
      );

      if (segmentedIds.length > 0) {
        errors.push(
          `${sectionLabel} layoutGroups inline row "${layoutGroup.controls.join(", ")}" includes segmented control ${segmentedIds.join(", ")}. Segmented is full-width and must not share a two-column or half-width row; use Select when a finite choice must fit beside another control.`,
        );
      }

      const tabsIds = layoutGroup.controls.filter(
        (controlId) => section.controls[controlId]?.type === "tabs",
      );

      if (tabsIds.length > 0) {
        errors.push(
          `${sectionLabel} layoutGroups inline row "${layoutGroup.controls.join(", ")}" includes tabs control ${tabsIds.join(", ")}. Tabs is full-width and must not share a two-column or half-width row.`,
        );
      }

      const switchEntries = layoutGroup.controls
        .map((controlId) => [controlId, section.controls[controlId]] as const)
        .filter(
          (entry): entry is readonly [string, ResolvedToolcraftControlSchema] =>
            Boolean(entry[1]) && entry[1].type === "switch",
        );
      const booleanEntries = layoutGroup.controls
        .map((controlId) => [controlId, section.controls[controlId]] as const)
        .filter(
          (entry): entry is readonly [string, ResolvedToolcraftControlSchema] =>
            Boolean(entry[1]) && isBooleanControl(entry[1]),
        );
      const parameterEntries = layoutGroup.controls
        .map((controlId) => [controlId, section.controls[controlId]] as const)
        .filter(
          (entry): entry is readonly [string, ResolvedToolcraftControlSchema] =>
            Boolean(entry[1]) && !isBooleanControl(entry[1]),
        );

      if (switchEntries.length > 1) {
        const unsafeSwitchLabels = switchEntries.filter(
          ([controlId, control]) => !isInlineSwitchLabelSafe(controlId, control),
        );

        if (unsafeSwitchLabels.length > 0) {
          errors.push(
            `${sectionLabel} layoutGroups inline row "${layoutGroup.controls.join(", ")}" includes switch labels ${unsafeSwitchLabels.map(([controlId, control]) => `${controlId} "${getInlineSwitchLabelText(controlId, control)}"`).join(", ")} that are too long for a two-column toggle row. Switches share a row only when every visible label fits without truncation; shorten labels or stack them.`,
          );
        }
      }

      if (booleanEntries.length === 1 && parameterEntries.length === 1) {
        const unsafeBooleanLabels = booleanEntries.filter(
          ([controlId, control]) => !isInlineSwitchLabelSafe(controlId, control),
        );

        if (unsafeBooleanLabels.length > 0) {
          errors.push(
            `${sectionLabel} layoutGroups inline row "${layoutGroup.controls.join(", ")}" includes toggle label ${unsafeBooleanLabels.map(([controlId, control]) => `${controlId} "${getInlineSwitchLabelText(controlId, control)}"`).join(", ")} that is too long for a compact toggle-plus-parameter row. Keep the toggle label short, such as "Include" inside Background, or stack the controls.`,
          );
        }

        const visibleParameterLabels = parameterEntries.filter(
          ([, control]) => control.label !== false,
        );

        if (visibleParameterLabels.length > 0) {
          errors.push(
            `${sectionLabel} layoutGroups inline row "${layoutGroup.controls.join(", ")}" pairs a toggle with parameter labels ${visibleParameterLabels.map(([controlId, control]) => `${controlId} "${getControlLabelText(control)}"`).join(", ")}. In toggle-plus-parameter rows, the non-toggle parameter must use label false; if that label is needed, stack the controls instead.`,
          );
        }
      }
    }

    const sectionControls = Object.entries(section.controls).filter(([, control]) =>
      isToolcraftProductSectionControl(control),
    );

    for (let index = 0; index < sectionControls.length - 1; index += 1) {
      const [firstControlId, firstControl] = sectionControls[index] ?? [];
      const [secondControlId, secondControl] = sectionControls[index + 1] ?? [];

      if (
        !firstControlId ||
        !secondControlId ||
        !firstControl ||
        !secondControl ||
        firstControl.applicability.mode ===
          "conditional" ||
        secondControl.applicability.mode ===
          "conditional" ||
        !isBooleanControl(firstControl) ||
        !isBooleanControl(secondControl) ||
        !isInlineSwitchLabelSafe(firstControlId, firstControl) ||
        !isInlineSwitchLabelSafe(secondControlId, secondControl) ||
        !controlsShareToolcraftTargetEntity(firstControl, secondControl) ||
        sectionHasInlineLayoutGroupForPair(section, firstControlId, secondControlId)
      ) {
        continue;
      }

      errors.push(
        `${sectionLabel} has adjacent short toggle controls "${firstControlId}" and "${secondControlId}" for the same product entity "${getToolcraftLooseTargetPrefix(firstControl.target)}". Put them in a two-column inline layoutGroup so compact paired toggles share one row.`,
      );
    }
  }

  return errors;
}
