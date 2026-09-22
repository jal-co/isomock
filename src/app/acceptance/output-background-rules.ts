import { getControlLabelText } from "./controls";
import {
  getSearchableControlText,
  type ToolcraftControlsSection,
  type ToolcraftOutputExportFacts,
} from "./output-export-model";
import type { ToolcraftVisibleControl } from "./types";

function schemaHasOutputBackgroundColorControl(
  controls: readonly ToolcraftVisibleControl[],
): boolean {
  return controls.some((visibleControl) => {
    const { control } = visibleControl;

    if (control.type !== "color") {
      return false;
    }

    return /\b(background|backdrop|scene|canvas)\b/i.test(
      getSearchableControlText(visibleControl),
    );
  });
}

function schemaHasOutputBackgroundToggleControl(
  controls: readonly ToolcraftVisibleControl[],
): boolean {
  return controls.some(isOutputBackgroundToggleControl);
}

export function isOutputBackgroundToggleControl(
  visibleControl: ToolcraftVisibleControl,
): boolean {
  const { control } = visibleControl;

  if (
    control.type !== "switch" &&
    control.type !== "checkbox" &&
    control.type !== "select" &&
    control.type !== "segmented"
  ) {
    return false;
  }

  return /\b(background|backdrop|transparent|transparency|alpha)\b/i.test(
    getSearchableControlText(visibleControl),
  );
}

function sectionHasEqualWidthBackgroundInfinityRow(
  section: ToolcraftControlsSection | undefined,
  backgroundControlId: string | undefined,
  infinityControlId: string | undefined,
): boolean {
  if (!section || !backgroundControlId || !infinityControlId) {
    return false;
  }

  return (section.layoutGroups ?? []).some(
    (layoutGroup) =>
      layoutGroup.layout === "inline" &&
      layoutGroup.columns === 2 &&
      layoutGroup.controls.length === 2 &&
      layoutGroup.controls[0] === backgroundControlId &&
      layoutGroup.controls[1] === infinityControlId,
  );
}

function getSectionControlOrder(
  section: ToolcraftControlsSection | undefined,
): readonly string[] {
  return section ? Object.keys(section.controls) : [];
}

export function getToolcraftOutputBackgroundErrors({
  controls,
  facts,
}: {
  controls: readonly ToolcraftVisibleControl[];
  facts: ToolcraftOutputExportFacts;
}): string[] {
  const errors: string[] = [];

  if (!schemaHasOutputBackgroundColorControl(controls)) {
    errors.push(
      "Product apps with artifact export must expose a user-facing background color control such as appearance.background or scene.background. Preview, image export, and video export must read that runtime value instead of hardcoding the product background.",
    );
  }

  if (!facts.backgroundColorEntry) {
    errors.push(
      'Runtime Setup must contain the renderer-owned background color control, such as appearance.background or scene.background.',
    );
  } else {
    const [, backgroundColorControl] = facts.backgroundColorEntry;

    if (getControlLabelText(backgroundColorControl) !== "Background color") {
      errors.push(
        'The background color control inside runtime Setup must use the visible label "Background color".',
      );
    }
  }

  if (!schemaHasOutputBackgroundToggleControl(controls)) {
    errors.push(
      'Product apps with artifact export must expose export.includeBackground in runtime Setup as a Switch labeled "Background". Runtime owns evaluated bounded/Infinity preview background and artifact export owns image alpha while preserving the background for opaque image formats and video.',
    );
  }

  if (!facts.includeBackgroundEntry) {
    errors.push(
      'Runtime Setup must contain export.includeBackground as the Background switch.',
    );
  } else {
    const [, includeBackgroundControl] = facts.includeBackgroundEntry;

    if (includeBackgroundControl.type !== "switch") {
      errors.push('export.includeBackground must be a Switch control labeled "Background".');
    }

    if (getControlLabelText(includeBackgroundControl) !== "Background") {
      errors.push(
        'export.includeBackground must use the visible label "Background" in runtime Setup.',
      );
    }
  }

  if (
    facts.infinityCanvasEntry &&
    !sectionHasEqualWidthBackgroundInfinityRow(
      facts.setupSection,
      facts.includeBackgroundEntry?.[0],
      facts.infinityCanvasEntry[0],
    )
  ) {
    errors.push(
      "Runtime Setup must render Background and Infinity canvas in one two-column inline layoutGroup, with Background on the left.",
    );
  }

  const setupControlOrder = getSectionControlOrder(facts.setupSection);
  const includeIndex = facts.includeBackgroundEntry
    ? setupControlOrder.indexOf(facts.includeBackgroundEntry[0])
    : -1;
  const infinityIndex = facts.infinityCanvasEntry
    ? setupControlOrder.indexOf(facts.infinityCanvasEntry[0])
    : includeIndex;
  const colorIndex = facts.backgroundColorEntry
    ? setupControlOrder.indexOf(facts.backgroundColorEntry[0])
    : -1;
  const aspectRatioIndex = setupControlOrder.findIndex(
    (controlId) =>
      facts.setupSection?.controls[controlId]?.target === "canvas.aspectRatio",
  );

  if (
    includeIndex >= 0 &&
    colorIndex >= 0 &&
    (colorIndex !== Math.max(includeIndex, infinityIndex) + 1 ||
      (aspectRatioIndex >= 0 && colorIndex >= aspectRatioIndex))
  ) {
    errors.push(
      "Runtime Setup must place Background color directly below the Background/Infinity row and before Aspect ratio.",
    );
  }

  return errors;
}
