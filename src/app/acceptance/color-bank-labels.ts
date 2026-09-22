import type { ToolcraftControlSchema } from "@/toolcraft/runtime";

import {
  getControlLabelText,
  hasVisibleControlLabel,
} from "./controls";
import { getToolcraftLooseTargetPrefix } from "./semantic";

export function isToolcraftColorSectionTitle(sectionTitle: string | undefined): boolean {
  return /\b(colou?rs?|palette|palettes|shades?|accents?)\b/i.test(
    sectionTitle ?? "",
  );
}

function isToolcraftSequentialColorLabel(label: string): boolean {
  return /^colou?r\s+\d+$/i.test(label.trim());
}

function isToolcraftPaletteVariationTarget(target: string): boolean {
  return (
    /(?:^|\.)(?:palette|palettes|colou?rs?|shades?|accents?)\b/i.test(
      target,
    ) || /(?:^|\.)(?:accent|shade|colou?r)\d+\b/i.test(target)
  );
}

function isToolcraftSimplePaletteDistributionLabel(label: string): boolean {
  return /^(spread|mix|distribution)$/i.test(label.trim());
}

function isToolcraftGenericControlHelpDescription(description: string): boolean {
  return /^(adjusts?|changes?|chooses?|controls?|defines?|selects?|sets?|updates?)\b/i.test(
    description.trim(),
  );
}

export function isToolcraftObviousColorSectionControlDescription({
  control,
  description,
  label,
  sectionTitle,
}: {
  control: ToolcraftControlSchema;
  description: string;
  label: string;
  sectionTitle: string | undefined;
}): boolean {
  if (!isToolcraftColorSectionTitle(sectionTitle)) {
    return false;
  }

  if (
    (control.type === "color" || control.type === "colorOpacity") &&
    isToolcraftSequentialColorLabel(label)
  ) {
    return true;
  }

  return (
    isToolcraftSimplePaletteDistributionLabel(label) &&
    isToolcraftGenericControlHelpDescription(description)
  );
}

export function getToolcraftColorBankDescriptionError({
  control,
  controlId,
  sectionLabel,
  sectionTitle,
}: {
  control: ToolcraftControlSchema;
  controlId: string;
  sectionLabel: string;
  sectionTitle: string | undefined;
}): string | undefined {
  const description = control.description?.trim();

  if (!description) {
    return undefined;
  }

  if (
    !isToolcraftObviousColorSectionControlDescription({
      control,
      description,
      label: getControlLabelText(control).trim(),
      sectionTitle,
    })
  ) {
    return undefined;
  }

  return `${sectionLabel} / ${controlId} description adds a help icon to an obvious color-section control. Omit control.description when the section title and visible label already explain the setting.`;
}

export function getToolcraftColorBankLabelErrors({
  controls,
  sectionLabel,
  sectionTitle,
}: {
  controls: readonly [string, ToolcraftControlSchema][];
  sectionLabel: string;
  sectionTitle: string | undefined;
}): string[] {
  const colorControls = controls.filter(([, control]) => {
    if (control.type !== "color" && control.type !== "colorOpacity") {
      return false;
    }

    return true;
  });

  if (colorControls.length < 2) {
    return [];
  }

  const sequentialColorControls = colorControls.filter(([, control]) =>
    isToolcraftSequentialColorLabel(getControlLabelText(control)),
  );
  const errors = sequentialColorControls.map(([controlId, control]) => {
    const label = getControlLabelText(control).trim();

    return `${sectionLabel} / ${controlId} uses visible label "${label}" for one of multiple sibling colors. Set label: false when the colors form one shared bank, or use a distinct user-facing role such as Fill, Stroke, Background, Connector, or Object color.`;
  });

  const loosePrefixes = new Set(
    colorControls
      .map(([, control]) => getToolcraftLooseTargetPrefix(control.target))
      .filter((prefix): prefix is string => Boolean(prefix)),
  );

  if (loosePrefixes.size !== 1) {
    return errors;
  }

  const isPaletteVariationBank =
    colorControls.every(([, control]) =>
      isToolcraftPaletteVariationTarget(control.target),
    ) ||
    (isToolcraftColorSectionTitle(sectionTitle) &&
      sequentialColorControls.length > 0);

  if (!isPaletteVariationBank) {
    return errors;
  }

  const visibleColorControls = colorControls.filter(([, control]) =>
    hasVisibleControlLabel(control),
  );
  if (
    visibleColorControls.length > 0 &&
    visibleColorControls.length < colorControls.length
  ) {
    errors.push(
      `${sectionLabel} mixes labeled and unlabeled color items in one palette variation group. Decide label visibility for the whole group: omit all per-item labels when colors only add variety, or label every item only when each color has a distinct user-facing role.`,
    );
  }

  return errors;
}
