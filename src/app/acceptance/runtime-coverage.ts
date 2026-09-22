import type {
  ResolvedToolcraftAppSchema,
  ToolcraftPersistableStateSlice,
  ToolcraftTimelineMode,
} from "@/toolcraft/runtime";

import {
  hasTimelinePlaybackCoverage,
  hasTimelinePlaybackCoveragePart,
} from "./coverage";
import {
  schemaHasPngExportPanelAction,
  schemaHasSvgExportPanelAction,
  schemaHasVideoExportPanelAction,
} from "./output-export";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftLayerCoverage,
  ToolcraftTimelineLoopProof,
  ToolcraftTimelinePlaybackCoverage,
} from "./types";

const requiredLayerCoverage = [
  "selection",
  "visibility",
  "reorder",
  "grouping",
] satisfies readonly ToolcraftLayerCoverage[];

const requiredTimelinePlaybackCoverage = [
  "pause-resume",
  "scrub",
  "duration",
  "loop",
  "rendered-frame",
] satisfies readonly ToolcraftTimelinePlaybackCoverage[];

const requiredTimelineLoopProof = {
  direction: "forward-only",
  durationChange: "reproved-after-edit",
  reversePlayback: "forbidden",
  seam: "first-last-match",
} satisfies ToolcraftTimelineLoopProof;

export function getToolcraftLayerCoverageErrors({
  acceptance,
  layersEnabled,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  layersEnabled: boolean;
}): string[] {
  const errors: string[] = [];

  if (layersEnabled) {
    for (const coverage of requiredLayerCoverage) {
      const entry = acceptance.find(
        (acceptanceEntry) =>
          acceptanceEntry.kind === "runtime" &&
          acceptanceEntry.layerCoverage === coverage,
      );

      if (!entry) {
        errors.push(
          `panels.layers requires a runtime acceptance entry with layerCoverage "${coverage}" proving layer ${coverage} behavior.`,
        );
        continue;
      }

      if (!entry.automated || !entry.automatedTestName.trim()) {
        errors.push(
          `${entry.id} must have automated coverage proving layer ${coverage}.`,
        );
      }

      if (entry.browser === false) {
        errors.push(
          `${entry.id} must have browser coverage proving layer ${coverage}.`,
        );
      }

      if (!entry.expectedObservable.trim()) {
        errors.push(
          `${entry.id} must describe the observable layer behavior for "${coverage}".`,
        );
      }
    }
  } else {
    for (const entry of acceptance) {
      if (entry.layerCoverage) {
        errors.push(
          `${entry.id} declares layerCoverage "${entry.layerCoverage}" but panels.layers is not enabled.`,
        );
      }
    }
  }

  return errors;
}

export function getToolcraftTimelinePlaybackCoverageErrors({
  acceptance,
  timelineMode,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  timelineMode: ToolcraftTimelineMode | null;
}): string[] {
  const errors: string[] = [];

  if (!timelineMode) {
    return errors;
  }

  const playbackEntry = acceptance.find(
    (entry) =>
      entry.kind === "runtime" && entry.timelineCoverage === "playback",
  );

  if (!playbackEntry) {
    errors.push(
      `panels.timeline mode "${timelineMode}" requires a runtime acceptance entry with timelineCoverage "playback" proving pause, scrub, duration/loop, and rendered-frame behavior.`,
    );
    return errors;
  }

  if (
    !hasTimelinePlaybackCoverage(
      playbackEntry.timelinePlaybackCoverage,
      requiredTimelinePlaybackCoverage,
    )
  ) {
    errors.push(
      `${playbackEntry.id} timelineCoverage "playback" must declare timelinePlaybackCoverage for pause-resume, scrub, duration, loop, and rendered-frame. Duration coverage must prove renderer progress maps 0..state.timeline.durationSeconds, not a local fixed animation duration.`,
    );
    return errors;
  }

  if (
    hasTimelinePlaybackCoveragePart(
      playbackEntry.timelinePlaybackCoverage,
      "loop",
    ) &&
    (playbackEntry.timelineLoopProof?.direction !==
      requiredTimelineLoopProof.direction ||
      playbackEntry.timelineLoopProof.durationChange !==
        requiredTimelineLoopProof.durationChange ||
      playbackEntry.timelineLoopProof.reversePlayback !==
        requiredTimelineLoopProof.reversePlayback ||
      playbackEntry.timelineLoopProof.seam !== requiredTimelineLoopProof.seam)
  ) {
    errors.push(
      `${playbackEntry.id} timelinePlaybackCoverage "loop" must declare timelineLoopProof with forward-only direction, forbidden reverse playback, first-last-match seam, and reproved-after-edit duration behavior. Browser evidence still proves the real samples and seam.`,
    );
  }

  return errors;
}

export function getToolcraftTimelineKeyframeCoverageErrors({
  acceptance,
  timelineMode,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  timelineMode: ToolcraftTimelineMode | null;
}): string[] {
  if (timelineMode !== "keyframes") {
    return [];
  }

  const hasKeyframesCoverage = acceptance.some(
    (entry) =>
      entry.kind === "runtime" && entry.timelineCoverage === "keyframes",
  );

  if (hasKeyframesCoverage) {
    return [];
  }

  return [
    'panels.timeline mode "keyframes" requires a runtime acceptance entry with timelineCoverage "keyframes" proving expanded rows, diamonds, keyframe mutation, and renderer evaluation.',
  ];
}

export function getToolcraftCanvasSizingCoverageErrors({
  acceptance,
  schema,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  schema: ResolvedToolcraftAppSchema;
}): string[] {
  const errors: string[] = [];

  if (schema.canvas.sizing.mode === "fixed-output") {
    if (
      schemaHasPngExportPanelAction(schema) ||
      schemaHasSvgExportPanelAction(schema) ||
      schemaHasVideoExportPanelAction(schema)
    ) {
      errors.push(
        'Product/output apps with export actions must use canvas.sizing mode "editable-output" so Aspect ratio, Canvas width, and Canvas height are always available. Put reference, fixed-format, or user-requested dimensions in canvas.size as the initial value instead of hiding size controls with "fixed-output".',
      );
    }

    const fixedCanvasSizingEntry = acceptance.find(
      (entry) =>
        entry.kind === "runtime" &&
        entry.canvasSizingCoverage === "fixed-output-size",
    );

    if (!fixedCanvasSizingEntry) {
      errors.push(
        'canvas.sizing mode "fixed-output" requires a runtime acceptance entry with canvasSizingCoverage "fixed-output-size" explaining why width and height are intentionally non-editable. Product/output apps must use "editable-output"; user-provided, reference, fixed-format, or base/default sizes belong in canvas.size as editable initial values.',
      );
    } else {
      if (
        !fixedCanvasSizingEntry.automated ||
        !fixedCanvasSizingEntry.automatedTestName.trim()
      ) {
        errors.push(
          `${fixedCanvasSizingEntry.id} must have automated coverage proving fixed output dimensions.`,
        );
      }

      if (fixedCanvasSizingEntry.browser === false) {
        errors.push(
          `${fixedCanvasSizingEntry.id} must have browser coverage proving fixed output dimensions.`,
        );
      }
    }
  }

  if (
    schema.canvas.enabled &&
    schema.canvas.upload &&
    schema.canvas.sizing.mode === "intrinsic-media"
  ) {
    const intrinsicCanvasSizingEntry = acceptance.find(
      (entry) =>
        entry.kind === "runtime" &&
        entry.canvasSizingCoverage === "intrinsic-media-size",
    );

    if (!intrinsicCanvasSizingEntry) {
      errors.push(
        'canvas.sizing mode "intrinsic-media" with upload requires a runtime acceptance entry with canvasSizingCoverage "intrinsic-media-size" proving the app is a true media-viewer/source-native product where imported media natural dimensions intentionally own canvas.size. Uploaded background/source images inside product canvases must use "editable-output" and keep the current canvas size.',
      );
    } else {
      if (
        !intrinsicCanvasSizingEntry.automated ||
        !intrinsicCanvasSizingEntry.automatedTestName.trim()
      ) {
        errors.push(
          `${intrinsicCanvasSizingEntry.id} must have automated coverage proving intrinsic media sizing.`,
        );
      }

      if (intrinsicCanvasSizingEntry.browser === false) {
        errors.push(
          `${intrinsicCanvasSizingEntry.id} must have browser coverage proving intrinsic media sizing.`,
        );
      }
    }
  }

  return errors;
}

export type ToolcraftPersistenceCoverageResult = Readonly<{
  diagnostics: readonly string[];
  reloadCoverageValidated: boolean;
  validatedSlices: readonly ToolcraftPersistableStateSlice[];
}>;

function createPersistenceCoverageResult(
  diagnostics: readonly string[],
  validatedSlices: readonly ToolcraftPersistableStateSlice[] = [],
  reloadCoverageValidated = false,
): ToolcraftPersistenceCoverageResult {
  return Object.freeze({
    diagnostics: Object.freeze([...diagnostics]),
    reloadCoverageValidated,
    validatedSlices: Object.freeze([...validatedSlices]),
  });
}

export function getToolcraftPersistenceCoverageResult({
  acceptance,
  schema,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  schema: ResolvedToolcraftAppSchema;
}): ToolcraftPersistenceCoverageResult {
  const errors: string[] = [];

  if (schema.persistence.storage !== "localStorage") {
    return createPersistenceCoverageResult(errors);
  }

  const persistenceEntry = acceptance.find(
    (entry) =>
      entry.kind === "runtime" && entry.persistenceCoverage === "reload",
  );

  if (!persistenceEntry) {
    errors.push(
      'persistence.storage "localStorage" requires a runtime acceptance entry with persistenceCoverage "reload" proving user-edited persisted state restores after a real browser reload. Settings import/export is not a substitute for persistence.',
    );
    return createPersistenceCoverageResult(errors);
  }

  if (
    !persistenceEntry.automated ||
    !persistenceEntry.automatedTestName.trim()
  ) {
    errors.push(
      `${persistenceEntry.id} must have automated coverage proving persistence reload behavior.`,
    );
  }

  if (persistenceEntry.browser === false) {
    errors.push(
      `${persistenceEntry.id} must have browser coverage proving persistence reload behavior.`,
    );
  }

  if (!persistenceEntry.expectedObservable.trim()) {
    errors.push(
      `${persistenceEntry.id} must describe the persisted state observable after reload.`,
    );
  }

  if (persistenceEntry.evidence !== "persistence-state") {
    errors.push(
      `${persistenceEntry.id} must use evidence "persistence-state" for reload coverage.`,
    );
  }

  const expectedSlices = [...schema.persistence.include].sort();
  const declaredSlices = persistenceEntry.persistenceSlices;

  if (!declaredSlices) {
    errors.push(
      `${persistenceEntry.id} must declare persistenceSlices for every resolved persisted slice: ${expectedSlices.join(", ")}.`,
    );
  } else {
    const normalizedSlices = [...new Set(declaredSlices)].sort();
    const missingSlices = expectedSlices.filter(
      (slice) => !normalizedSlices.includes(slice),
    );
    const unexpectedSlices = normalizedSlices.filter(
      (slice) => !expectedSlices.includes(slice),
    );

    if (
      missingSlices.length > 0 ||
      unexpectedSlices.length > 0 ||
      normalizedSlices.length !== declaredSlices.length
    ) {
      const differences = [
        missingSlices.length > 0 ? `missing ${missingSlices.join(", ")}` : null,
        unexpectedSlices.length > 0
          ? `unexpected ${unexpectedSlices.join(", ")}`
          : null,
        normalizedSlices.length !== declaredSlices.length
          ? "duplicate slice declarations"
          : null,
      ].filter((difference) => difference !== null);

      errors.push(
        `${persistenceEntry.id} persistenceSlices must exactly match the resolved persistence plan (${expectedSlices.join(", ")}): ${differences.join("; ")}.`,
      );
    }
  }

  return createPersistenceCoverageResult(
    errors,
    errors.length === 0 ? expectedSlices : [],
    errors.length === 0,
  );
}
