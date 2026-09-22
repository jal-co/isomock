import {
  defineToolcraft,
  defineToolcraftPerformance,
  deriveToolcraftPerformancePaths,
  registerToolcraftRendererPipeline,
  type ToolcraftRendererPipelinePassContract,
} from "@/toolcraft/runtime";

export const pipelineEvidenceSchema = defineToolcraft({
  base: {
    identity: { id: "pipeline-evidence", title: "Pipeline evidence" },
    canvas: { enabled: true, sizing: { mode: "editable-output" } },
    panels: {
      controls: {
        sections: [
          {
            id: "effect",
            controls: {
              enabled: {
                applicability: { mode: "always" },
                defaultValue: true,
                label: "Field",
                performanceRole: "responsiveness",
                target: "simulation.enabled",
                type: "switch",
              },
              strength: {
                applicability: { mode: "always" },
                defaultValue: 0.5,
                label: "Strength",
                max: 1,
                min: 0,
                performanceRole: "responsiveness",
                target: "effect.strength",
                type: "slider",
              },
              mode: {
                applicability: { mode: "always" },
                defaultValue: "soft",
                label: "Mode",
                options: [
                  { label: "Soft", value: "soft" },
                  { label: "Hard", value: "hard" },
                ],
                performanceRole: "responsiveness",
                target: "effect.mode",
                type: "segmented",
              },
            },
            title: "Effect",
          },
        ],
        title: "Controls",
      },
    },
  },
  modules: [],
});

type PipelinePasses = {
  composite: ToolcraftRendererPipelinePassContract<void>;
  decode: ToolcraftRendererPipelinePassContract<
    void,
    Readonly<{ id: string }>,
    readonly [string]
  >;
  simulate: ToolcraftRendererPipelinePassContract<void>;
};

export const pipelineEvidenceRegistration =
  registerToolcraftRendererPipeline<PipelinePasses>()({
    interactionInvalidation: [
      {
        interaction: "initial-render",
        invalidates: ["composite"],
        mustNotInvalidate: ["decode"],
        targets: ["canvas.initial-render"],
      },
      {
        interaction: "animation-frame",
        invalidates: ["composite"],
        mustNotInvalidate: ["decode"],
        targets: ["runtime.animation-frame"],
      },
      {
        interaction: "control-drag",
        invalidates: ["composite"],
        mustNotInvalidate: ["decode", "simulate"],
        targets: ["effect.strength"],
      },
      {
        interaction: "media-import",
        invalidates: ["decode"],
        mustNotInvalidate: ["composite"],
        targets: ["source.id"],
      },
      {
        interaction: "control-change",
        invalidates: ["decode"],
        mustNotInvalidate: ["composite"],
        targets: ["effect.mode"],
      },
      {
        interaction: "control-change",
        invalidates: ["composite", "decode"],
        mustNotInvalidate: ["simulate"],
        preparationInvalidates: ["decode", "simulate"],
        targets: ["simulation.enabled:disable"],
      },
      {
        interaction: "viewport-zoom",
        invalidates: [],
        mustNotInvalidate: ["decode", "composite"],
        targets: ["canvas.viewport"],
      },
      {
        interaction: "timeline-scrub",
        invalidates: ["composite"],
        mustNotInvalidate: ["decode"],
        retainedAccesses: ["decode"],
        targets: ["timeline.currentTime"],
      },
    ],
    passes: [
      {
        cacheKey: ["source.id"],
        cost: { dimensions: [], frequency: "once", relationship: "constant" },
        id: "decode",
        inputs: ["source.id"],
        invalidatedBy: ["source.id"],
        kind: "decode",
        lifecycle: { cache: "retained-resource", resourceScope: "source" },
        output: "source",
        quality: "full",
        runsOn: "worker",
      },
      {
        cost: {
          dimensions: [],
          frequency: "interaction",
          relationship: "constant",
        },
        id: "simulate",
        inputs: ["decode", "effect.strength"],
        invalidatedBy: ["effect.strength"],
        kind: "pixel-transform",
        output: "intermediate",
        quality: "full",
        runsOn: "main",
      },
      {
        cost: {
          dimensions: [],
          frequency: "interaction",
          relationship: "constant",
        },
        id: "composite",
        inputs: ["decode", "effect.strength", "runtime.animation-frame"],
        invalidatedBy: ["effect.strength", "runtime.animation-frame"],
        kind: "composite",
        output: "preview",
        quality: "full",
        runsOn: "main",
      },
    ],
    runtimeId: "pipeline-evidence-test-v1",
  });

export const pipelineEvidencePerformance = defineToolcraftPerformance({
  fixtureAdapters: { dimensions: {} },
  rendererPipeline: pipelineEvidenceRegistration,
  rendererStrategy: "webgl",
  scenarios: [],
  usesCustomRenderer: true,
  workloadEnvelope: { dimensions: [] },
});

const paths = deriveToolcraftPerformancePaths(
  pipelineEvidenceSchema,
  pipelineEvidencePerformance,
);
const pathBy = (predicate: (path: (typeof paths)[number]) => boolean) =>
  paths.find(predicate)!;
export const activePipelinePath = pathBy(
  (path) => path.interaction === "control-drag",
);
export const animationPipelinePath = pathBy(
  (path) => path.interaction === "animation-frame",
);
export const initialPipelinePath = pathBy(
  (path) => path.interaction === "initial-render",
);
export const cachedPipelinePath = pathBy(
  (path) => path.interaction === "media-import",
);
export const stableCachedPipelinePath = pathBy((path) =>
  path.targets.includes("effect.mode"),
);
export const fieldDisablePipelinePath = pathBy((path) =>
  path.targets.includes("simulation.enabled:disable"),
);
export const unchangedPipelinePath = pathBy(
  (path) => path.interaction === "viewport-zoom",
);
export const retainedAccessPipelinePath = pathBy(
  (path) => path.interaction === "timeline-scrub",
);
