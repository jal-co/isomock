import {
  preserveToolcraftInternalControlSectionRegistration,
} from "./controls-panel-section-id";
import { toolcraftRuntimeSetupSectionTitle } from "./runtime-section-titles";
import type {
  ToolcraftControlSchema,
  ToolcraftControlSectionSchemaBase,
} from "./types";

function getImplicitStandaloneSectionTitle(
  entries: readonly [string, ToolcraftControlSchema][],
): string {
  const names = entries
    .map(([id, control]) => getSectionTitlePart(id, control, entries))
    .filter((name): name is string => Boolean(name));

  if (names.length === 1) {
    return names[0];
  }

  if (names.length === 2) {
    return `${names[0]} & ${names[1]}`;
  }

  return getCommonTargetSectionTitle(entries) ?? "Appearance";
}

function getSectionTitlePart(
  id: string,
  control: ToolcraftControlSchema,
  entries: readonly [string, ToolcraftControlSchema][],
): string | undefined {
  if (typeof control.label === "string" && control.label.trim()) {
    const label = control.label.trim();

    if (!isGenericSectionTitle(label)) {
      return label;
    }
  }

  const title = titleizeControlId(id);

  if (title && !isGenericSectionTitle(title)) {
    return title;
  }

  if (entries.length === 1) {
    return getControlTypeSectionTitle(control);
  }

  return undefined;
}

function getControlTypeSectionTitle(
  control: ToolcraftControlSchema,
): string | undefined {
  switch (control.type) {
    case "channelMixer":
      return "Channels";
    case "curves":
      return "Curves";
    case "fontPicker":
      return "Typography";
    case "gradient":
      return "Gradient";
    case "palette":
      return "Palette";
    case "settingsTransfer":
      return "Settings";
    default:
      return undefined;
  }
}

function getCommonTargetSectionTitle(
  entries: readonly [string, ToolcraftControlSchema][],
): string | undefined {
  const targetPrefixes = new Set(
    entries
      .map(([, control]) => control.target.split(".")[0]?.trim())
      .filter((prefix): prefix is string => Boolean(prefix)),
  );

  if (targetPrefixes.size !== 1) {
    return undefined;
  }

  const [targetPrefix] = targetPrefixes;
  const title = titlePrefixToSectionTitle(targetPrefix);

  return title && !isGenericSectionTitle(title) ? title : undefined;
}

function titlePrefixToSectionTitle(prefix: string | undefined): string | undefined {
  if (!prefix) {
    return undefined;
  }

  switch (prefix) {
    case "canvas":
      return toolcraftRuntimeSetupSectionTitle;
    case "runtime":
      return "Settings";
    case "style":
      return "Appearance";
    default:
      return titleizeControlId(prefix);
  }
}

function isGenericColorSectionTitle(title: string): boolean {
  const normalizedTitle = title.trim().toLowerCase();

  return normalizedTitle === "color" || normalizedTitle === "colors";
}

function isGenericSectionTitle(title: string): boolean {
  const normalizedTitle = title.trim().toLowerCase();

  return (
    normalizedTitle === "control" ||
    normalizedTitle === "controls" ||
    normalizedTitle === "setting" ||
    normalizedTitle === "settings" ||
    isGenericColorSectionTitle(title)
  );
}

function isColorOnlySectionEntries(
  entries: readonly [string, ToolcraftControlSchema][],
): boolean {
  return entries.length > 0 && entries.every(([, control]) => control.type === "color");
}

function titleizeControlId(id: string): string | undefined {
  const title = id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  if (!title) {
    return undefined;
  }

  return title.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function withImplicitStandaloneSectionTitle<
  TControl extends ToolcraftControlSchema,
  TSection extends ToolcraftControlSectionSchemaBase<TControl>,
>(
  section: TSection,
  entries: readonly [string, TControl][],
): TSection {
  if (section.title) {
    if (isColorOnlySectionEntries(entries) && isGenericColorSectionTitle(section.title)) {
      return preserveToolcraftInternalControlSectionRegistration(
        section,
        { ...section, title: "Appearance" } as TSection,
      );
    }

    return section;
  }

  const title = getImplicitStandaloneSectionTitle(entries);

  return preserveToolcraftInternalControlSectionRegistration(
    section,
    { ...section, title } as TSection,
  );
}
