import {
  defineToolcraftPerformance,
  type ToolcraftEnvelopePerformanceConfig,
} from "@/toolcraft/runtime";
import { appRendererPipelineRegistration } from "./feedback-pipeline-contract";
export {
  appRendererPipelineRegistration,
  exportPresentPass,
  exportSimulatePass,
  previewPresentPass,
  previewSimulatePass,
  resourcesPass,
} from "./feedback-pipeline-contract";
import {
  createPhysicalFeedbackPerformanceScenarios,
  derivePhysicalFeedbackPerformancePaths,
  physicalFeedbackFixtureAdapters,
  physicalFeedbackWorkloadEnvelope,
} from "./feedback-workload";
const vgpuSurface = {
  backend: "webgpu",
  capability: "shader-webgpu-vgpu",
  provider: "vgpu",
  versionPolicy: "app-pinned",
} as const;

const basePerformance = defineToolcraftPerformance({
  fixtureAdapters: physicalFeedbackFixtureAdapters,
  rendererPipeline: appRendererPipelineRegistration,
  rendererStrategy: "canvas-2d",
  rendererTechnique: {
    exportRenderer: "canvas-2d",
    fidelityRisks: [
      "Preview and export must reset and replay the feedback field from the same seed.",
    ],
    gpu: { export: vgpuSurface, preview: vgpuSurface },
    intentionalRasterizationReason:
      "The product is a physical pixel field whose storage-texture state is raster-native.",
    layers: [
      {
        content: ["shader"],
        exportMode: "included",
        id: "physicalField",
        kind: "product-foreground",
        primitiveCount: "high",
        renderer: "canvas-2d",
        uiSelector: 'canvas[data-toolcraft-vgpu-product=""]',
      },
    ],
    performanceRisks: [
      "Retina backing and deterministic feedback replay multiply storage-texture work.",
    ],
    previewExportDifferenceReason:
      "Preview presents retained offscreen VGPU target pixels through the typed target-readback Canvas2D adapter while export renders the same field through the provider-owned export target queue.",
    previewRenderer: "canvas-2d",
    productRepresentation: "pixel",
    rendererStrategy: "canvas-2d",
    sourceRepresentation: "procedural-data",
    whyNotAlternativeStrategies: [
      "WebGL cannot express this storage-texture feedback contract without a typed exception.",
      "Native WebGPU would bypass the approved provider lifecycle and deterministic Node adapter.",
    ],
  },
  scenarios: [],
  usesCustomRenderer: true,
  workloadEnvelope: physicalFeedbackWorkloadEnvelope,
} satisfies ToolcraftEnvelopePerformanceConfig);

const scenarios = createPhysicalFeedbackPerformanceScenarios(basePerformance);

export const appPerformance = defineToolcraftPerformance({
  ...basePerformance,
  scenarios,
});

export const appPerformancePaths = derivePhysicalFeedbackPerformancePaths(
  appPerformance,
);
