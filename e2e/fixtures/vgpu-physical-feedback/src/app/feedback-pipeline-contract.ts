import {
  registerToolcraftRendererPipeline,
  type ToolcraftRendererPipelinePassContract,
} from "@/toolcraft/runtime";
import type {
  PhysicalFeedbackResource,
  PhysicalFeedbackSimulation,
} from "./pipeline";

type AppRendererPasses = {
  "export-present": ToolcraftRendererPipelinePassContract<void>;
  "export-simulate": ToolcraftRendererPipelinePassContract<PhysicalFeedbackSimulation>;
  "preview-present": ToolcraftRendererPipelinePassContract<void>;
  "preview-simulate": ToolcraftRendererPipelinePassContract<PhysicalFeedbackSimulation>;
  resources: ToolcraftRendererPipelinePassContract<
    PhysicalFeedbackResource,
    PhysicalFeedbackResource,
    readonly [string]
  >;
};

const previewPassIds = ["preview-simulate", "preview-present"] as const;
const exportPassIds = ["export-simulate", "export-present"] as const;

export const appRendererPipelineRegistration =
  registerToolcraftRendererPipeline<AppRendererPasses>()({
    interactionInvalidation: [
      { interaction: "initial-render", invalidates: ["resources", ...previewPassIds], targets: ["canvas.initial-render"] },
      { interaction: "control-drag", invalidates: previewPassIds, mustNotInvalidate: ["resources"], retainedAccesses: ["resources"], targets: ["simulation.impulse"] },
      {
        interaction: "control-change",
        invalidates: previewPassIds,
        mustNotInvalidate: ["resources"],
        retainedAccesses: ["resources"],
        targets: ["canvas.infinity", "canvas.aspectRatio", "canvas.size.width", "canvas.size.height", "canvas.renderScale"],
      },
      { interaction: "control-change", invalidates: ["resources", "preview-present"], preparationInvalidates: ["preview-simulate"], targets: ["simulation.enabled:disable"] },
      { interaction: "control-change", invalidates: ["resources", ...previewPassIds], targets: ["simulation.enabled:enable"] },
      { interaction: "control-change", invalidates: previewPassIds, mustNotInvalidate: ["resources"], retainedAccesses: ["resources"], targets: ["export.includeBackground"] },
      { interaction: "timeline-playback", invalidates: previewPassIds, mustNotInvalidate: ["resources"], retainedAccesses: ["resources"], targets: ["timeline.time"] },
      { interaction: "timeline-scrub", invalidates: previewPassIds, mustNotInvalidate: ["resources"], retainedAccesses: ["resources"], targets: ["timeline.time"] },
      { interaction: "viewport-drag", invalidates: previewPassIds, mustNotInvalidate: ["resources"], retainedAccesses: ["resources"], targets: ["canvas.viewport.offset"] },
      { interaction: "viewport-zoom", invalidates: previewPassIds, mustNotInvalidate: ["resources"], retainedAccesses: ["resources"], targets: ["canvas.viewport.zoom"] },
      { interaction: "export", invalidates: exportPassIds, mustNotInvalidate: ["resources"], retainedAccesses: ["resources"], targets: ["actions.output"] },
    ],
    passes: [
      {
        cacheKey: ["renderer.resources"],
        cost: { dimensions: [], frequency: "once", relationship: "constant" },
        gpu: { resources: "storage-textures", stage: "compute", state: "feedback", surfaces: ["preview", "export"] },
        id: "resources",
        inputs: ["renderer.resources"],
        invalidatedBy: ["renderer.resources"],
        kind: "preprocess",
        lifecycle: { cache: "retained-resource", resourceScope: "renderer" },
        output: "intermediate",
        quality: "full",
        runsOn: "gpu",
      },
      {
        cost: { dimensions: ["preview-pixels", "replay-steps"], frequency: "frame", relationship: "product" },
        gpu: { resources: "storage-textures", stage: "compute", state: "feedback", surfaces: ["preview"] },
        id: "preview-simulate",
        inputs: ["resources", "simulation.impulse", "timeline.time", "canvas.backing.width", "canvas.backing.height"],
        invalidatedBy: ["simulation.impulse", "timeline.time", "canvas.backing.width", "canvas.backing.height"],
        kind: "composite",
        lifecycle: { cache: "none", resourceScope: "call" },
        output: "intermediate",
        quality: "full",
        runsOn: "gpu",
      },
      {
        cost: { dimensions: ["preview-pixels"], frequency: "frame", relationship: "linear" },
        gpu: { resources: "sampled-textures", stage: "render", state: "stateless", surfaces: ["preview"] },
        id: "preview-present",
        inputs: ["preview-simulate", "destination.context"],
        invalidatedBy: ["preview-simulate", "destination.context"],
        kind: "composite",
        lifecycle: { cache: "none", resourceScope: "call" },
        output: "preview",
        quality: "retina",
        runsOn: "gpu",
      },
      {
        cost: { dimensions: ["export-pixels", "replay-steps"], frequency: "batch", relationship: "product" },
        gpu: { resources: "storage-textures", stage: "compute", state: "feedback", surfaces: ["export"] },
        id: "export-simulate",
        inputs: ["resources", "simulation.impulse", "timeline.time", "canvas.backing.width", "canvas.backing.height"],
        invalidatedBy: ["simulation.impulse", "timeline.time", "canvas.backing.width", "canvas.backing.height"],
        kind: "composite",
        lifecycle: { cache: "none", resourceScope: "call" },
        output: "intermediate",
        quality: "full",
        runsOn: "gpu",
      },
      {
        cost: { dimensions: ["export-pixels"], frequency: "batch", relationship: "linear" },
        gpu: { resources: "sampled-textures", stage: "render", state: "stateless", surfaces: ["export"] },
        id: "export-present",
        inputs: ["export-simulate", "destination.context"],
        invalidatedBy: ["export-simulate", "destination.context"],
        kind: "export",
        lifecycle: { cache: "none", resourceScope: "call" },
        output: "export",
        quality: "export",
        runsOn: "gpu",
      },
    ],
    runtimeId: "vgpu-physical-feedback-v1",
  });

export const resourcesPass = appRendererPipelineRegistration.getPass("resources");
export const previewPresentPass = appRendererPipelineRegistration.getPass("preview-present");
export const previewSimulatePass = appRendererPipelineRegistration.getPass("preview-simulate");
export const exportPresentPass = appRendererPipelineRegistration.getPass("export-present");
export const exportSimulatePass = appRendererPipelineRegistration.getPass("export-simulate");
