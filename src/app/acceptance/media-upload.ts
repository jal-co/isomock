import type {
  ToolcraftControlSchema,
  ToolcraftPersistableStateSlice,
} from "@/toolcraft/runtime";

import {
  type ToolcraftComponentAcceptance,
  type ToolcraftProductReadiness,
  type ToolcraftVisibleControl,
} from "./types";
import { getControlAcceptanceByTarget } from "./control-acceptance-context";
import { getToolcraftModelImportCoverageErrors } from "./model-import-coverage";
import type { ToolcraftPersistenceCoverageResult } from "./runtime-coverage";

function hasLayersOwnedMediaManagement({
  acceptance,
  control,
  layersEnabled,
  productReadiness,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  control: ToolcraftControlSchema;
  layersEnabled: boolean;
  productReadiness: ToolcraftProductReadiness;
}): boolean {
  if (!layersEnabled || productReadiness.mode !== "product") {
    return false;
  }

  const ownershipById = new Map(
    productReadiness.interactionOwnership.map((entry) => [entry.id, entry] as const),
  );

  return acceptance.some((entry) => {
    const ownership = entry.interactionId
      ? ownershipById.get(entry.interactionId)
      : undefined;

    return (
      entry.kind === "runtime" &&
      entry.layerCoverage !== undefined &&
      entry.target === control.target &&
      ownership?.surface === "panel" &&
      ownership.target === control.target &&
      (ownership.capability === "collection-edit" ||
        ownership.capability === "structured-selection")
    );
  });
}

function hasSelectedLayerImageTransformCoverage(
  acceptance: readonly ToolcraftComponentAcceptance[],
): boolean {
  return acceptance.some((entry) => {
    const coverage = new Set(entry.mediaLifecycleCoverage ?? []);

    return (
      entry.kind === "runtime" &&
      entry.evidence === "media-lifecycle" &&
      entry.layerCoverage === "selected-layer-controls" &&
      coverage.has("rotate") &&
      coverage.has("flip") &&
      coverage.has("transform-output")
    );
  });
}

export type ToolcraftFileDropLifecycleCoverageInput = Readonly<{
  acceptance: readonly ToolcraftComponentAcceptance[];
  control: ToolcraftControlSchema;
  entry: ToolcraftComponentAcceptance;
  hasDefaultMediaAssets: boolean;
  label: string;
  layersEnabled: boolean;
  productReadiness: ToolcraftProductReadiness;
}>;

export type ToolcraftFileDropMediaLifecycleCoverageResult = Readonly<{
  lifecycleDiagnostics: readonly string[];
  orderingDiagnostics: readonly string[];
}>;

export function getFileDropMediaLifecycleCoverageResult({
  acceptance,
  control,
  entry,
  hasDefaultMediaAssets,
  label,
  layersEnabled,
  productReadiness,
}: ToolcraftFileDropLifecycleCoverageInput): ToolcraftFileDropMediaLifecycleCoverageResult {
  const lifecycleDiagnostics: string[] = [];
  const orderingDiagnostics: string[] = [];
  const coverage = new Set(entry.mediaLifecycleCoverage ?? []);
  const layersOwnMediaManagement = hasLayersOwnedMediaManagement({
    acceptance,
    control,
    layersEnabled,
    productReadiness,
  });

  if (entry.evidence !== "media-lifecycle") {
    lifecycleDiagnostics.push(
      `${label} fileDrop acceptance evidence must be "media-lifecycle" so upload, clear, and reset behavior cannot be replaced by generic product-output coverage.`,
    );
  }

  if (!coverage.has("upload") || !coverage.has("remove") || !coverage.has("reset")) {
    lifecycleDiagnostics.push(
      `${label} fileDrop acceptance must prove upload/import, clear/remove, and section or global reset restore default source media or remove uploaded source media when no default exists.`,
    );
  }

  if (hasDefaultMediaAssets) {
    if (!coverage.has("default-remove") || !coverage.has("default-reset")) {
      lifecycleDiagnostics.push(
        `${label} fileDrop acceptance must prove predefined media.defaultAssets render as attached files, can be removed to an empty source/canvas state, and are restored by section or global Reset.`,
      );
    }
  }

  if (control.assetKind === "image" && !layersOwnMediaManagement) {
    if (
      !coverage.has("rotate") ||
      !coverage.has("flip") ||
      !coverage.has("transform-output")
    ) {
      lifecycleDiagnostics.push(
        `${label} image fileDrop acceptance must prove rotate and flip actions update runtime media transform metadata and that preview, renderer, or export consumes the transform.`,
      );
    }
  }

  if (
    control.assetKind === "image" &&
    layersOwnMediaManagement &&
    !hasSelectedLayerImageTransformCoverage(acceptance)
  ) {
    lifecycleDiagnostics.push(
      `${label} Layers-owned image transforms require a runtime acceptance entry with layerCoverage "selected-layer-controls" and mediaLifecycleCoverage for rotate, flip, and transform-output.`,
    );
  }

  if (
    control.multiple === true &&
    control.variant !== "collection-actions" &&
    !layersOwnMediaManagement
  ) {
    if (!coverage.has("reorder") || !coverage.has("order-output")) {
      orderingDiagnostics.push(
        `${label} multiple fileDrop acceptance must prove thumbnail/file reorder updates runtime media order and that preview, renderer, or export consumes that order.`,
      );
    }
  }

  return Object.freeze({
    lifecycleDiagnostics: Object.freeze(lifecycleDiagnostics),
    orderingDiagnostics: Object.freeze(orderingDiagnostics),
  });
}

export function getFileDropMediaLifecycleCoverageErrors(
  input: ToolcraftFileDropLifecycleCoverageInput,
): string[] {
  const result = getFileDropMediaLifecycleCoverageResult(input);
  return [...result.lifecycleDiagnostics, ...result.orderingDiagnostics];
}

export function getFileDropLifecycleCoverageErrors(
  input: ToolcraftFileDropLifecycleCoverageInput,
): string[] {
  const mediaLifecycle = getFileDropMediaLifecycleCoverageResult(input);
  const modelImportDiagnostics = input.control.assetKind === "model"
    ? getToolcraftModelImportCoverageErrors({
        entry: input.entry,
        label: input.label,
      })
    : [];
  return [
    ...mediaLifecycle.lifecycleDiagnostics,
    ...modelImportDiagnostics,
    ...mediaLifecycle.orderingDiagnostics,
  ];
}

export function getToolcraftMediaSourceProofErrors({
  acceptance,
  capabilityActive,
  controls,
  layersEnabled,
  persistence,
  persistenceSlice,
  productReadiness,
  schema,
}: Readonly<{
  acceptance: readonly ToolcraftComponentAcceptance[];
  capabilityActive: boolean;
  controls: readonly ToolcraftVisibleControl[];
  layersEnabled: boolean;
  persistence: ToolcraftPersistenceCoverageResult;
  persistenceSlice: ToolcraftPersistableStateSlice;
  productReadiness: ToolcraftProductReadiness;
  schema: Readonly<{
    media: Readonly<{
      defaultAssets: readonly Readonly<{ sourceTarget?: string }>[];
    }>;
  }>;
}>): string[] {
  if (!capabilityActive) {
    return acceptance.flatMap((entry) =>
      entry.mediaLifecycleCoverage === undefined
        ? []
        : [
            `Acceptance "${entry.id}" claims media.source proof but that capability is absent.`,
          ],
    );
  }

  const fileDropControls = controls.filter(
    ({ control }) => control.type === "fileDrop",
  );
  const controlAcceptance = getControlAcceptanceByTarget(
    acceptance.filter((entry) => entry.kind === "control"),
  );
  const errors = fileDropControls.flatMap(
    ({ control, controlId, sectionTitle }) => {
      const label = `${sectionTitle ? `${sectionTitle} / ` : ""}${controlId} (${control.target})`;
      const entry = controlAcceptance.get(control.target);
      if (!entry) return [`${label} is missing media.source acceptance proof.`];

      return getFileDropMediaLifecycleCoverageErrors({
        acceptance,
        control,
        entry,
        hasDefaultMediaAssets: schema.media.defaultAssets.some(
          (asset) => asset.sourceTarget === control.target,
        ),
        label,
        layersEnabled,
        productReadiness,
      });
    },
  );

  if (fileDropControls.length === 0) {
    errors.push(
      "media.source requires a fileDrop acceptance row proving its media lifecycle.",
    );
  }

  if (
    !persistence.validatedSlices.includes(persistenceSlice) &&
    persistence.diagnostics.length === 0
  ) {
    errors.push(
      `media.source requires the prevalidated persistence reload fact for slice "${persistenceSlice}".`,
    );
  }

  return errors;
}
