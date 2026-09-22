import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import { type ToolcraftPerformanceConfig } from "./performance-types";
import { validateToolcraftBenchmarkDecisions } from "./performance-render-plan-benchmark-evidence";
import {
  createToolcraftRenderPlanInvariants,
  type ToolcraftRenderPlanAssessment,
} from "./performance-render-plan-model";
import { assessToolcraftRenderPasses } from "./performance-render-plan-pass-assessment";
import {
  formatValue,
  isTrimmedNonEmptyString,
  rendererStrategies,
} from "./performance-render-plan-utils";
import {
  parseToolcraftRendererPipeline,
  type ToolcraftRendererPipelineParseResult,
} from "./performance-renderer-pipeline-parser";

export type {
  ToolcraftRenderPlanAssessment,
  ToolcraftRenderPlanBenchmarkRequirement,
  ToolcraftRenderPlanInvariants,
} from "./performance-render-plan-model";

export function assessParsedToolcraftRenderPlan(
  schema: ResolvedToolcraftAppSchema,
  config: ToolcraftPerformanceConfig,
  parsedPipeline: ToolcraftRendererPipelineParseResult,
): ToolcraftRenderPlanAssessment {
  return assessParsedToolcraftEnvelopeRenderPlan(
    schema,
    config,
    parsedPipeline,
  );
}

export function assessParsedToolcraftEnvelopeRenderPlan(
  schema: ResolvedToolcraftAppSchema,
  config: ToolcraftPerformanceConfig,
  parsedPipeline: ToolcraftRendererPipelineParseResult,
): ToolcraftRenderPlanAssessment {
  const runtimePasses = parsedPipeline.pipeline?.passes ?? [];
  const invariants = createToolcraftRenderPlanInvariants(schema, runtimePasses);
  const errors = [...parsedPipeline.errors];
  if (!rendererStrategies.has(config.rendererStrategy)) {
    errors.push(
      `Envelope rendererStrategy "${formatValue(
        config.rendererStrategy,
      )}" is not supported.`,
    );
  }
  if (config.usesCustomRenderer && config.rendererStrategy === "none") {
    errors.push(
      'Envelope custom renderers must declare rendererStrategy "dom", "svg", "canvas-2d", "webgl", or "webgpu".',
    );
  }
  if (!config.usesCustomRenderer && config.rendererStrategy !== "none") {
    errors.push(
      `Envelope non-custom renderers must use rendererStrategy "none", received "${config.rendererStrategy}".`,
    );
  }
  const hasCacheSensitivePass = runtimePasses.some(
    (pass) => pass.lifecycle?.cache !== "none",
  );
  if (
    config.usesCustomRenderer &&
    hasCacheSensitivePass &&
    !parsedPipeline.registration
  ) {
    errors.push(
      "Envelope custom renderers with cache-sensitive passes must use a compiled executable renderer pipeline registration; runtimeId prose alone is not executable evidence.",
    );
  } else if (
    config.usesCustomRenderer &&
    parsedPipeline.pipeline &&
    !isTrimmedNonEmptyString(parsedPipeline.pipeline.runtimeId)
  ) {
    errors.push(
      "Envelope custom renderers must declare rendererPipeline.runtimeId as a non-empty trimmed stable string.",
    );
  }
  for (const pass of runtimePasses) {
    if (
      pass.lifecycle?.cache === "retained-resource" &&
      pass.lifecycle.resourceScope === "interaction"
    ) {
      errors.push(
        `rendererPipeline pass "${pass.id}" uses interaction-scoped resources, but executable interaction resource boundaries are not supported.`,
      );
    }
  }

  const passAssessment = assessToolcraftRenderPasses(config, runtimePasses);
  errors.push(...passAssessment.errors);
  const decisions = validateToolcraftBenchmarkDecisions(
    config,
    passAssessment.requirements,
  );
  errors.push(...decisions.errors);

  return {
    errors,
    invariants,
    requiredBenchmarks: passAssessment.requirements.filter(
      ({ passId }) => !decisions.resolvedPassIds.has(passId),
    ),
    warnings: [],
  };
}

export function assessToolcraftRenderPlan(
  schema: ResolvedToolcraftAppSchema,
  config: ToolcraftPerformanceConfig,
): ToolcraftRenderPlanAssessment {
  return assessParsedToolcraftRenderPlan(
    schema,
    config,
    parseToolcraftRendererPipeline(config.rendererPipeline as unknown),
  );
}
