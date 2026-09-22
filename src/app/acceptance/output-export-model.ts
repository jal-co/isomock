import type {
  ResolvedToolcraftAppSchema,
  ToolcraftControlSchema,
} from "@/toolcraft/runtime";

import { getControlLabelText } from "./controls";
import {
  schemaHasPngExportPanelAction,
  schemaHasSvgExportPanelAction,
  schemaHasVideoExportPanelAction,
} from "./output-export-actions";
import { normalizeToolcraftSemanticText } from "./semantic";

export type ToolcraftControlsSection = NonNullable<
  ResolvedToolcraftAppSchema["panels"]["controls"]
>["sections"][number];

export type ToolcraftOutputExportFacts = {
  backgroundColorEntry: readonly [string, ToolcraftControlSchema] | undefined;
  backgroundSection: ToolcraftControlsSection | undefined;
  finalExportSettingsIndex: number;
  hasImageExportAction: boolean;
  hasSvgExportAction: boolean;
  hasVideoExportAction: boolean;
  imageExportSection: ToolcraftControlsSection | undefined;
  imageExportSectionIndex: number;
  imageFormatEntry: readonly [string, ToolcraftControlSchema] | undefined;
  imageResolutionEntry: readonly [string, ToolcraftControlSchema] | undefined;
  includeBackgroundEntry: readonly [string, ToolcraftControlSchema] | undefined;
  infinityCanvasEntry: readonly [string, ToolcraftControlSchema] | undefined;
  panelActionsSectionIndex: number;
  setupSection: ToolcraftControlsSection | undefined;
  setupSectionIndex: number;
  videoExportSection: ToolcraftControlsSection | undefined;
  videoExportSectionIndex: number;
  videoFormatEntry: readonly [string, ToolcraftControlSchema] | undefined;
  videoResolutionEntry: readonly [string, ToolcraftControlSchema] | undefined;
};

export function getSearchableControlText({
  control,
  controlId,
  sectionTitle,
}: {
  control: ToolcraftControlSchema;
  controlId: string;
  sectionTitle?: string | undefined;
}): string {
  return [
    sectionTitle ?? "",
    controlId,
    control.target,
    getControlLabelText(control),
  ]
    .join(" ")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
}

function getFirstPanelActionsSectionIndex(
  schema: ResolvedToolcraftAppSchema,
): number {
  return (schema.panels.controls?.sections ?? []).findIndex((section) =>
    Object.values(section.controls).some(
      (control) => control.type === "panelActions",
    ),
  );
}

function getSchemaControlsSectionByTitle(
  schema: ResolvedToolcraftAppSchema,
  title: string,
): ToolcraftControlsSection | undefined {
  const normalizedTitle = normalizeToolcraftSemanticText(title);

  return (schema.panels.controls?.sections ?? []).find(
    (section) =>
      normalizeToolcraftSemanticText(section.title) === normalizedTitle,
  );
}

function getSchemaControlsSectionIndexByTitle(
  schema: ResolvedToolcraftAppSchema,
  title: string,
): number {
  const normalizedTitle = normalizeToolcraftSemanticText(title);

  return (schema.panels.controls?.sections ?? []).findIndex(
    (section) => normalizeToolcraftSemanticText(section.title) === normalizedTitle,
  );
}

function getSectionControlEntryByTarget(
  section: ToolcraftControlsSection | undefined,
  target: string,
): readonly [string, ToolcraftControlSchema] | undefined {
  if (!section) {
    return undefined;
  }

  return Object.entries(section.controls).find(
    ([, control]) => control.target === target,
  );
}

function getOutputBackgroundColorEntry(
  section: ToolcraftControlsSection | undefined,
): readonly [string, ToolcraftControlSchema] | undefined {
  if (!section) {
    return undefined;
  }

  return Object.entries(section.controls).find(([controlId, control]) => {
    if (control.type !== "color") {
      return false;
    }

    return /\b(background|backdrop|scene|canvas)\b/i.test(
      [section.title, controlId, control.target, getControlLabelText(control)]
        .join(" ")
        .replace(/([a-z])([A-Z])/g, "$1 $2"),
    );
  });
}

export function buildToolcraftOutputExportFacts({
  schema,
}: {
  schema: ResolvedToolcraftAppSchema;
}): ToolcraftOutputExportFacts {
  const backgroundSection = getSchemaControlsSectionByTitle(
    schema,
    "Background",
  );
  const setupSection = schema.panels.controls?.sections.find((section) => section.id === "runtime.setup");
  const imageExportSection = getSchemaControlsSectionByTitle(
    schema,
    "Image Export",
  );
  const videoExportSection = getSchemaControlsSectionByTitle(
    schema,
    "Video Export",
  );
  const imageExportSectionIndex = getSchemaControlsSectionIndexByTitle(
    schema,
    "Image Export",
  );
  const videoExportSectionIndex = getSchemaControlsSectionIndexByTitle(
    schema,
    "Video Export",
  );
  const hasImageExportAction = schemaHasPngExportPanelAction(schema);
  const hasSvgExportAction = schemaHasSvgExportPanelAction(schema);
  const hasVideoExportAction = schemaHasVideoExportPanelAction(schema);

  return {
    backgroundColorEntry: getOutputBackgroundColorEntry(setupSection),
    backgroundSection,
    finalExportSettingsIndex: hasVideoExportAction
      ? videoExportSectionIndex
      : hasImageExportAction
        ? imageExportSectionIndex
        : -1,
    hasImageExportAction,
    hasSvgExportAction,
    hasVideoExportAction,
    imageExportSection,
    imageExportSectionIndex,
    imageFormatEntry: getSectionControlEntryByTarget(
      imageExportSection,
      "export.image.format",
    ),
    imageResolutionEntry: getSectionControlEntryByTarget(
      imageExportSection,
      "export.image.resolution",
    ),
    includeBackgroundEntry: getSectionControlEntryByTarget(
      setupSection,
      "export.includeBackground",
    ),
    infinityCanvasEntry: getSectionControlEntryByTarget(
      setupSection,
      "canvas.infinity",
    ),
    panelActionsSectionIndex: getFirstPanelActionsSectionIndex(schema),
    setupSection,
    setupSectionIndex: schema.panels.controls?.sections.findIndex((section) => section.id === "runtime.setup") ?? -1,
    videoExportSection,
    videoExportSectionIndex,
    videoFormatEntry: getSectionControlEntryByTarget(
      videoExportSection,
      "export.video.format",
    ),
    videoResolutionEntry: getSectionControlEntryByTarget(
      videoExportSection,
      "export.video.resolution",
    ),
  };
}
