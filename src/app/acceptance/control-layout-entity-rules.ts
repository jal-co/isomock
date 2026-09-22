import {
  getToolcraftFontPickerOwnedTypographyPart,
} from "./control-labels";
import type { ToolcraftControlLayoutFacts } from "./control-layout-model";
import { hasToolcraftInventoryEntityAgreement } from "./control-section-entity-cohesion";
import { getToolcraftSectionInventoryById } from "./control-section-inventory";
import { getControlLabelText } from "./controls";
import type { ToolcraftControlSectionInventoryEntry } from "./types";

function getToolcraftFontPickerOwnershipErrors(
  facts: ToolcraftControlLayoutFacts,
): string[] {
  const errors: string[] = [];
  const fontPickerControls = facts.visibleControls.filter(
    (item) => item.control.type === "fontPicker" && item.loosePrefix,
  );

  for (const item of facts.visibleControls) {
    if (!item.loosePrefix || item.control.type === "fontPicker") {
      continue;
    }

    const ownedTypographyPart =
      getToolcraftFontPickerOwnedTypographyPart(item.control);

    if (!ownedTypographyPart) {
      continue;
    }

    const owningFontPicker = fontPickerControls.find(
      (fontPicker) => fontPicker.loosePrefix === item.loosePrefix,
    );

    if (!owningFontPicker) {
      continue;
    }

    const label = getControlLabelText(item.control).trim() || item.controlId;

    errors.push(
      `${item.sectionLabel} / ${item.controlId} splits "${label}" out of the FontPicker-owned typography block for "${item.loosePrefix}". Keep font family, weight, size, case, letter spacing, line height, color, and opacity in the same fontPicker value.`,
    );
  }

  return errors;
}

function getToolcraftProductEntitySplitErrors({
  facts,
  sectionInventory,
}: {
  facts: ToolcraftControlLayoutFacts;
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[];
}): string[] {
  const errors: string[] = [];
  const sectionInventoryById = getToolcraftSectionInventoryById(sectionInventory);

  for (const [prefix, sections] of facts.strictPrefixSections) {
    if (
      sections.size > 1 &&
      !hasToolcraftInventoryEntityAgreement({ sectionInventoryById, sections })
    ) {
      const sectionLabels = [...sections].map(
        (sectionId) => facts.sectionLabelsById.get(sectionId) ?? sectionId,
      );
      errors.push(
        `Controls for target family "${prefix}" are split across sections: ${sectionLabels.join(", ")}. Assign one shared entityId when the sections edit one logical entity; the entity cohesion validator decides whether that split is allowed.`,
      );
    }
  }

  return errors;
}

function getToolcraftSeparatedColorPlacementErrors(
  facts: ToolcraftControlLayoutFacts,
): string[] {
  const errors: string[] = [];

  for (const [prefix, colorControlLabel] of facts.colorSectionLoosePrefixes) {
    const sections = facts.loosePrefixSections.get(prefix);

    if (sections && sections.size > 1) {
      errors.push(
        `${colorControlLabel} is separated from other "${prefix}" controls. A color that configures the same product entity belongs inside that entity section with a concise field label that stays unambiguous in context.`,
      );
    }
  }

  return errors;
}

export function getToolcraftControlEntityGroupingErrors({
  facts,
  sectionInventory,
}: {
  facts: ToolcraftControlLayoutFacts;
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[];
}): string[] {
  return [
    ...getToolcraftFontPickerOwnershipErrors(facts),
    ...getToolcraftProductEntitySplitErrors({ facts, sectionInventory }),
    ...getToolcraftSeparatedColorPlacementErrors(facts),
  ];
}
