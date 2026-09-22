import {
  getToolcraftControlKeyframeCapability,
  resolveToolcraftAppCapabilities,
  type ResolvedToolcraftAppSchema,
  type ResolvedToolcraftControlSchema,
  type ToolcraftTimelineMode,
} from "@/toolcraft/runtime";

import { getRequiredToolcraftControlPartCoverage } from "./control-parts";
import {
  getBuiltInFitCheckErrors,
  isCustomToolcraftControl,
  requiredCustomControlCoverage,
} from "./custom-controls";
import { hasControlPartCoverage, hasCustomControlCoverage } from "./coverage";
import {
  isOutputBackgroundToggleControl,
  schemaHasPngExportPanelAction,
  schemaHasVideoExportPanelAction,
} from "./output-export";
import type {
  ToolcraftBackgroundOutputCoverage,
  ToolcraftComponentAcceptance,
  ToolcraftOrientationGizmoCoverage,
  ToolcraftProductReadiness,
} from "./types";

type ToolcraftCollectionItemKeyframeCoverageInput = Readonly<{
  control: ResolvedToolcraftControlSchema;
  coverage: readonly string[] | undefined;
  label: string;
  timelineMode: ToolcraftTimelineMode | null;
}>;

function getCollectionKeyframeFieldIds(
  control: ResolvedToolcraftControlSchema,
): string[] {
  return Object.entries(control.itemControls ?? {})
    .filter(([, field]) => field.keyframeable === true)
    .map(([fieldId]) => fieldId)
    .sort();
}

export function getToolcraftCollectionItemKeyframeCoverageErrors({
  control,
  coverage,
  label,
  timelineMode,
}: ToolcraftCollectionItemKeyframeCoverageInput): string[] {
  if (coverage !== undefined && control.type !== "collectionActions") {
    return [
      `${label} collectionItemKeyframeCoverage is owned only by collectionActions controls.`,
    ];
  }
  if (coverage !== undefined && timelineMode !== "keyframes") {
    return [
      `${label} collectionItemKeyframeCoverage requires timeline mode keyframes.`,
    ];
  }
  if (control.type !== "collectionActions" || timelineMode !== "keyframes") {
    return [];
  }

  const expectedFields = getCollectionKeyframeFieldIds(control);
  if (coverage !== undefined && expectedFields.length === 0) {
    return [
      `${label} collectionItemKeyframeCoverage requires at least one keyframeable item field.`,
    ];
  }
  if (expectedFields.length === 0) return [];

  const declaredFields = [...(coverage ?? [])].sort();
  return expectedFields.length !== declaredFields.length ||
    expectedFields.some((fieldId, index) => fieldId !== declaredFields[index])
    ? [
        `${label} must declare collectionItemKeyframeCoverage for exactly: ${expectedFields.join(", ")}.`,
      ]
    : [];
}

export function hasExactToolcraftCollectionItemKeyframeCoverage(
  input: ToolcraftCollectionItemKeyframeCoverageInput,
): boolean {
  return (
    input.coverage !== undefined &&
    getToolcraftCollectionItemKeyframeCoverageErrors(input).length === 0
  );
}

const requiredOrientationGizmoCoverage = [
  "axis-drag",
  "axis-snap",
  "canvas-miss-pan",
  "export-clean",
  "model-drag",
  "shared-pose-output",
  "undo-reset",
] as const satisfies readonly ToolcraftOrientationGizmoCoverage[];

function hasTypedCoverage<T extends string>(
  coverage: string | readonly T[] | undefined,
  allCoverageValue: string,
  required: readonly T[],
): boolean {
  return (
    coverage === allCoverageValue ||
    (Array.isArray(coverage) &&
      required.every((requiredItem) => coverage.includes(requiredItem)))
  );
}

export function getToolcraftOrientationGizmoCoverageErrors({
  entry,
  label,
}: Readonly<{
  entry: ToolcraftComponentAcceptance;
  label: string;
}>): string[] {
  return hasTypedCoverage<ToolcraftOrientationGizmoCoverage>(
    entry.orientationGizmoCoverage,
    "all-required-orientation-gizmo-behavior",
    requiredOrientationGizmoCoverage,
  )
    ? []
    : [
        `${label} must declare orientationGizmoCoverage for: ${requiredOrientationGizmoCoverage.join(", ")}.`,
      ];
}

function getControlAcceptanceEntryErrors({
  control,
  entry,
  label,
}: {
  control: ResolvedToolcraftControlSchema;
  entry: ToolcraftComponentAcceptance;
  label: string;
}): string[] {
  const errors: string[] = [];

  if (!entry.automated) {
    errors.push(`${label} must have automated acceptance coverage.`);
  }

  if (entry.browser === false) {
    errors.push(`${label} must have browser acceptance coverage.`);
  }

  if (!entry.expectedObservable.trim()) {
    errors.push(`${label} must describe a product-level observable.`);
  }

  if (!entry.automatedTestName.trim()) {
    errors.push(`${label} must point to an automated test name.`);
  }

  if (entry.componentType !== control.type) {
    errors.push(
      `${label} acceptance componentType must be "${control.type}", received "${entry.componentType}".`,
    );
  }

  return errors;
}

function getControlCustomErrors({
  control,
  entry,
  label,
}: {
  control: ResolvedToolcraftControlSchema;
  entry: ToolcraftComponentAcceptance;
  label: string;
}): string[] {
  const errors: string[] = [];
  const isCustomControl = isCustomToolcraftControl(control);

  if (
    isCustomControl &&
    !hasCustomControlCoverage(
      entry.customControlCoverage,
      requiredCustomControlCoverage,
    )
  ) {
    errors.push(
      `${label} is a custom control and must declare customControlCoverage for: ${requiredCustomControlCoverage.join(", ")}.`,
    );
  }

  if (isCustomControl) {
    errors.push(...getBuiltInFitCheckErrors(label, entry, control));
  }

  return errors;
}

function getControlEvidenceErrors({
  control,
  controlId,
  entry,
  label,
  schema,
  sectionTitle,
}: {
  control: ResolvedToolcraftControlSchema;
  controlId: string;
  entry: ToolcraftComponentAcceptance;
  label: string;
  schema: ResolvedToolcraftAppSchema;
  sectionTitle: string | undefined;
}): string[] {
  const errors: string[] = [];

  if (
    schemaHasPngExportPanelAction(schema) &&
    isOutputBackgroundToggleControl({ control, controlId, sectionTitle })
  ) {
    const requiredCoverage: ToolcraftBackgroundOutputCoverage[] = [
      "preview-hidden-when-excluded",
      "image-transparent-when-excluded",
      ...(resolveToolcraftAppCapabilities(schema).hasMedia
        ? (["finite-media-stacking"] as const)
        : []),
      ...(schema.canvas.sizing.mode === "editable-output"
        ? (["infinity-viewport-color-and-dependency"] as const)
        : []),
      ...(schemaHasVideoExportPanelAction(schema)
        ? (["video-background-preserved"] as const)
        : []),
    ];

    if (
      !hasTypedCoverage<ToolcraftBackgroundOutputCoverage>(
        entry.backgroundOutputCoverage,
        "all-required-background-output",
        requiredCoverage,
      )
    ) {
      errors.push(
        `${label} controls background inclusion and must declare backgroundOutputCoverage for: ${requiredCoverage.join(", ")}.`,
      );
    }
  }

  return errors;
}

function getControlPartAndRuntimeCoverageErrors({
  control,
  entry,
  label,
  layersEnabled,
  timelineMode,
}: {
  control: ResolvedToolcraftControlSchema;
  entry: ToolcraftComponentAcceptance;
  label: string;
  layersEnabled: boolean;
  timelineMode: ToolcraftTimelineMode | null;
}): string[] {
  const errors: string[] = [];
  const keyframeCapability = getToolcraftControlKeyframeCapability(control);
  const requiredControlParts = getRequiredToolcraftControlPartCoverage(control);

  if (
    !hasControlPartCoverage(entry.controlPartCoverage, requiredControlParts)
  ) {
    errors.push(
      `${label} must declare controlPartCoverage for every semantic value part: ${requiredControlParts.join(", ")}.`,
    );
  }

  if (timelineMode === "keyframes" && keyframeCapability.capable) {
    if (entry.timelineCoverage !== "keyframes") {
      errors.push(
        `${label} is keyframe-capable by Toolcraft control type and must have acceptance timelineCoverage "keyframes" proving its diamond creates/updates a keyframe row and changes evaluated output.`,
      );
    }
  }

  errors.push(
    ...getToolcraftCollectionItemKeyframeCoverageErrors({
      control,
      coverage: entry.collectionItemKeyframeCoverage,
      label,
      timelineMode,
    }),
  );

  return errors;
}

export function getControlAcceptanceCoverageErrors({
  acceptance,
  control,
  controlId,
  entry,
  label,
  layersEnabled,
  productReadiness,
  schema,
  sectionTitle,
  timelineMode,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  control: ResolvedToolcraftControlSchema;
  controlId: string;
  entry: ToolcraftComponentAcceptance;
  label: string;
  layersEnabled: boolean;
  productReadiness: ToolcraftProductReadiness;
  schema: ResolvedToolcraftAppSchema;
  sectionTitle: string | undefined;
  timelineMode: ToolcraftTimelineMode | null;
}): string[] {
  return [
    ...getControlAcceptanceEntryErrors({ control, entry, label }),
    ...getControlCustomErrors({
      control,
      entry,
      label,
    }),
    ...getControlEvidenceErrors({
      control,
      controlId,
      entry,
      label,
      schema,
      sectionTitle,
    }),
    ...getControlPartAndRuntimeCoverageErrors({
      control,
      entry,
      label,
      layersEnabled,
      timelineMode,
    }),
  ];
}
