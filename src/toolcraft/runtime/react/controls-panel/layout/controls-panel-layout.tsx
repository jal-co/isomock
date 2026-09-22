"use client";

import * as React from "react";

import type {
  ResolvedToolcraftControlSectionSchema,
  ResolvedToolcraftControlSchema,
  ToolcraftControlSchema,
} from "../../../schema/types";
import {
  getToolcraftCanvasSizeTargetDimension,
} from "../../../schema/runtime-targets";
import {
  getToolcraftSliderStepPositionCount,
  getToolcraftVisualDiscreteSliderMarkerIssue,
} from "../../../schema/slider-marker-policy";
import { getToolcraftControlRendererKind } from "../renderers/controls-panel-renderer-registry";

export type ControlEntry = [string, ResolvedToolcraftControlSchema];

export type ControlRenderGroup =
  | { entries: readonly ControlEntry[]; kind: "colorGroup" }
  | { entry: ControlEntry; kind: "control"; plainColorFullWidth?: boolean };

export type RenderedControlRenderGroup = {
  ids: readonly string[];
  node: React.ReactNode;
};

export function isControlsPanelRenderableControl(
  control: Pick<ToolcraftControlSchema, "type">,
): boolean {
  return getToolcraftControlRendererKind(control.type) !== "canvas-handle";
}

export function getControlsPanelRenderableEntries(
  entries: readonly ControlEntry[],
): ControlEntry[] {
  return entries.filter(([, control]) =>
    isControlsPanelRenderableControl(control),
  );
}

const hiddenDiscreteMarkerCount = 2;
const sectionedCompoundControlTypes = new Set([
  "channelMixer",
  "collectionActions",
  "sourceCollection",
  "fontPicker",
  "gradient",
  "palette",
]);

export function shouldRenderCompoundControlSectionDivider(
  control: ToolcraftControlSchema,
): boolean {
  if (control.type === "curves") {
    return control.variant !== "single";
  }

  return sectionedCompoundControlTypes.has(control.type);
}

export function withCompoundControlSectionDivider({
  children,
  control,
}: {
  children: React.ReactNode;
  control: ToolcraftControlSchema;
}): React.ReactNode {
  if (!shouldRenderCompoundControlSectionDivider(control)) {
    return children;
  }

  return (
    <div className="contents" data-control-section-divider="compound">
      {children}
    </div>
  );
}

export function getControlName(
  id: string,
  label: boolean | string | undefined,
): string {
  if (typeof label === "string") {
    return label;
  }

  return id;
}

export function getControlsRecord(
  entries: readonly ControlEntry[],
): Record<string, ResolvedToolcraftControlSchema> {
  return Object.fromEntries(entries);
}

export function getControlRenderGroups(
  entries: readonly ControlEntry[],
  sectionHasOnlyColorFields: boolean,
): ControlRenderGroup[] {
  const groups: ControlRenderGroup[] = [];
  let index = 0;

  while (index < entries.length) {
    const entry = entries[index];

    if (!entry) {
      index += 1;
      continue;
    }

    const colorBankKey = getColorBankKey(
      entry[1],
      sectionHasOnlyColorFields,
    );

    if (!colorBankKey) {
      groups.push({ entry, kind: "control", plainColorFullWidth: entry[1].type === "color" });
      index += 1;
      continue;
    }

    const colorEntries: ControlEntry[] = [];

    while (
      entries[index] &&
      getColorBankKey(
        entries[index][1],
        sectionHasOnlyColorFields,
      ) === colorBankKey
    ) {
      const colorEntry = entries[index];

      if (colorEntry) {
        colorEntries.push(colorEntry);
      }

      index += 1;
    }

    const hasOpacity = colorEntries.some(([, control]) => control.type === "colorOpacity");
    for (let colorIndex = 0; colorIndex < colorEntries.length;) {
      const firstEntry = colorEntries[colorIndex];
      const secondEntry = colorEntries[colorIndex + 1];

      if (firstEntry?.[1].type === "color" && secondEntry?.[1].type === "color") {
        groups.push({ entries: [firstEntry, secondEntry], kind: "colorGroup" });
        colorIndex += 2;
      } else if (firstEntry) {
        groups.push({
          entry: firstEntry,
          kind: "control",
          plainColorFullWidth: firstEntry[1].type === "color" && (hasOpacity || colorEntries.length === 1),
        });
        colorIndex += 1;
      }
    }
  }

  return groups;
}

function getColorBankKey(
  control: ToolcraftControlSchema,
  sectionHasOnlyColorFields: boolean,
): string | null {
  if (!isColorFieldControl(control)) {
    return null;
  }

  if (sectionHasOnlyColorFields) {
    return "color-only-section";
  }

  const semanticGroup = control.semanticGroup?.trim();

  return semanticGroup ? `semantic:${semanticGroup}` : null;
}

export function getControlRenderGroupIds(
  group: ControlRenderGroup,
): readonly string[] {
  return group.kind === "colorGroup"
    ? group.entries.map(([id]) => id)
    : [group.entry[0]];
}

export function countControlsByType(
  sections: readonly ResolvedToolcraftControlSectionSchema[],
  type: string,
): number {
  return sections.reduce(
    (count, section) =>
      count +
      Object.values(section.controls).filter((control) => control.type === type)
        .length,
    0,
  );
}

export function shouldCommitTextControlOnBlur(
  control: ToolcraftControlSchema,
): boolean {
  return (
    control.commitMode === "setting" ||
    Boolean(getToolcraftCanvasSizeTargetDimension(control.target))
  );
}

function isColorFieldControl(
  control: ToolcraftControlSchema | undefined,
): boolean {
  return control?.type === "color" || control?.type === "colorOpacity";
}

export function isColorOnlySection(entries: readonly ControlEntry[]): boolean {
  return (
    entries.length > 0 &&
    entries.every(([, control]) => isColorFieldControl(control))
  );
}

export function getRenderedControlsSectionTitle(
  section: ResolvedToolcraftControlSectionSchema,
): ResolvedToolcraftControlSectionSchema["title"] {
  return isStickyFooterActionSection(section) ? undefined : section.title;
}

function isStickyFooterActionSection(
  section: ResolvedToolcraftControlSectionSchema,
): boolean {
  return (
    section.actionGroup !== undefined &&
    Object.values(section.controls).some(
      (control) => control.type === "panelActions",
    )
  );
}

export function shouldShowColorFieldLabel({
  control,
  sectionHasOnlyColorFields,
}: {
  control: ToolcraftControlSchema;
  sectionHasOnlyColorFields: boolean;
}): boolean {
  return (
    control.label !== false &&
    (control.label !== undefined || !sectionHasOnlyColorFields)
  );
}

export function getControlMarkerCount(
  control: ToolcraftControlSchema,
): number | undefined {
  if (
    control.variant === "discrete" &&
    getToolcraftVisualDiscreteSliderMarkerIssue(control) !== null
  ) {
    return hiddenDiscreteMarkerCount;
  }

  return control.variant === "discrete"
    ? (getToolcraftSliderStepPositionCount(control) ??
        hiddenDiscreteMarkerCount)
    : control.markerCount;
}
