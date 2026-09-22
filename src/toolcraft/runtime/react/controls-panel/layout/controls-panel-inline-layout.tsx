"use client";

import * as React from "react";
import { ControlInlineGroup } from "@/toolcraft/ui";

import type {
  ToolcraftControlLayoutGroupSchema,
  ToolcraftControlSchema,
} from "../../../schema/types";
import {
  getControlName,
  shouldRenderCompoundControlSectionDivider,
  type RenderedControlRenderGroup,
} from "./controls-panel-layout";

const maxInlineSwitchLabelLength = 16;
const maxInlineSwitchLabelWordCount = 2;

function hasColorOpacityControl(
  controlsById: Record<string, ToolcraftControlSchema>,
  layoutGroup: ToolcraftControlLayoutGroupSchema,
): boolean {
  return layoutGroup.controls.some(
    (controlId) => controlsById[controlId]?.type === "colorOpacity",
  );
}

function hasSliderControl(
  controlsById: Record<string, ToolcraftControlSchema>,
  layoutGroup: ToolcraftControlLayoutGroupSchema,
): boolean {
  return layoutGroup.controls.some(
    (controlId) =>
      controlsById[controlId]?.type === "slider" ||
      controlsById[controlId]?.type === "rangeSlider",
  );
}

function hasFullWidthChoiceControl(
  controlsById: Record<string, ToolcraftControlSchema>,
  layoutGroup: ToolcraftControlLayoutGroupSchema,
): boolean {
  return layoutGroup.controls.some(
    (controlId) =>
      controlsById[controlId]?.type === "segmented" ||
      controlsById[controlId]?.type === "tabs",
  );
}

function hasSectionedCompoundControl(
  controlsById: Record<string, ToolcraftControlSchema>,
  layoutGroup: ToolcraftControlLayoutGroupSchema,
): boolean {
  return layoutGroup.controls.some((controlId) => {
    const control = controlsById[controlId];

    return control ? shouldRenderCompoundControlSectionDivider(control) : false;
  });
}

function isInlineSwitchLabelSafe(
  controlId: string,
  control: ToolcraftControlSchema,
): boolean {
  const label = getControlName(controlId, control.label).trim();
  const wordCount = label.split(/\s+/u).filter(Boolean).length;

  return label.length <= maxInlineSwitchLabelLength && wordCount <= maxInlineSwitchLabelWordCount;
}

function hasUnsafeInlineSwitchLabels(
  controlsById: Record<string, ToolcraftControlSchema>,
  layoutGroup: ToolcraftControlLayoutGroupSchema,
): boolean {
  const switchEntries = layoutGroup.controls
    .map((controlId) => [controlId, controlsById[controlId]] as const)
    .filter(
      (entry): entry is readonly [string, ToolcraftControlSchema] =>
        Boolean(entry[1]) && entry[1].type === "switch",
    );

  return (
    switchEntries.length > 1 &&
    switchEntries.some(([controlId, control]) => !isInlineSwitchLabelSafe(controlId, control))
  );
}

function isBooleanControl(control: ToolcraftControlSchema | undefined): boolean {
  return control?.type === "checkbox" || control?.type === "switch";
}

function isToggleParameterLayoutGroup(
  controlsById: Record<string, ToolcraftControlSchema>,
  layoutGroup: ToolcraftControlLayoutGroupSchema,
): boolean {
  if (layoutGroup.controls.length !== 2) {
    return false;
  }

  const controls = layoutGroup.controls.map((controlId) => controlsById[controlId]);
  const booleanControlCount = controls.filter((control) => isBooleanControl(control)).length;
  const parameterControlCount = controls.filter((control) => !isBooleanControl(control)).length;

  return booleanControlCount === 1 && parameterControlCount === 1;
}

export function shouldHideToggleParameterControlLabel({
  control,
  controlsById,
  layoutGroup,
}: {
  control: ToolcraftControlSchema;
  controlsById: Record<string, ToolcraftControlSchema>;
  layoutGroup: ToolcraftControlLayoutGroupSchema | undefined;
}): boolean {
  return Boolean(
    layoutGroup &&
      isToggleParameterLayoutGroup(controlsById, layoutGroup) &&
      !isBooleanControl(control),
  );
}

function getControlTargetEntityKey(control: ToolcraftControlSchema): string | null {
  const parts = control.target.split(".");

  if (parts.length < 2) {
    return null;
  }

  return parts.slice(0, -1).join(".");
}

function shouldAutoInlineBooleanPair(
  controlsById: Record<string, ToolcraftControlSchema>,
  firstId: string,
  secondId: string,
): boolean {
  const firstControl = controlsById[firstId];
  const secondControl = controlsById[secondId];

  if (!isBooleanControl(firstControl) || !isBooleanControl(secondControl)) {
    return false;
  }

  if (
    !isInlineSwitchLabelSafe(firstId, firstControl) ||
    !isInlineSwitchLabelSafe(secondId, secondControl)
  ) {
    return false;
  }

  const firstEntityKey = getControlTargetEntityKey(firstControl);
  const secondEntityKey = getControlTargetEntityKey(secondControl);

  return firstEntityKey !== null && firstEntityKey === secondEntityKey;
}

function getAutoInlineBooleanLayoutGroups({
  controlsById,
  renderedGroups,
  reservedControlIds,
}: {
  controlsById: Record<string, ToolcraftControlSchema>;
  renderedGroups: readonly RenderedControlRenderGroup[];
  reservedControlIds: ReadonlySet<string>;
}): ToolcraftControlLayoutGroupSchema[] {
  const layoutGroups: ToolcraftControlLayoutGroupSchema[] = [];
  let index = 0;

  while (index < renderedGroups.length) {
    const firstIds = renderedGroups[index]?.ids;
    const secondIds = renderedGroups[index + 1]?.ids;
    const firstId = firstIds?.length === 1 ? firstIds[0] : undefined;
    const secondId = secondIds?.length === 1 ? secondIds[0] : undefined;

    if (
      firstId &&
      secondId &&
      !reservedControlIds.has(firstId) &&
      !reservedControlIds.has(secondId) &&
      shouldAutoInlineBooleanPair(controlsById, firstId, secondId)
    ) {
      layoutGroups.push({
        columns: 2,
        controls: [firstId, secondId],
        layout: "inline",
      });
      index += 2;
      continue;
    }

    index += 1;
  }

  return layoutGroups;
}

export function renderControlLayoutGroups({
  controlsById,
  layoutGroups,
  renderedGroups,
}: {
  controlsById: Record<string, ToolcraftControlSchema>;
  layoutGroups?: readonly ToolcraftControlLayoutGroupSchema[];
  renderedGroups: readonly RenderedControlRenderGroup[];
}): React.ReactNode[] {
  if (!layoutGroups?.length) {
    const autoLayoutGroups = getAutoInlineBooleanLayoutGroups({
      controlsById,
      renderedGroups,
      reservedControlIds: new Set(),
    });

    if (autoLayoutGroups.length === 0) {
      return renderedGroups.map((group) => group.node);
    }

    return renderControlLayoutGroups({
      controlsById,
      layoutGroups: autoLayoutGroups,
      renderedGroups,
    });
  }

  const reservedControlIds = new Set(layoutGroups.flatMap((group) => group.controls));
  const resolvedLayoutGroups = [
    ...layoutGroups,
    ...getAutoInlineBooleanLayoutGroups({
      controlsById,
      renderedGroups,
      reservedControlIds,
    }),
  ];
  const layoutGroupByControlId = getInlineLayoutGroupByControlId({
    controlsById,
    layoutGroups: resolvedLayoutGroups,
  });

  const nodes: React.ReactNode[] = [];

  for (const renderedGroup of renderedGroups) {
    const layoutGroup = renderedGroup.ids
      .map((id) => layoutGroupByControlId.get(id))
      .find((group): group is ToolcraftControlLayoutGroupSchema => Boolean(group));

    if (!layoutGroup) {
      nodes.push(renderedGroup.node);
      continue;
    }

    const groupedRenderedControls = renderedGroups.filter((candidate) =>
      candidate.ids.some((id) => layoutGroup.controls.includes(id)),
    );
    const firstGroupedControl = groupedRenderedControls[0];

    if (firstGroupedControl !== renderedGroup) {
      continue;
    }

    if (groupedRenderedControls.length < 2 && !layoutGroup.preserveColumns) {
      nodes.push(renderedGroup.node);
      continue;
    }

    nodes.push(
      <ControlInlineGroup
        columns={layoutGroup.columns ?? 2}
        kind={
          isToggleParameterLayoutGroup(controlsById, layoutGroup)
            ? "toggleParameter"
            : "default"
        }
        key={`layout-group-${layoutGroup.controls.join("-")}`}
      >
        {groupedRenderedControls.map((group) => group.node)}
      </ControlInlineGroup>,
    );
  }

  return nodes;
}

export function getInlineLayoutGroupByControlId({
  controlsById,
  layoutGroups,
}: {
  controlsById: Record<string, ToolcraftControlSchema>;
  layoutGroups?: readonly ToolcraftControlLayoutGroupSchema[];
}): Map<string, ToolcraftControlLayoutGroupSchema> {
  const layoutGroupByControlId = new Map<string, ToolcraftControlLayoutGroupSchema>();

  for (const layoutGroup of layoutGroups ?? []) {
    if (layoutGroup.layout !== "inline") {
      continue;
    }

    if (
      hasColorOpacityControl(controlsById, layoutGroup) ||
      hasSliderControl(controlsById, layoutGroup) ||
      hasFullWidthChoiceControl(controlsById, layoutGroup) ||
      hasSectionedCompoundControl(controlsById, layoutGroup) ||
      hasUnsafeInlineSwitchLabels(controlsById, layoutGroup)
    ) {
      continue;
    }

    for (const controlId of layoutGroup.controls) {
      layoutGroupByControlId.set(controlId, layoutGroup);
    }
  }

  return layoutGroupByControlId;
}
