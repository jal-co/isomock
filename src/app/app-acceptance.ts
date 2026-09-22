import { appPerformance } from "./app-performance";
import {
  getToolcraftControlKeyframeCapability,
  type ResolvedToolcraftAppSchema,
} from "@/toolcraft/runtime";

import { getRequiredToolcraftControlPartCoverage } from "./acceptance/control-parts";
export type { ToolcraftExportRequestEvidence } from "./acceptance/types";
export {
  getToolcraftApplicabilitySelectorDomain,
  getToolcraftControlApplicabilityErrors,
  type ToolcraftApplicabilitySelectorDomain,
  type ToolcraftApplicabilitySelectorValue,
} from "./acceptance/control-applicability";
export {
  getToolcraftApplicabilityRequirementId,
  getToolcraftControlApplicabilityCases,
  type ToolcraftControlApplicabilityCase,
} from "./acceptance/control-applicability-cases";
import {
  createToolcraftFeatureVerificationSelection,
  type ToolcraftFeatureVerificationSelection,
  type ToolcraftFeatureVerificationRequest,
} from "./acceptance/feature-verification-selection";
import {
  getToolcraftControlOrder as getToolcraftControlOrderForSchema,
  getToolcraftControlOrderTargets as getToolcraftControlOrderTargetsForSchema,
  inferToolcraftControlOrderRole,
} from "./acceptance/control-order";
import type {
  ToolcraftAcceptanceEvidence,
  ToolcraftAnimationIntent,
  ToolcraftAutonomousAnimationCoverage,
  ToolcraftBuiltInControlType,
  ToolcraftBuiltInFitCheck,
  ToolcraftBackgroundOutputCoverage,
  ToolcraftCanvasSizingCoverage,
  ToolcraftComponentAcceptance,
  ToolcraftControlOrderItem,
  ToolcraftControlPartCoverage,
  ToolcraftControlSectionInventoryEntry,
  ToolcraftFiniteSelectorInventoryEntry,
  ToolcraftCustomControlCoverage,
  ToolcraftExportArtifactCoverage,
  ToolcraftLayerCoverage,
  ToolcraftInteractionCapability,
  ToolcraftInteractionEvidenceSource,
  ToolcraftInteractionOwnershipEntry,
  ToolcraftInteractionSurface,
  ToolcraftInfinityCanvasCoverage,
  ToolcraftInfinityOverflowCoverage,
  ToolcraftMediaLifecycleCoverage,
  ToolcraftModelImportCoverage,
  ToolcraftOrientationGizmoCoverage,
  ToolcraftMotionReferenceBehavior,
  ToolcraftMotionReferenceCoverage,
  ToolcraftMotionReferenceEvent,
  ToolcraftMotionReferenceEvidence,
  ToolcraftMotionReferenceEvidenceEvent,
  ToolcraftMotionReferenceInput,
  ToolcraftMotionReferenceOrdinalFrame,
  ToolcraftMotionReferencePhase,
  ToolcraftMotionReferenceSourceKind,
  ToolcraftMotionReferenceStudy,
  ToolcraftMotionReferenceTimedFrame,
  ToolcraftMotionReferenceTimingClaim,
  ToolcraftMotionReferenceTimingMode,
  ToolcraftPersistenceCoverage,
  ToolcraftProductReadiness,
  ToolcraftReferenceCoverage,
  ToolcraftReferenceFeatureInventoryItem,
  ToolcraftReferenceFeatureStatus,
  ToolcraftReferenceInput,
  ToolcraftReferenceStudyEvidence,
  ToolcraftReferenceStudyStatus,
  ToolcraftReferenceTimelineContract,
  ToolcraftReferenceTimelineCoverage,
  ToolcraftReferenceTimelineMode,
  ToolcraftRenderScaleCoverage,
  ToolcraftRenderScaleState,
  ToolcraftSettingsTransferCoverage,
  ToolcraftSelectionScopeCoverage,
  ToolcraftTimelineLoopDurationIntent,
  ToolcraftTimelineLoopDurationSource,
  ToolcraftTimelinePlaybackCoverage,
  ToolcraftTransferMode,
  ToolcraftViewInteractionAuthority,
  ToolcraftViewInteractionIntent,
  ToolcraftVisibleControl,
} from "./acceptance/types";
import { TOOLCRAFT_REQUIRED_MODEL_IMPORT_COVERAGE } from "./acceptance/types";
import {
  collectToolcraftVisibleAcceptanceControls,
  validateToolcraftAcceptanceDiagnostics as validateToolcraftAcceptanceDiagnosticsInput,
  validateToolcraftAcceptanceCoverage as validateToolcraftAcceptanceInput,
  type ToolcraftAcceptanceValidationInput,
} from "./acceptance/validate-coverage";
import type { ToolcraftAcceptanceDiagnostic } from "./acceptance/validation-pipeline";
import {
  appAcceptance,
  appControlSectionInventory,
  appProductReadiness,
  appTransferMode,
} from "./app-acceptance-data";
import { appSchema } from "./app-schema";

export {
  createToolcraftFeatureVerificationSelection,
  getRequiredToolcraftControlPartCoverage,
  inferToolcraftControlOrderRole,
  appAcceptance,
  appControlSectionInventory,
  appProductReadiness,
  appTransferMode,
  TOOLCRAFT_REQUIRED_MODEL_IMPORT_COVERAGE,
};
export type {
  ToolcraftAcceptanceEvidence,
  ToolcraftAcceptanceDiagnostic,
  ToolcraftAnimationIntent,
  ToolcraftAutonomousAnimationCoverage,
  ToolcraftBuiltInControlType,
  ToolcraftBuiltInFitCheck,
  ToolcraftBackgroundOutputCoverage,
  ToolcraftCanvasSizingCoverage,
  ToolcraftComponentAcceptance,
  ToolcraftControlOrderItem,
  ToolcraftControlPartCoverage,
  ToolcraftControlSectionInventoryEntry,
  ToolcraftFiniteSelectorInventoryEntry,
  ToolcraftCustomControlCoverage,
  ToolcraftExportArtifactCoverage,
  ToolcraftFeatureVerificationRequest,
  ToolcraftFeatureVerificationSelection,
  ToolcraftLayerCoverage,
  ToolcraftInteractionCapability,
  ToolcraftInteractionEvidenceSource,
  ToolcraftInteractionOwnershipEntry,
  ToolcraftInteractionSurface,
  ToolcraftInfinityCanvasCoverage,
  ToolcraftInfinityOverflowCoverage,
  ToolcraftMediaLifecycleCoverage,
  ToolcraftModelImportCoverage,
  ToolcraftOrientationGizmoCoverage,
  ToolcraftMotionReferenceBehavior,
  ToolcraftMotionReferenceCoverage,
  ToolcraftMotionReferenceEvent,
  ToolcraftMotionReferenceEvidence,
  ToolcraftMotionReferenceEvidenceEvent,
  ToolcraftMotionReferenceInput,
  ToolcraftMotionReferenceOrdinalFrame,
  ToolcraftMotionReferencePhase,
  ToolcraftMotionReferenceSourceKind,
  ToolcraftMotionReferenceStudy,
  ToolcraftMotionReferenceTimedFrame,
  ToolcraftMotionReferenceTimingClaim,
  ToolcraftMotionReferenceTimingMode,
  ToolcraftPersistenceCoverage,
  ToolcraftProductReadiness,
  ToolcraftReferenceCoverage,
  ToolcraftReferenceFeatureInventoryItem,
  ToolcraftReferenceFeatureStatus,
  ToolcraftReferenceInput,
  ToolcraftReferenceStudyEvidence,
  ToolcraftReferenceStudyStatus,
  ToolcraftReferenceTimelineContract,
  ToolcraftReferenceTimelineCoverage,
  ToolcraftReferenceTimelineMode,
  ToolcraftRenderScaleCoverage,
  ToolcraftRenderScaleState,
  ToolcraftSettingsTransferCoverage,
  ToolcraftSelectionScopeCoverage,
  ToolcraftTimelineLoopDurationIntent,
  ToolcraftTimelineLoopDurationSource,
  ToolcraftTimelinePlaybackCoverage,
  ToolcraftTransferMode,
  ToolcraftViewInteractionAuthority,
  ToolcraftViewInteractionIntent,
  ToolcraftVisibleControl,
};

export function createToolcraftFeaturePlanFromCurrentApp(
  request: ToolcraftFeatureVerificationRequest,
): ToolcraftFeatureVerificationSelection {
  return createToolcraftFeatureVerificationSelection({
    acceptance: appAcceptance,
    request,
    schema: appSchema,
    sectionInventory: appControlSectionInventory,
  });
}

export function validateToolcraftAcceptanceDiagnostics(
  input: ToolcraftAcceptanceValidationInput,
): ToolcraftAcceptanceDiagnostic[] {
  return validateToolcraftAcceptanceDiagnosticsInput(input);
}

export function collectToolcraftVisibleControls(
  schema: ResolvedToolcraftAppSchema = appSchema,
): ToolcraftVisibleControl[] {
  return collectToolcraftVisibleAcceptanceControls(schema);
}

export function collectToolcraftKeyframeableControls(
  schema: ResolvedToolcraftAppSchema = appSchema,
): ToolcraftVisibleControl[] {
  return collectToolcraftVisibleControls(schema).filter(
    ({ control }) => getToolcraftControlKeyframeCapability(control).capable,
  );
}

export function getToolcraftControlOrder(
  schema: ResolvedToolcraftAppSchema = appSchema,
): ToolcraftControlOrderItem[] {
  return getToolcraftControlOrderForSchema(schema);
}

export function getToolcraftControlOrderTargets(
  schema: ResolvedToolcraftAppSchema = appSchema,
): string[] {
  return getToolcraftControlOrderTargetsForSchema(schema);
}

function isToolcraftAcceptanceValidationInput(
  value: ToolcraftAcceptanceValidationInput | ResolvedToolcraftAppSchema,
): value is ToolcraftAcceptanceValidationInput {
  return (
    "acceptance" in value &&
    "productReadiness" in value &&
    "schema" in value &&
    "sectionInventory" in value &&
    "transferMode" in value
  );
}

export function validateToolcraftAcceptanceCoverage(
  input: ToolcraftAcceptanceValidationInput,
): string[];
export function validateToolcraftAcceptanceCoverage(
  schema?: ResolvedToolcraftAppSchema,
  acceptance?: readonly ToolcraftComponentAcceptance[],
  transferMode?: ToolcraftTransferMode,
  sectionInventory?: readonly ToolcraftControlSectionInventoryEntry[],
  productReadiness?: ToolcraftProductReadiness,
): string[];
export function validateToolcraftAcceptanceCoverage(
  inputOrSchema: ToolcraftAcceptanceValidationInput | ResolvedToolcraftAppSchema = appSchema,
  acceptance: readonly ToolcraftComponentAcceptance[] = appAcceptance,
  transferMode: ToolcraftTransferMode = appTransferMode,
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[] =
    appControlSectionInventory,
  productReadiness: ToolcraftProductReadiness = appProductReadiness,
): string[] {
  const input = isToolcraftAcceptanceValidationInput(inputOrSchema)
    ? inputOrSchema
    : {
        acceptance,
        productReadiness,
        rendererPipeline: appPerformance.rendererPipeline,
        schema: inputOrSchema,
        sectionInventory,
        transferMode,
      };

  return validateToolcraftAcceptanceInput(input);
}

export function validateProductAcceptanceCoverage(): string[] {
  return validateToolcraftAcceptanceCoverage({
    acceptance: appAcceptance,
    productReadiness: appProductReadiness,
    rendererPipeline: appPerformance.rendererPipeline,
    schema: appSchema,
    sectionInventory: appControlSectionInventory,
    transferMode: appTransferMode,
  });
}
