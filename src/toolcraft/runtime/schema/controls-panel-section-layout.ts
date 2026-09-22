import { TOOLCRAFT_COMPONENT_CONTRACTS } from "../contracts/component-contracts";
import {
  addAutoLayoutGroupsToSection,
  filterLayoutGroupsForControlIds,
} from "./controls-panel-layout-groups";
import {
  deriveSplitToolcraftControlSectionId,
  preserveToolcraftInternalControlSectionRegistration,
  registerToolcraftInternalControlSection,
} from "./controls-panel-section-id";
import { withImplicitStandaloneSectionTitle } from "./controls-panel-section-titles";
import {
  getToolcraftApplicabilityTargets,
} from "./control-applicability";
import type {
  ResolvedToolcraftControlSchema,
  ResolvedToolcraftControlSectionSchema,
} from "./types";

function getControlDefaultSectionLayout(
  control: ResolvedToolcraftControlSchema,
): "grouped" | "standalone" {
  const contract = (
    TOOLCRAFT_COMPONENT_CONTRACTS as Record<
      string,
      { defaultSectionLayout?: "grouped" | "standalone"; kind?: string } | undefined
    >
  )[control.type];

  return contract?.kind === "control" && contract.defaultSectionLayout
    ? contract.defaultSectionLayout
    : "grouped";
}

function isControlGatedBySameSectionControl(
  control: ResolvedToolcraftControlSchema,
  entries: readonly [string, ResolvedToolcraftControlSchema][],
): boolean {
  const gateTargets = [
    ...getToolcraftApplicabilityTargets(
      control.applicability,
    ),
    ...(control.disabledWhen ? [control.disabledWhen.target] : []),
  ];

  if (gateTargets.length === 0) {
    return false;
  }

  return entries.some(([, entryControl]) =>
    gateTargets.includes(entryControl.target) &&
    getControlDefaultSectionLayout(entryControl) === "grouped",
  );
}

function getControlSectionLayout(
  control: ResolvedToolcraftControlSchema,
  entries: readonly [string, ResolvedToolcraftControlSchema][],
): "grouped" | "standalone" {
  if (isControlGatedBySameSectionControl(control, entries)) {
    return "grouped";
  }

  if (
    (control.type === "color" || control.type === "colorOpacity") &&
    entries.some(
      ([, entryControl]) =>
        entryControl.type !== "color" &&
        entryControl.type !== "colorOpacity" &&
        getControlDefaultSectionLayout(entryControl) === "grouped",
    )
  ) {
    return "grouped";
  }

  return getControlDefaultSectionLayout(control);
}

export function normalizeMixedSectionLayout(
  section: ResolvedToolcraftControlSectionSchema,
): ResolvedToolcraftControlSectionSchema[] {
  const entries: [string, ResolvedToolcraftControlSchema][] = Object.entries(
    section.controls,
  );

  if (section.layout === "standalone") {
    const normalizedSection = addAutoLayoutGroupsToSection(
      withImplicitStandaloneSectionTitle(section, entries),
    );

    return [
      preserveToolcraftInternalControlSectionRegistration(
        section,
        normalizedSection,
      ),
    ];
  }

  if (entries.length <= 1) {
    const normalizedSection = addAutoLayoutGroupsToSection(
      withImplicitStandaloneSectionTitle(section, entries),
    );

    return [
      preserveToolcraftInternalControlSectionRegistration(
        section,
        normalizedSection,
      ),
    ];
  }

  const layouts = entries.map(([, control]) => getControlSectionLayout(control, entries));
  const uniqueLayouts = new Set(layouts);

  if (uniqueLayouts.size <= 1) {
    const normalizedSection = addAutoLayoutGroupsToSection(
      withImplicitStandaloneSectionTitle(section, entries),
    );

    return [
      preserveToolcraftInternalControlSectionRegistration(
        section,
        normalizedSection,
      ),
    ];
  }

  const normalizedSections: ResolvedToolcraftControlSectionSchema[] = [];
  let currentLayout = layouts[0];
  let currentEntries: [string, ResolvedToolcraftControlSchema][] = [];

  const pushCurrentSection = (): void => {
    if (!currentLayout || currentEntries.length === 0) {
      return;
    }

    const controlIds = new Set(currentEntries.map(([id]) => id));
    // Split children keep the authored parent identity and add a target-derived suffix.
    const id = deriveSplitToolcraftControlSectionId(section.id, currentEntries);

    if (currentLayout === "standalone") {
      const splitSection: ResolvedToolcraftControlSectionSchema = {
        controls: Object.fromEntries(currentEntries),
        id,
        layout: "standalone",
      };
      const titledSection = withImplicitStandaloneSectionTitle(
        splitSection,
        currentEntries,
      );

      normalizedSections.push(
        registerToolcraftInternalControlSection(titledSection),
      );
    } else {
      const splitSection = addAutoLayoutGroupsToSection({
        ...section,
        controls: Object.fromEntries(currentEntries),
        id,
        layoutGroups: filterLayoutGroupsForControlIds(section.layoutGroups, controlIds),
      });

      normalizedSections.push(
        registerToolcraftInternalControlSection(splitSection),
      );
    }
  };

  for (const [index, entry] of entries.entries()) {
    const layout = layouts[index] ?? "grouped";

    if (layout !== currentLayout) {
      pushCurrentSection();
      currentLayout = layout;
      currentEntries = [];
    }

    currentEntries.push(entry);
  }

  pushCurrentSection();

  return normalizedSections;
}
