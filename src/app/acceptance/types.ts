import type {
  ToolcraftBuiltInControlType as RuntimeToolcraftBuiltInControlType,
  ToolcraftControlOrderRole,
  ResolvedToolcraftControlSchema,
  ToolcraftPersistableStateSlice,
} from "@/toolcraft/runtime";
import { TOOLCRAFT_BUILT_IN_CONTROL_TYPES } from "@/toolcraft/runtime";
import type { ToolcraftExportRequestEvidence } from "./artifact-export-request-evidence";
import type {
  ToolcraftCanvasSizingCoverage,
  ToolcraftInfinityCanvasCoverage,
  ToolcraftInfinityOverflowCoverage,
  ToolcraftRenderScaleCoverage,
} from "./canvas-coverage";
import type { ToolcraftModelImportCoverage } from "./model-import-coverage";
import type { ToolcraftInteractionOwnershipEntry } from "./interaction-ownership-intent";
import type { ToolcraftMotionReferenceCoverage } from "./reference-study-types";
import type {
  ToolcraftReferenceCoverage,
  ToolcraftReferenceTimelineCoverage,
  ToolcraftTimelineLoopProof,
  ToolcraftTimelinePlaybackCoverage,
} from "./transfer-mode-types";
import type { ToolcraftViewInteractionIntent } from "./view-interaction-intent";
import type { ToolcraftBrowserProofBudget } from "./browser-proof-policy.mjs";

export { TOOLCRAFT_REQUIRED_MODEL_IMPORT_COVERAGE } from "./model-import-coverage";
export type { ToolcraftExportRequestEvidence } from "./artifact-export-request-evidence";
export type {
  ToolcraftCanvasSizingCoverage,
  ToolcraftInfinityCanvasCoverage,
  ToolcraftInfinityOverflowCoverage,
  ToolcraftRenderScaleCoverage,
  ToolcraftRenderScaleState,
} from "./canvas-coverage";
export type { ToolcraftModelImportCoverage } from "./model-import-coverage";
export type {
  ToolcraftInteractionCapability,
  ToolcraftInteractionEvidenceSource,
  ToolcraftInteractionOwnershipEntry,
  ToolcraftInteractionSurface,
} from "./interaction-ownership-intent";
export type {
  ToolcraftViewInteractionAuthority,
  ToolcraftViewInteractionIntent,
} from "./view-interaction-intent";
export type {
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
  ToolcraftReferenceFeatureInventoryItem,
  ToolcraftReferenceFeatureStatus,
  ToolcraftReferenceInput,
  ToolcraftReferenceStudyEvidence,
  ToolcraftReferenceStudyStatus,
} from "./reference-study-types";
export type {
  ToolcraftAnimationIntent,
  ToolcraftAutonomousAnimationCoverage,
  ToolcraftReferenceCoverage,
  ToolcraftReferenceTimelineContract,
  ToolcraftReferenceTimelineCoverage,
  ToolcraftReferenceTimelineMode,
  ToolcraftTimelineLoopDurationIntent,
  ToolcraftTimelineLoopDurationSource,
  ToolcraftTimelineLoopProof,
  ToolcraftTimelinePlaybackCoverage,
  ToolcraftTransferMode,
} from "./transfer-mode-types";

export type ToolcraftAcceptanceEvidence =
  | "command-side-effect"
  | "exported-bytes"
  | "media-lifecycle"
  | "persistence-state"
  | "product-output"
  | "rendered-pixels"
  | "timeline-output"
  | "viewport-side-effect";

export type ToolcraftExportArtifactCoverage =
  | "all-required-image-export-behavior"
  | "all-required-svg-export-behavior"
  | "all-required-video-export-behavior";

export type ToolcraftPersistenceCoverage = "reload";

export type ToolcraftSettingsTransferCoverage = "opt-out";

export type ToolcraftBrowserProof =
  | false
  | Readonly<{
      budget: ToolcraftBrowserProofBudget;
      file: `e2e/${string}.spec.ts`;
      testName: string;
    }>;

export type ToolcraftOrientationGizmoCoverage =
  | "axis-drag"
  | "axis-snap"
  | "canvas-miss-pan"
  | "export-clean"
  | "model-drag"
  | "shared-pose-output"
  | "undo-reset";

export type ToolcraftBackgroundOutputCoverage =
  | "finite-media-stacking"
  | "infinity-viewport-color-and-dependency"
  | "image-transparent-when-excluded"
  | "preview-hidden-when-excluded"
  | "video-background-preserved";

export type ToolcraftMediaLifecycleCoverage =
  | "default-remove"
  | "default-reset"
  | "flip"
  | "order-output"
  | "remove"
  | "reorder"
  | "reset"
  | "rotate"
  | "transform-output"
  | "upload";

export type ToolcraftLayerCoverage =
  | "grouping"
  | "media-lifecycle"
  | "reorder"
  | "selected-layer-controls"
  | "selection"
  | "visibility";

export type ToolcraftSelectionScopeCoverage = "two-entity-isolation";

export type ToolcraftControlPartCoverage =
  | "anchorGrid.position"
  | "channelMixer.activeChannel"
  | "channelMixer.values"
  | "collectionActions.add"
  | "collectionActions.items"
  | "collectionActions.remove"
  | "curves.activeChannel"
  | "curves.points"
  | "colorOpacity.hex"
  | "colorOpacity.opacity"
  | "fontPicker.color"
  | "fontPicker.fontId"
  | "fontPicker.fontSize"
  | "fontPicker.fontWeight"
  | "fontPicker.letterSpacing"
  | "fontPicker.lineHeight"
  | "fontPicker.opacity"
  | "fontPicker.textCase"
  | "gradient.angle"
  | "gradient.gradientType"
  | "gradient.stops.color"
  | "gradient.stops.opacity"
  | "gradient.stops.position"
  | "palette.family"
  | "palette.shade"
  | "rangeInput.end"
  | "rangeInput.start"
  | "rangeSlider.lower"
  | "rangeSlider.upper"
  | "sourceCollection.items"
  | "vector.x"
  | "vector.y";

export type ToolcraftCustomControlCoverage =
  | "built-in-gap"
  | "kit-primitives"
  | "minimal-ui"
  | "product-output"
  | "runtime-state";

export const builtInToolcraftControlTypeValues =
  TOOLCRAFT_BUILT_IN_CONTROL_TYPES;

export type ToolcraftBuiltInControlType = RuntimeToolcraftBuiltInControlType;

export type ToolcraftBuiltInFitCheck = {
  capabilities: readonly ToolcraftCustomControlCapability[];
  checkedBuiltIns: readonly ToolcraftBuiltInControlType[];
  closestBuiltIn: ToolcraftBuiltInControlType | "none";
  productObservable: string;
  whyInsufficient: string;
};

export type ToolcraftCustomControlCapability =
  | "collection"
  | "commands"
  | "custom-interaction"
  | "custom-value-model"
  | "custom-visualization"
  | "reorder"
  | "selection";

export type ToolcraftImageExportIntent =
  | Readonly<{ mode: "toolcraft-default" }>
  | Readonly<{ evidence: ToolcraftExportRequestEvidence; mode: "user-requested" }>
  | Readonly<{ evidence: ToolcraftExportRequestEvidence; mode: "user-removed" }>;

export type ToolcraftVideoExportIntent =
  | Readonly<{ mode: "not-requested" }>
  | Readonly<{ evidence: ToolcraftExportRequestEvidence; mode: "user-requested" }>;

export type ToolcraftSvgExportIntent =
  | Readonly<{ mode: "not-requested" }>
  | Readonly<{ evidence: ToolcraftExportRequestEvidence; mode: "user-requested" }>;

export type ToolcraftArtifactExportIntent = Readonly<{
  image: ToolcraftImageExportIntent;
  svg: ToolcraftSvgExportIntent;
  video: ToolcraftVideoExportIntent;
}>;

export type ToolcraftProductReadiness =
  | {
      mode: "starter";
      reason: string;
    }
  | {
      exportIntent: ToolcraftArtifactExportIntent;
      mode: "product";
      interactionOwnership: readonly ToolcraftInteractionOwnershipEntry[];
      productName: string;
      productSummary: string;
      requestedBehavior: string;
      viewInteraction: ToolcraftViewInteractionIntent;
    };

export type ToolcraftComponentAcceptance = {
  actionCoverage?: readonly string[];
  automated: boolean;
  automatedTestName: string;
  browser: ToolcraftBrowserProof;
  componentType: string;
  evidence: ToolcraftAcceptanceEvidence;
  exportArtifactCoverage?:
    | ToolcraftExportArtifactCoverage
    | readonly ToolcraftExportArtifactCoverage[];
  expectedObservable: string;
  fixture: string;
  id: string;
  interactionId?: string;
  canvasHandle?: {
    outputObservable: string;
    testId: string;
    writesTarget: string;
  };
  kind: "canvas-handle" | "control" | "runtime";
  canvasSizingCoverage?: ToolcraftCanvasSizingCoverage;
  infinityCanvasCoverage?: ToolcraftInfinityCanvasCoverage;
  infinityOverflowCoverage?: ToolcraftInfinityOverflowCoverage;
  layerCoverage?: ToolcraftLayerCoverage;
  mediaLifecycleCoverage?: readonly ToolcraftMediaLifecycleCoverage[];
  modelImportCoverage?:
    | "all-required-model-import-behavior"
    | readonly ToolcraftModelImportCoverage[];
  motionReferenceCoverage?: readonly ToolcraftMotionReferenceCoverage[];
  optionCoverage?: "each-visible-item" | readonly string[];
  orientationGizmoCoverage?:
    | "all-required-orientation-gizmo-behavior"
    | readonly ToolcraftOrientationGizmoCoverage[];
  persistenceCoverage?: ToolcraftPersistenceCoverage;
  persistenceSlices?: readonly ToolcraftPersistableStateSlice[];
  referenceCoverage?: ToolcraftReferenceCoverage;
  referenceTimelineCoverage?: ToolcraftReferenceTimelineCoverage;
  renderScaleCoverage?: ToolcraftRenderScaleCoverage;
  settingsTransferCoverage?: ToolcraftSettingsTransferCoverage;
  selectionScopeCoverage?: ToolcraftSelectionScopeCoverage;
  target?: string;
  timelineCoverage?: "keyframes" | "playback";
  timelinePlaybackCoverage?:
    | "all-playback-behavior"
    | readonly ToolcraftTimelinePlaybackCoverage[];
  timelineLoopProof?: ToolcraftTimelineLoopProof;
  controlPartCoverage?:
    | "all-visible-parts"
    | readonly ToolcraftControlPartCoverage[];
  customControlCoverage?:
    | "all-custom-control-behavior"
    | readonly ToolcraftCustomControlCoverage[];
  builtInFitCheck?: ToolcraftBuiltInFitCheck;
  backgroundOutputCoverage?:
    | "all-required-background-output"
    | readonly ToolcraftBackgroundOutputCoverage[];
  collectionItemKeyframeCoverage?: readonly string[];
  userAction: string;
};

export type ToolcraftVisibleControl = {
  control: ResolvedToolcraftControlSchema;
  controlId: string;
  sectionTitle?: string;
};

export type ToolcraftControlOrderItem = {
  controlId: string;
  rank: number;
  role: ToolcraftControlOrderRole;
  sectionTitle?: string;
  target: string;
  type: string;
};

export type { ToolcraftProductModeIntent } from "./product-mode-intent";

export type ToolcraftFiniteSelectorInventoryEntry =
  | Readonly<{
      affectedTargets: readonly string[];
      productMode?: import("./product-mode-intent").ToolcraftProductModeIntent;
      reason: string;
      role: "branch";
      target: string;
    }>
  | Readonly<{
      reason: string;
      role: "parameter";
      target: string;
    }>;

export type ToolcraftControlSectionInventoryEntry = {
  entity: string;
  entityId: string;
  finiteSelectors: readonly ToolcraftFiniteSelectorInventoryEntry[];
  groupingReason: string;
  id: string;
  splitReason?: string;
  targets: readonly string[];
  title: string;
  workflowStage?: string;
};
