import {
  preserveToolcraftInternalControlSectionRegistration,
} from "./controls-panel-section-id";
import type {
  ToolcraftControlLayoutGroupSchema,
  ToolcraftControlSchema,
  ToolcraftControlSectionSchemaBase,
} from "./types";

const maxAutoInlineControlLabelLength = 18;

export function filterLayoutGroupsForControlIds(
  layoutGroups: readonly ToolcraftControlLayoutGroupSchema[] | undefined,
  controlIds: ReadonlySet<string>,
): ToolcraftControlLayoutGroupSchema[] {
  return (layoutGroups ?? [])
    .map((layoutGroup) => ({
      ...layoutGroup,
      controls: layoutGroup.controls.filter((controlId) => controlIds.has(controlId)),
    }))
    .filter((layoutGroup) =>
      layoutGroup.controls.length >= (layoutGroup.preserveColumns ? 1 : 2),
    );
}

function isShortControlLabel(id: string, control: ToolcraftControlSchema): boolean {
  const label = typeof control.label === "string" ? control.label : id;

  return label.length <= maxAutoInlineControlLabelLength;
}

function isNumericTextControl(control: ToolcraftControlSchema): boolean {
  if (control.type !== "text") {
    return false;
  }

  if (typeof control.defaultValue === "number") {
    return Number.isFinite(control.defaultValue);
  }

  return (
    typeof control.defaultValue === "string" &&
    /^-?\d+(?:\.\d+)?(?:px|%|s)?$/u.test(control.defaultValue.trim())
  );
}

function isColorValueControl(control: ToolcraftControlSchema): boolean {
  return control.type === "color" || control.type === "colorOpacity";
}

function hasVisibleControlLabel(control: ToolcraftControlSchema): boolean {
  return typeof control.label === "string" && control.label.trim().length > 0;
}

function shouldAutoInlineMixedFieldControls(
  first: [string, ToolcraftControlSchema],
  second: [string, ToolcraftControlSchema],
): boolean {
  const [firstId, firstControl] = first;
  const [secondId, secondControl] = second;
  const isNumericColorPair =
    (isNumericTextControl(firstControl) && isColorValueControl(secondControl)) ||
    (isColorValueControl(firstControl) && isNumericTextControl(secondControl));

  return (
    isNumericColorPair &&
    hasVisibleControlLabel(firstControl) &&
    hasVisibleControlLabel(secondControl) &&
    isShortControlLabel(firstId, firstControl) &&
    isShortControlLabel(secondId, secondControl)
  );
}

function shouldAutoInlineControls(
  first: [string, ToolcraftControlSchema],
  second: [string, ToolcraftControlSchema],
): boolean {
  const [firstId, firstControl] = first;
  const [secondId, secondControl] = second;

  if (
    isNumericTextControl(firstControl) &&
    isNumericTextControl(secondControl) &&
    isShortControlLabel(firstId, firstControl) &&
    isShortControlLabel(secondId, secondControl)
  ) {
    return true;
  }

  return shouldAutoInlineMixedFieldControls(first, second);
}

export function addAutoLayoutGroupsToSection<
  TControl extends ToolcraftControlSchema,
  TSection extends ToolcraftControlSectionSchemaBase<TControl>,
>(
  section: TSection,
): TSection {
  if (section.layout === "standalone" || section.actionGroup) {
    return section;
  }

  const entries = Object.entries(section.controls);
  const explicitLayoutGroups = section.layoutGroups ?? [];
  const groupedControlIds = new Set<string>();

  for (const layoutGroup of explicitLayoutGroups) {
    for (const controlId of layoutGroup.controls) {
      groupedControlIds.add(controlId);
    }
  }

  const autoLayoutGroups: ToolcraftControlLayoutGroupSchema[] = [];

  for (let index = 0; index < entries.length - 1; index += 1) {
    const firstEntry = entries[index];
    const secondEntry = entries[index + 1];

    if (!firstEntry || !secondEntry) {
      continue;
    }

    const [firstId] = firstEntry;
    const [secondId] = secondEntry;

    if (groupedControlIds.has(firstId) || groupedControlIds.has(secondId)) {
      continue;
    }

    if (!shouldAutoInlineControls(firstEntry, secondEntry)) {
      continue;
    }

    autoLayoutGroups.push({
      columns: 2,
      controls: [firstId, secondId],
      layout: "inline",
    });
    groupedControlIds.add(firstId);
    groupedControlIds.add(secondId);
    index += 1;
  }

  const layoutGroups = [...explicitLayoutGroups, ...autoLayoutGroups];

  const normalizedSection = (layoutGroups.length > 0
    ? {
        ...section,
        layoutGroups,
      }
    : section) as TSection;

  return preserveToolcraftInternalControlSectionRegistration(
    section,
    normalizedSection,
  );
}
