import type { ToolcraftControlSchema } from "../schema/types";
import type { ToolcraftGpuTechniqueSurfaces } from "../rendering";
import type {
  AnyToolcraftRendererPipelineRegistration,
  ToolcraftPipelineInteraction,
  ToolcraftRendererPipeline,
} from "../rendering/renderer-pipeline-registration";
import type { ToolcraftPerformanceFixtureAdapterRegistry } from "./performance-fixture-adapter-types";
import type {
  ToolcraftWorkloadEnvelope,
} from "./performance-workload-types";

export type {
  AnyToolcraftRendererPipelineRegistration,
  ToolcraftInteractionInvalidation,
  ToolcraftPipelineInteraction,
  ToolcraftRenderPass,
  ToolcraftRenderPassKind,
  ToolcraftRenderPassOutput,
  ToolcraftRenderPassQuality,
  ToolcraftRenderPassRunLocation,
  ToolcraftRendererPipeline,
} from "../rendering/renderer-pipeline-registration";

export type {
  ToolcraftPerformanceContinuousFixtureAdapter,
  ToolcraftPerformanceDiscreteAppliedValue,
  ToolcraftPerformanceDiscreteFixtureAdapter,
  ToolcraftPerformanceDiscreteFixtureDomain,
  ToolcraftPerformanceDiscreteFixtureEntry,
  ToolcraftPerformanceFixtureAdapter,
  ToolcraftPerformanceFixtureAdapterRegistry,
  ToolcraftPerformanceFixtureInverseCheckpoint,
} from "./performance-fixture-adapter-types";

export type ToolcraftOutputCompletionEvidence = "clipboard" | "download";

export type ToolcraftPerformanceCoverage = {
  automated: boolean;
  automatedTestName: string;
  browser: boolean;
  browserTestName: string;
};

export type ToolcraftPerformanceValueSet = {
  default: unknown;
  max?: unknown;
  min?: unknown;
};

export type ToolcraftPerformanceCompiledFixtureCheckpointKind =
  | "development"
  | "interactive-max"
  | "batch-max";

export type ToolcraftPerformanceCompiledFixtureCheckpoint = {
  kind: ToolcraftPerformanceCompiledFixtureCheckpointKind;
  normalizedPressure: number;
  values: Readonly<Record<string, number>>;
};

export type ToolcraftPerformanceCompiledDevelopment =
  | {
      checkpoint: ToolcraftPerformanceCompiledFixtureCheckpoint & {
        kind: "development";
      };
      status: "available";
    }
  | {
      reason: string;
      status: "unavailable";
    };

type ToolcraftPerformanceCompiledFixturePlanBase = {
  development: ToolcraftPerformanceCompiledDevelopment;
  dimensionIds: readonly string[];
  pathId: string;
};

export type ToolcraftPerformanceCompiledInteractiveFixturePlan =
  ToolcraftPerformanceCompiledFixturePlanBase & {
    kind: "interactive";
    maximum: ToolcraftPerformanceCompiledFixtureCheckpoint & {
      kind: "interactive-max";
    };
  };

export type ToolcraftPerformanceCompiledBatchFixturePlan =
  ToolcraftPerformanceCompiledFixturePlanBase & {
    kind: "batch";
    maximum: ToolcraftPerformanceCompiledFixtureCheckpoint & {
      kind: "batch-max";
    };
  };

export type ToolcraftPerformanceCompiledFixturePlan =
  | ToolcraftPerformanceCompiledInteractiveFixturePlan
  | ToolcraftPerformanceCompiledBatchFixturePlan;

export type ToolcraftPerformanceExecutedFixtureCheckpoint =
  ToolcraftPerformanceCompiledFixtureCheckpoint & {
    applied: Readonly<Record<string, unknown>>;
    observed: Readonly<Record<string, number>>;
  };

type ToolcraftPerformanceScenarioBase = ToolcraftPerformanceCoverage & {
  controlLabel?: string;
  coversTargets: readonly string[];
  expectedObservable: string;
  fixture: string;
  id: string;
  pathId: string;
  target?: string;
  uiSelector?: string;
};

type ToolcraftExportPerformanceScenario = ToolcraftPerformanceScenarioBase & {
  actionValue: string;
  completionEvidence: ToolcraftOutputCompletionEvidence;
  completionDeadlineMs?: number;
  controlLabel: string;
  interaction: "export";
};

type ToolcraftNonExportPerformanceScenario = ToolcraftPerformanceScenarioBase & {
  actionValue?: never;
  completionEvidence?: never;
  completionDeadlineMs?: never;
  interaction: Exclude<ToolcraftPipelineInteraction, "export">;
};

export type ToolcraftPerformanceScenario =
  | ToolcraftExportPerformanceScenario
  | ToolcraftNonExportPerformanceScenario;

export type ToolcraftRendererStrategy =
  | "none"
  | "dom"
  | "svg"
  | "canvas-2d"
  | "webgl"
  | "webgpu";

export type ToolcraftKernelBenchmarkDecision = {
  candidates: readonly ToolcraftRendererStrategy[];
  decision: string;
  id: string;
  selected: ToolcraftRendererStrategy;
};

export type ToolcraftSourceRepresentation =
  | "reference-runtime"
  | "dom-text"
  | "svg"
  | "canvas-2d"
  | "webgl-texture"
  | "webgpu-texture"
  | "image-media"
  | "video-media"
  | "procedural-data"
  | "mixed";

export type ToolcraftProductRepresentation =
  | "text"
  | "vector"
  | "pixel"
  | "video"
  | "mixed";

export type ToolcraftPreviewRenderer =
  | "dom"
  | "svg"
  | "canvas-2d"
  | "webgl"
  | "webgpu";

export type ToolcraftExportRenderer =
  | "none"
  | "dom"
  | "svg"
  | "canvas-2d"
  | "webgl"
  | "webgpu"
  | "media-recorder"
  | "webcodecs";

export type ToolcraftRendererLayerKind =
  | "background"
  | "product-foreground"
  | "editing-handles"
  | "export-composite";

export type ToolcraftRendererLayerContent =
  | "bitmap-media"
  | "composite"
  | "dense-pattern"
  | "geometry"
  | "handles"
  | "noise"
  | "shader"
  | "text";

export type ToolcraftRendererLayerPrimitiveCount = "low" | "medium" | "high";

export type ToolcraftRendererLayerExportMode =
  | "included"
  | "excluded"
  | "composited";

export type ToolcraftRendererLayer = {
  content: readonly ToolcraftRendererLayerContent[];
  exportMode: ToolcraftRendererLayerExportMode;
  id: string;
  intentionalRasterizationReason?: string;
  kind: ToolcraftRendererLayerKind;
  primitiveCount: ToolcraftRendererLayerPrimitiveCount;
  renderer: Exclude<ToolcraftRendererStrategy, "none">;
  uiSelector?: string;
};

export type ToolcraftRendererTechnique = {
  exportRenderer: ToolcraftExportRenderer;
  fidelityRisks: readonly string[];
  gpu?: ToolcraftGpuTechniqueSurfaces;
  intentionalRasterizationReason?: string;
  layers?: readonly ToolcraftRendererLayer[];
  performanceRisks: readonly string[];
  previewExportDifferenceReason?: string;
  previewRenderer: ToolcraftPreviewRenderer;
  productRepresentation: ToolcraftProductRepresentation;
  referenceRendererChangeReason?: string;
  rendererStrategy: ToolcraftRendererStrategy;
  sourceRepresentation: ToolcraftSourceRepresentation;
  whyNotAlternativeStrategies: readonly string[];
};

export type ToolcraftPerformanceConfigBase = {
  /** Product-owned numeric normalization adapters for non-numeric dimensions. */
  fixtureAdapters?: ToolcraftPerformanceFixtureAdapterRegistry;
  /** Pass-keyed decisions backed by protected current-source kernel receipts. */
  kernelBenchmarkDecisions?: readonly ToolcraftKernelBenchmarkDecision[];
  rendererPipeline?: ToolcraftRendererPipeline | AnyToolcraftRendererPipelineRegistration;
  rendererStrategy: ToolcraftRendererStrategy;
  rendererTechnique?: ToolcraftRendererTechnique;
  scenarios: readonly ToolcraftPerformanceScenario[];
  usesCustomRenderer: boolean;
  workloadEnvelope: ToolcraftWorkloadEnvelope;
};

export type ToolcraftPerformanceConfig = ToolcraftPerformanceConfigBase;
export type ToolcraftEnvelopePerformanceConfig = ToolcraftPerformanceConfig;

export function isToolcraftEnvelopePerformanceConfig(
  config: unknown,
): config is ToolcraftEnvelopePerformanceConfig {
  if (
    typeof config !== "object" ||
    config === null ||
    !Object.prototype.hasOwnProperty.call(config, "workloadEnvelope")
  ) {
    return false;
  }

  const envelope = (config as { workloadEnvelope?: unknown }).workloadEnvelope;

  return (
    typeof envelope === "object" &&
    envelope !== null &&
    !Array.isArray(envelope) &&
    Array.isArray((envelope as { dimensions?: unknown }).dimensions)
  );
}

export type ToolcraftPerformanceSensitiveControl = {
  control: ToolcraftControlSchema;
  controlId: string;
  target: string;
};

export type ToolcraftUnclassifiedPerformanceControl = {
  control: ToolcraftControlSchema;
  controlId: string;
  target: string;
};
