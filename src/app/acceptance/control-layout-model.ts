import type {
  ResolvedToolcraftAppSchema,
  ResolvedToolcraftControlSchema,
} from "@/toolcraft/runtime";

import { isToolcraftProductSectionControl } from "./controls";
import { getToolcraftSectionLabel } from "./sections";
import {
  getToolcraftLooseTargetPrefix,
  getToolcraftStrictTargetPrefix,
  normalizeToolcraftSemanticText,
} from "./semantic";

export type ToolcraftControlLayoutControlEntry = {
  control: ResolvedToolcraftControlSchema;
  controlId: string;
  loosePrefix: string | null;
  sectionLabel: string;
  sectionId: string;
  sectionTitle: string | undefined;
};

export type ToolcraftControlLayoutSectionFact = {
  owner: "runtime" | "product";
  controls: readonly [string, ResolvedToolcraftControlSchema][];
  sectionLabel: string;
  sectionId: string;
  sectionLoosePrefixes: ReadonlySet<string>;
  sectionTitle: string | undefined;
};

export type ToolcraftControlLayoutFacts = {
  colorSectionLoosePrefixes: ReadonlyMap<string, string>;
  controlsByTarget: ReadonlyMap<string, ToolcraftControlLayoutControlEntry>;
  loosePrefixSections: ReadonlyMap<string, ReadonlySet<string>>;
  sectionTitleCounts: ReadonlyMap<string, { count: number; label: string }>;
  sectionLabelsById: ReadonlyMap<string, string>;
  sections: readonly ToolcraftControlLayoutSectionFact[];
  strictPrefixSections: ReadonlyMap<string, ReadonlySet<string>>;
  visibleControls: readonly ToolcraftControlLayoutControlEntry[];
};

function addSectionToPrefixMap(
  sectionMap: Map<string, Set<string>>,
  prefix: string | null,
  sectionId: string,
): void {
  if (!prefix) {
    return;
  }

  const sections = sectionMap.get(prefix) ?? new Set<string>();
  sections.add(sectionId);
  sectionMap.set(prefix, sections);
}

function updateSectionTitleCounts(
  sectionTitleCounts: Map<string, { count: number; label: string }>,
  sectionTitle: string | undefined,
): void {
  if (!sectionTitle) {
    return;
  }

  const normalizedSectionTitle = normalizeToolcraftSemanticText(sectionTitle);
  const titleCount = sectionTitleCounts.get(normalizedSectionTitle);
  sectionTitleCounts.set(normalizedSectionTitle, {
    count: (titleCount?.count ?? 0) + 1,
    label: titleCount?.label ?? sectionTitle,
  });
}

export function buildToolcraftControlLayoutFacts(
  schema: ResolvedToolcraftAppSchema,
  productModeTargets: ReadonlySet<string> = new Set(),
): ToolcraftControlLayoutFacts {
  const sections: ToolcraftControlLayoutSectionFact[] = [];
  const visibleControls: ToolcraftControlLayoutControlEntry[] = [];
  const strictPrefixSections = new Map<string, Set<string>>();
  const loosePrefixSections = new Map<string, Set<string>>();
  const colorSectionLoosePrefixes = new Map<string, string>();
  const sectionTitleCounts = new Map<string, { count: number; label: string }>();
  const controlsByTarget = new Map<string, ToolcraftControlLayoutControlEntry>();
  const sectionLabelsById = new Map<string, string>();

  for (const [sectionIndex, section] of (schema.panels.controls?.sections ?? []).entries()) {
    const sectionTitle = section.title?.trim();
    const sectionLabel = getToolcraftSectionLabel(sectionTitle, sectionIndex);
    const controls = Object.entries(section.controls).filter(([, control]) =>
      isToolcraftProductSectionControl(control),
    );

    if (controls.length === 0) {
      continue;
    }

    const owner = section.id.startsWith("runtime.") ? "runtime" : "product";
    if (owner === "product") updateSectionTitleCounts(sectionTitleCounts, sectionTitle);
    sectionLabelsById.set(section.id, sectionLabel);

    const sectionLoosePrefixes = new Set(
      controls
        .map(([, control]) => productModeTargets.has(control.target) ? null : getToolcraftLooseTargetPrefix(control.target))
        .filter((prefix): prefix is string => Boolean(prefix)),
    );
    const isColorOnlySection = controls.every(
      ([, control]) => control.type === "color",
    );

    sections.push({
      controls,
      owner,
      sectionLabel,
      sectionId: section.id,
      sectionLoosePrefixes,
      sectionTitle,
    });

    for (const [controlId, control] of controls) {
      // Application selectors govern entities; their target spelling is not entity ownership.
      const isProductMode = productModeTargets.has(control.target);
      const strictPrefix = isProductMode ? null : getToolcraftStrictTargetPrefix(control.target);
      const entry: ToolcraftControlLayoutControlEntry = {
        control,
        controlId,
        loosePrefix: isProductMode ? null : getToolcraftLooseTargetPrefix(control.target),
        sectionLabel,
        sectionId: section.id,
        sectionTitle,
      };

      visibleControls.push(entry);
      controlsByTarget.set(control.target, entry);
      addSectionToPrefixMap(strictPrefixSections, strictPrefix, section.id);
      addSectionToPrefixMap(loosePrefixSections, entry.loosePrefix, section.id);

      if (
        control.type === "color" &&
        isColorOnlySection &&
        entry.loosePrefix
      ) {
        colorSectionLoosePrefixes.set(entry.loosePrefix, `${sectionLabel} / ${controlId}`);
      }
    }
  }

  return {
    colorSectionLoosePrefixes,
    controlsByTarget,
    loosePrefixSections,
    sectionTitleCounts,
    sectionLabelsById,
    sections,
    strictPrefixSections,
    visibleControls,
  };
}
