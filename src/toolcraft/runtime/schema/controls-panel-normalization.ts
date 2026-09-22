import { splitControlsPanelActionSections } from "./controls-panel-actions";
import { createNormalizedControlsRecord } from "./control-schema-normalization";
import { assertToolcraftCollectionControlTargets } from "./collection-actions";
import { normalizeMixedSectionLayout } from "./controls-panel-section-layout";
import {
  assertUniqueToolcraftControlSectionIds,
  preserveToolcraftInternalControlSectionRegistration,
  registerToolcraftInternalControlSection,
  resolveToolcraftControlSectionId,
} from "./controls-panel-section-id";
import type {
  ResolvedToolcraftControlSectionSchema,
  ResolvedToolcraftControlsPanelSchema,
  ToolcraftControlSectionSchema,
  ToolcraftControlsPanelSchema,
} from "./types";

function normalizeControlSection(
  section: ToolcraftControlSectionSchema,
): ResolvedToolcraftControlSectionSchema {
  const normalizedSection = {
    ...section,
    controls: createNormalizedControlsRecord(Object.entries(section.controls)),
    id: resolveToolcraftControlSectionId(section),
  };

  if (section.id === undefined) {
    return registerToolcraftInternalControlSection(normalizedSection);
  }

  return preserveToolcraftInternalControlSectionRegistration(
    section,
    normalizedSection,
  );
}

export function normalizeControlsPanelLayout(
  controls: ToolcraftControlsPanelSchema,
): ResolvedToolcraftControlsPanelSchema {
  assertToolcraftCollectionControlTargets(controls);
  const normalizedSections = controls.sections.map(normalizeControlSection);
  assertUniqueToolcraftControlSectionIds(normalizedSections);
  const { bodySections, stickyFooterSections } = splitControlsPanelActionSections(
    normalizedSections,
  );
  const sections = [
    ...bodySections.flatMap(normalizeMixedSectionLayout),
    ...stickyFooterSections.flatMap(normalizeMixedSectionLayout),
  ];
  assertUniqueToolcraftControlSectionIds(sections);

  return {
    ...controls,
    sections,
  };
}
