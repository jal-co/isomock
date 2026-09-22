import type {
  ResolvedToolcraftAppSchema,
  ToolcraftPerformancePath,
} from "@/toolcraft/runtime";
import { resolveToolcraftAppCapabilities } from "@/toolcraft/runtime";

import { TOOLCRAFT_PERFORMANCE_PIPELINE_PHASES } from "../src/app/test-evidence/browser-performance-contract";
import type { ToolcraftBrowserRuntimeRequirement } from "../src/app/test-evidence/browser-runtime-contract";
import { schemaHasVideoExportPanelAction } from "../src/app/acceptance/output-export";
import { requiresToolcraftVectorScreenMotion } from "../src/app/acceptance/vector-screen-motion";
import type { ToolcraftOrientationGizmoCoverage } from "../src/app/acceptance/types";
import {
  getRequiredToolcraftControlPartCoverage,
  type ToolcraftBackgroundOutputCoverage,
  type ToolcraftComponentAcceptance,
  type ToolcraftControlSectionInventoryEntry,
  type ToolcraftInfinityCanvasCoverage,
  type ToolcraftExportArtifactCoverage,
  type ToolcraftModelImportCoverage,
  type ToolcraftTimelinePlaybackCoverage,
  TOOLCRAFT_REQUIRED_MODEL_IMPORT_COVERAGE,
} from "../src/app/app-acceptance";
import { expandToolcraftControlApplicabilityRequirements } from "./browser-runtime-applicability-requirements";
import { getToolcraftPerformancePathTestName } from "./performance-path-adapter-matrix";
import { hasExactToolcraftCollectionItemKeyframeCoverage } from "../src/app/acceptance/control-acceptance-coverage";

type BrowserAcceptanceRequirementSource = Pick<
  ToolcraftComponentAcceptance,
  | "browser"
  | "backgroundOutputCoverage"
  | "canvasHandle"
  | "controlPartCoverage"
  | "collectionItemKeyframeCoverage"
  | "evidence"
  | "exportArtifactCoverage"
  | "id"
  | "infinityCanvasCoverage"
  | "infinityOverflowCoverage"
  | "layerCoverage"
  | "modelImportCoverage"
  | "motionReferenceCoverage"
  | "orientationGizmoCoverage"
  | "referenceCoverage"
  | "referenceTimelineCoverage"
  | "renderScaleCoverage"
  | "selectionScopeCoverage"
  | "target"
  | "timelineCoverage"
  | "timelinePlaybackCoverage"
> & {
  kind?: ToolcraftComponentAcceptance["kind"];
};

function getAcceptanceEvidenceType(
  evidence: ToolcraftComponentAcceptance["evidence"],
): ToolcraftBrowserRuntimeRequirement["evidenceType"] | undefined {
  switch (evidence) {
    case "product-output":
    case "rendered-pixels":
    case "timeline-output":
      return "product-observable-change";
    case "exported-bytes":
      return "exported-artifact";
    case "command-side-effect":
    case "media-lifecycle":
    case "persistence-state":
    case "viewport-side-effect":
      return evidence;
    default:
      return undefined;
  }
}

const layerEvidenceTypeByCoverage = {
  grouping: "layer-grouping",
  "media-lifecycle": "layer-media-lifecycle",
  reorder: "layer-reorder",
  "selected-layer-controls": "layer-selected-layer-controls",
  selection: "layer-selection",
  visibility: "layer-visibility",
} as const satisfies Record<
  NonNullable<ToolcraftComponentAcceptance["layerCoverage"]>,
  ToolcraftBrowserRuntimeRequirement["evidenceType"]
>;

const timelineEvidenceTypeByCoverage = {
  duration: "timeline-duration",
  loop: "timeline-loop",
  "pause-resume": "timeline-pause-resume",
  "rendered-frame": "timeline-rendered-frame",
  scrub: "timeline-scrub",
} as const satisfies Record<
  ToolcraftTimelinePlaybackCoverage,
  ToolcraftBrowserRuntimeRequirement["evidenceType"]
>;

const timelinePlaybackCoverage = Object.keys(
  timelineEvidenceTypeByCoverage,
) as Array<keyof typeof timelineEvidenceTypeByCoverage>;

const backgroundOutputEvidenceTypeByCoverage = {
  "finite-media-stacking": "background-finite-media-stacking",
  "image-transparent-when-excluded": "background-image-transparency",
  "infinity-viewport-color-and-dependency": "background-infinity-viewport",
  "preview-hidden-when-excluded": "background-preview-exclusion",
  "video-background-preserved": "background-video-preserved",
} as const satisfies Record<
  ToolcraftBackgroundOutputCoverage,
  ToolcraftBrowserRuntimeRequirement["evidenceType"]
>;

const backgroundOutputCoverage = Object.keys(
  backgroundOutputEvidenceTypeByCoverage,
) as ToolcraftBackgroundOutputCoverage[];

const exportArtifactEvidenceTypeByCoverage = {
  "all-required-image-export-behavior": "image-export-artifact",
  "all-required-svg-export-behavior": "svg-export-artifact",
  "all-required-video-export-behavior": "video-export-artifact",
} as const satisfies Record<
  ToolcraftExportArtifactCoverage,
  ToolcraftBrowserRuntimeRequirement["evidenceType"]
>;

const orientationEvidenceTypeByCoverage = {
  "axis-drag": "orientation-axis-drag",
  "axis-snap": "orientation-axis-snap",
  "canvas-miss-pan": "orientation-canvas-miss-pan",
  "export-clean": "canvas-export-clean",
  "model-drag": "orientation-model-drag",
  "shared-pose-output": "orientation-shared-pose-output",
  "undo-reset": "orientation-undo-reset",
} as const satisfies Record<
  ToolcraftOrientationGizmoCoverage,
  ToolcraftBrowserRuntimeRequirement["evidenceType"]
>;

const orientationGizmoCoverage = Object.keys(
  orientationEvidenceTypeByCoverage,
) as ToolcraftOrientationGizmoCoverage[];

const infinityCanvasEvidenceTypeByCoverage = {
  "mode-continuity-and-restoration": "infinity-mode-continuity",
  "scene-bounds-image-export": "infinity-scene-bounds-image-export",
  "scene-bounds-svg-export": "infinity-scene-bounds-svg-export",
  "scene-bounds-video-export": "infinity-scene-bounds-video-export",
} as const satisfies Record<
  ToolcraftInfinityCanvasCoverage,
  ToolcraftBrowserRuntimeRequirement["evidenceType"]
>;

const modelImportEvidenceTypeByCoverage = {
  "advertised-format-import": "model-advertised-format-import",
  "appearance-preservation": "model-appearance-preservation",
  "clean-commit": "model-clean-commit",
  "deterministic-root-selection": "model-deterministic-root-selection",
  "export-output": "model-export-output",
  "fallback-appearance": "model-fallback-appearance",
  "fatal-rejection": "model-fatal-rejection",
  "history-reset": "model-history-reset",
  "package-extraction": "model-package-extraction",
  "persistence-restore": "model-persistence-restore",
  "pixel-output": "model-pixel-output",
  "presentation-consumer-readiness": "model-presentation-consumer-readiness",
  "preview-output": "model-preview-output",
  "repair-action": "model-repair-action",
  "repair-progress": "model-repair-progress",
  "repairable-diagnosis": "model-repairable-diagnosis",
  "resource-unavailable": "model-resource-unavailable",
  "staged-preview": "model-staged-preview",
  "verified-repair": "model-verified-repair",
} as const satisfies Record<
  ToolcraftModelImportCoverage,
  ToolcraftBrowserRuntimeRequirement["evidenceType"]
>;

function deriveUnqualifiedToolcraftBrowserRuntimeRequirements(
  acceptance: readonly BrowserAcceptanceRequirementSource[],
  schema?: ResolvedToolcraftAppSchema,
): ToolcraftBrowserRuntimeRequirement[] {
  const controlsByTarget = new Map(
    (schema?.panels.controls?.sections ?? []).flatMap((section) =>
      Object.values(section.controls).flatMap((control) =>
        control.target ? [[control.target, control] as const] : [],
      ),
    ),
  );

  return acceptance.flatMap((entry) => {
    if (entry.browser === false) return [];
    const browserProofTestName = entry.browser.testName;

    const target = entry.target ?? entry.canvasHandle?.writesTarget;
    const control = target ? controlsByTarget.get(target) : undefined;
    const hasOrientationCoverage = entry.orientationGizmoCoverage !== undefined;
    const evidenceTypes: ToolcraftBrowserRuntimeRequirement["evidenceType"][] =
      [];
    if (control && requiresToolcraftVectorScreenMotion(control)) {
      evidenceTypes.push("vector-screen-motion");
    }
    const baseEvidenceType = getAcceptanceEvidenceType(entry.evidence);
    const exportArtifactCoverage = entry.exportArtifactCoverage
      ? typeof entry.exportArtifactCoverage === "string"
        ? [entry.exportArtifactCoverage]
        : entry.exportArtifactCoverage
      : [];
    if (
      baseEvidenceType &&
      entry.renderScaleCoverage === undefined &&
      entry.infinityOverflowCoverage === undefined &&
      exportArtifactCoverage.length === 0
    ) {
      evidenceTypes.push(baseEvidenceType);
    }
    for (const coverage of exportArtifactCoverage) {
      evidenceTypes.push(exportArtifactEvidenceTypeByCoverage[coverage]);
    }

    if (entry.canvasHandle && !hasOrientationCoverage) {
      evidenceTypes.push("canvas-handle-interaction");
    }
    if (entry.timelineCoverage === "keyframes") {
      evidenceTypes.push("timeline-keyframes");
    }
    if (entry.timelineCoverage === "playback") {
      const coverage =
        entry.timelinePlaybackCoverage === "all-playback-behavior"
          ? timelinePlaybackCoverage
          : (entry.timelinePlaybackCoverage ?? []);
      evidenceTypes.push(
        ...coverage.map((item) => timelineEvidenceTypeByCoverage[item]),
      );
    }
    if (entry.layerCoverage) {
      evidenceTypes.push(layerEvidenceTypeByCoverage[entry.layerCoverage]);
    }
    if (entry.selectionScopeCoverage === "two-entity-isolation") {
      evidenceTypes.push("selection-scoped-control");
    }
    if (entry.infinityCanvasCoverage) {
      evidenceTypes.push(
        infinityCanvasEvidenceTypeByCoverage[entry.infinityCanvasCoverage],
      );
    }
    if (entry.infinityOverflowCoverage) {
      evidenceTypes.push("infinity-output-overflow");
    }
    if (
      entry.referenceCoverage ||
      entry.referenceTimelineCoverage ||
      (entry.motionReferenceCoverage?.length ?? 0) > 0
    ) {
      evidenceTypes.push("reference-parity");
    }
    const backgroundCoverage =
      entry.backgroundOutputCoverage === "all-required-background-output"
        ? backgroundOutputCoverage.filter(
            (item) =>
              (item !== "video-background-preserved" ||
                (schema ? schemaHasVideoExportPanelAction(schema) : false)) &&
              (item !== "infinity-viewport-color-and-dependency" ||
                schema?.canvas.sizing.mode === "editable-output") &&
              (item !== "finite-media-stacking" ||
                (schema
                  ? resolveToolcraftAppCapabilities(schema).hasMedia
                  : false)),
          )
        : (entry.backgroundOutputCoverage ?? []);
    evidenceTypes.push(
      ...backgroundCoverage.map(
        (item) => backgroundOutputEvidenceTypeByCoverage[item],
      ),
    );

    if (control?.type === "segmented") {
      evidenceTypes.push("segmented-control-layout");
    }
    if (
      (control?.type === "slider" || control?.type === "rangeSlider") &&
      control.variant === "discrete"
    ) {
      evidenceTypes.push("discrete-slider-layout");
    }

    const requirements = [...new Set(evidenceTypes)].map((evidenceType) => ({
      evidenceType,
      requirementId: entry.id,
      target,
      testName: browserProofTestName,
    }));
    const validCollectionCoverage =
      control &&
      hasExactToolcraftCollectionItemKeyframeCoverage({
        control,
        coverage: entry.collectionItemKeyframeCoverage,
        label: entry.id,
        timelineMode:
          schema?.panels.timeline?.enabled === true
            ? schema.panels.timeline.mode
            : null,
      });
    requirements.push(
      ...(validCollectionCoverage
        ? (entry.collectionItemKeyframeCoverage ?? [])
        : []
      ).map((fieldId) => ({
        evidenceType: "timeline-keyframes" as const,
        requirementId: `${entry.id}:${fieldId}`,
        target,
        testName: browserProofTestName,
      })),
    );

    for (const state of entry.renderScaleCoverage?.states ?? []) {
      requirements.push({
        evidenceType: "canvas-render-scale-backing",
        requirementId: `${entry.id}#${state}`,
        target,
        testName: browserProofTestName,
      });
    }

    const orientationCoverage: readonly ToolcraftOrientationGizmoCoverage[] =
      entry.orientationGizmoCoverage ===
      "all-required-orientation-gizmo-behavior"
        ? orientationGizmoCoverage
        : (entry.orientationGizmoCoverage ?? []);
    for (const item of orientationCoverage) {
      requirements.push({
        evidenceType: orientationEvidenceTypeByCoverage[item],
        requirementId: `${entry.id}#${item}`,
        target,
        testName: browserProofTestName,
      });
    }
    const modelImportCoverage =
      entry.modelImportCoverage === "all-required-model-import-behavior"
        ? TOOLCRAFT_REQUIRED_MODEL_IMPORT_COVERAGE
        : (entry.modelImportCoverage ?? []);
    for (const item of modelImportCoverage) {
      requirements.push({
        evidenceType: modelImportEvidenceTypeByCoverage[item],
        requirementId: `${entry.id}#${item}`,
        target,
        testName: browserProofTestName,
      });
    }
    const controlParts =
      entry.controlPartCoverage === "all-visible-parts"
        ? control
          ? getRequiredToolcraftControlPartCoverage(control)
          : []
        : (entry.controlPartCoverage ?? []);
    for (const part of controlParts) {
      requirements.push({
        evidenceType: "compound-control-part",
        requirementId: `${entry.id}#${part}`,
        target: entry.target,
        testName: browserProofTestName,
      });
    }
    if (entry.canvasHandle && !hasOrientationCoverage) {
      requirements.push({
        evidenceType: "canvas-export-clean",
        requirementId: entry.id,
        target: entry.canvasHandle.writesTarget,
        testName: browserProofTestName,
      });
    }
    return requirements;
  });
}

export function deriveToolcraftBrowserRuntimeRequirements(
  acceptance: readonly BrowserAcceptanceRequirementSource[],
  schema?: ResolvedToolcraftAppSchema,
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[] = [],
): ToolcraftBrowserRuntimeRequirement[] {
  return acceptance.flatMap((entry) => {
    const templates = deriveUnqualifiedToolcraftBrowserRuntimeRequirements(
      [entry],
      schema,
    );
    return expandToolcraftControlApplicabilityRequirements({
      entry: { ...entry, kind: entry.kind ?? "runtime" },
      schema,
      sectionInventory,
      templates,
    });
  });
}

const pathProductOutcomeInteractions = new Set<
  ToolcraftPerformancePath["interaction"]
>([
  "control-change",
  "control-drag",
  "mask-drag",
  "media-import",
  "timeline-playback",
  "timeline-scrub",
]);

export function deriveToolcraftPerformancePathRuntimeRequirements(
  paths: readonly ToolcraftPerformancePath[],
  schema: ResolvedToolcraftAppSchema,
): ToolcraftBrowserRuntimeRequirement[] {
  return paths.flatMap((path) => {
    const evidenceTypes: ToolcraftBrowserRuntimeRequirement["evidenceType"][] =
      ["performance-measurement", "performance-budget"];
    if (pathProductOutcomeInteractions.has(path.interaction)) {
      evidenceTypes.push("performance-product-outcome");
    }
    if (path.workloadDimensions.length > 0) {
      evidenceTypes.push("performance-compiled-fixture");
    }
    if (path.interaction === "export") {
      evidenceTypes.push("performance-output-completion");
    }
    if (
      path.interaction === "control-drag" ||
      path.interaction === "mask-drag"
    ) {
      evidenceTypes.push("performance-control-drag");
    }
    if (path.interaction === "animation-frame") {
      evidenceTypes.push("performance-animation-frames");
    }
    if (
      path.interaction === "viewport-drag" ||
      path.interaction === "viewport-zoom"
    ) {
      evidenceTypes.push("performance-viewport");
    }
    const target = path.targets.length === 1 ? path.targets[0] : undefined;
    const requirements = evidenceTypes.map((evidenceType) => ({
      evidenceType,
      requirementId: path.id,
      target,
      testName: getToolcraftPerformancePathTestName(path),
    }));
    if (schema.canvas.renderScale.enabled) {
      for (const phase of TOOLCRAFT_PERFORMANCE_PIPELINE_PHASES) {
        requirements.push({
          evidenceType: "performance-render-scale",
          requirementId: `${path.id}#${phase}`,
          target,
          testName: getToolcraftPerformancePathTestName(path),
        });
      }
    }
    return requirements;
  });
}
