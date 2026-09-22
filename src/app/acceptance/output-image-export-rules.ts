import { sectionHasInlineLayoutGroupForPair } from "./inline-layout";
import type { ToolcraftOutputExportFacts } from "./output-export-model";

export function getToolcraftImageExportErrors(
  facts: ToolcraftOutputExportFacts,
): string[] {
  const errors: string[] = [];
  const imageFormatControl = facts.imageFormatEntry?.[1];
  const imageResolutionControl = facts.imageResolutionEntry?.[1];
  const imageFormatOptionValues =
    imageFormatControl?.options?.map((option) => option.value.toLowerCase()) ?? [];
  const imageResolutionOptionValues =
    imageResolutionControl?.options?.map((option) => option.value.toLowerCase()) ?? [];

  if (!facts.imageExportSection) {
    errors.push(
      'Apps with Export PNG must expose image export settings in a separate controls section titled "Image Export" directly above sticky footer export actions or directly before "Video Export" when video export also exists.',
    );
  }

  if (!imageFormatControl) {
    errors.push(
      'The separate "Image Export" section must include a format control with target "export.image.format".',
    );
  } else {
    if (imageFormatControl.type !== "select") {
      errors.push(
        'Image Export format must be a Select control so it matches the Video Export settings structure.',
      );
    }

    if (!imageFormatOptionValues.includes("png") || !imageFormatOptionValues.includes("jpg")) {
      errors.push('Image Export format options must include "png" and "jpg".');
    }

    const expectedFormats = facts.hasSvgExportAction ? ["png", "jpg", "svg"] : ["png", "jpg"];
    if (imageFormatOptionValues.length !== expectedFormats.length ||
      !expectedFormats.every((format) => imageFormatOptionValues.includes(format))) {
      errors.push(`Image Export formats must match enabled capabilities exactly: ${expectedFormats.join(", ")}.`);
    }

    if (imageFormatControl.defaultValue !== "png") {
      errors.push('Image Export format must default to "png".');
    }
  }

  if (!imageResolutionControl) {
    errors.push(
      'The separate "Image Export" section must include a resolution control with target "export.image.resolution".',
    );
  } else {
    if (imageResolutionControl.type !== "select") {
      errors.push(
        'Image Export resolution must be a Select control so it matches the Video Export settings structure.',
      );
    }

    if (
      !imageResolutionOptionValues.includes("2k") ||
      !imageResolutionOptionValues.includes("4k") ||
      !imageResolutionOptionValues.includes("8k")
    ) {
      errors.push(
        'Image Export resolution options must include "2k", "4k", and "8k".',
      );
    }

    if (imageResolutionControl.defaultValue !== "4k") {
      errors.push('Image Export resolution must default to "4k".');
    }

    const applicability = imageResolutionControl.applicability;
    if (facts.hasSvgExportAction) {
      const predicate = applicability.mode === "conditional" && applicability.all.length === 1
        ? applicability.all[0] : undefined;
      if (!predicate || predicate.target !== "export.image.format" || !("oneOf" in predicate) ||
        predicate.oneOf?.length !== 2 || !["png", "jpg"].every((format) => predicate.oneOf?.includes(format))) {
        errors.push("Image Export resolution must be present only for PNG/JPG and absent for SVG.");
      }
    } else if (applicability.mode !== "always") {
      errors.push("Raster-only Image Export resolution must always be available.");
    }
  }

  const imageFormatControlId = facts.imageFormatEntry?.[0];
  const imageResolutionControlId = facts.imageResolutionEntry?.[0];
  const imageExportHasInlinePair =
    facts.imageExportSection === undefined ||
    imageFormatControlId === undefined ||
    imageResolutionControlId === undefined
      ? false
      : sectionHasInlineLayoutGroupForPair(
          facts.imageExportSection,
          imageFormatControlId,
          imageResolutionControlId,
        );

  if (!imageExportHasInlinePair) {
    errors.push(
      "Image Export format and resolution must render as one compact two-column inline row, matching Video Export settings.",
    );
  }

  return errors;
}
