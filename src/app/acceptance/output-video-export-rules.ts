import { sectionHasInlineLayoutGroupForPair } from "./inline-layout";
import type { ToolcraftOutputExportFacts } from "./output-export-model";

function hasExactOptionValueSet(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    new Set(actual).size === expected.length &&
    expected.every((value) => actual.includes(value))
  );
}

export function getToolcraftVideoExportErrors(
  facts: ToolcraftOutputExportFacts,
): string[] {
  const errors: string[] = [];
  const videoFormatControl = facts.videoFormatEntry?.[1];
  const videoResolutionControl = facts.videoResolutionEntry?.[1];
  const videoFormatOptionValues =
    videoFormatControl?.options?.map((option) => option.value.toLowerCase()) ??
    [];
  const videoResolutionOptionValues =
    videoResolutionControl?.options?.map((option) =>
      option.value.toLowerCase(),
    ) ?? [];

  if (!facts.videoExportSection) {
    errors.push(
      'Apps with Export Video must expose video export settings in a separate controls section titled "Video Export" directly above sticky footer export actions.',
    );
  }

  if (!videoFormatControl) {
    errors.push(
      'The separate "Video Export" section must include a format control with target "export.video.format".',
    );
  } else {
    if (
      videoFormatControl.type !== "select" &&
      videoFormatControl.type !== "segmented"
    ) {
      errors.push("Video Export format must be a Select or Segmented control.");
    }

    if (!hasExactOptionValueSet(videoFormatOptionValues, ["mp4", "webm"])) {
      errors.push(
        'Video Export format options must be exactly "mp4" and "webm".',
      );
    }

    if (videoFormatControl.defaultValue !== "mp4") {
      errors.push('Video Export format must default to "mp4".');
    }
  }

  if (!videoResolutionControl) {
    errors.push(
      'The separate "Video Export" section must include a resolution control with target "export.video.resolution".',
    );
  } else {
    if (videoResolutionControl.type !== "select") {
      errors.push("Video Export resolution must be a Select control.");
    }

    if (
      !hasExactOptionValueSet(videoResolutionOptionValues, ["current", "4k"])
    ) {
      errors.push(
        'Video Export resolution options must be exactly "current" and "4k".',
      );
    }

    if (videoResolutionControl.defaultValue !== "current") {
      errors.push('Video Export resolution must default to "current".');
    }
  }

  const videoFormatControlId = facts.videoFormatEntry?.[0];
  const videoResolutionControlId = facts.videoResolutionEntry?.[0];
  const videoExportHasInlinePair =
    facts.videoExportSection !== undefined &&
    videoFormatControlId !== undefined &&
    videoResolutionControlId !== undefined &&
    sectionHasInlineLayoutGroupForPair(
      facts.videoExportSection,
      videoFormatControlId,
      videoResolutionControlId,
    );

  if (!videoExportHasInlinePair) {
    errors.push(
      "Video Export format and resolution must render as one exact two-column inline row.",
    );
  }

  return errors;
}
