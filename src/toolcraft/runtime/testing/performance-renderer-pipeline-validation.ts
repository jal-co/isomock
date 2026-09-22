import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import {
  assessParsedToolcraftEnvelopeRenderPlan,
  type ToolcraftRenderPlanBenchmarkRequirement,
} from "./performance-render-plan-assessment";
import type { ToolcraftEnvelopeValidationContext } from "./performance-envelope-validation-context";
import {
  type ToolcraftRendererPipelineParseResult,
} from "./performance-renderer-pipeline-parser";
import type {
  ToolcraftEnvelopePerformanceConfig,
  ToolcraftPipelineInteraction,
  ToolcraftRenderPass,
  ToolcraftRenderPassKind,
  ToolcraftRenderPassOutput,
  ToolcraftRenderPassQuality,
  ToolcraftRenderPassRunLocation,
  ToolcraftRendererPipeline,
} from "./performance-types";
import type { ToolcraftPerformanceCoverageValidationPolicy } from "./performance-coverage-policy";

const renderPassKinds = new Set<ToolcraftRenderPassKind>([
  "decode",
  "preprocess",
  "pixel-transform",
  "vector-build",
  "text-layout",
  "rasterize",
  "composite",
  "handles",
  "export",
]);

const renderPassRunLocations = new Set<ToolcraftRenderPassRunLocation>([
  "main",
  "worker",
  "gpu",
  "worker-or-gpu",
  "export-only",
]);

const renderPassOutputs = new Set<ToolcraftRenderPassOutput>([
  "source",
  "intermediate",
  "preview",
  "overlay",
  "export",
]);

const renderPassQualities = new Set<ToolcraftRenderPassQuality>([
  "preview",
  "full",
  "retina",
  "export",
]);

const pipelineInteractions = new Set<ToolcraftPipelineInteraction>([
  "initial-render",
  "animation-frame",
  "control-change",
  "control-drag",
  "media-import",
  "mask-drag",
  "viewport-drag",
  "viewport-zoom",
  "timeline-playback",
  "timeline-scrub",
  "export",
]);

const expensiveRenderPassKinds = new Set<ToolcraftRenderPassKind>([
  "decode",
  "preprocess",
  "pixel-transform",
  "text-layout",
  "rasterize",
]);

const cacheRequiredRenderPassKinds = new Set<ToolcraftRenderPassKind>([
  ...expensiveRenderPassKinds,
  "composite",
]);

const highFrequencyViewportInteractions = new Set<ToolcraftPipelineInteraction>(
  [
    "animation-frame",
    "mask-drag",
    "timeline-playback",
    "timeline-scrub",
    "viewport-drag",
    "viewport-zoom",
  ],
);

const vaguePipelineReferencePattern =
  /^(?:all|all values|everything|props|runtime|settings|state|values)$/i;

function getPassById(
  pipeline: ToolcraftRendererPipeline,
): Map<string, ToolcraftRenderPass> {
  return new Map(pipeline.passes.map((pass) => [pass.id, pass]));
}

function hasPipelineReference(value: string): boolean {
  return (
    value.trim().length > 0 && !vaguePipelineReferencePattern.test(value.trim())
  );
}

function isRetinaViewportZoomRaster(
  schema: ResolvedToolcraftAppSchema,
  interaction: ToolcraftPipelineInteraction,
  pass: ToolcraftRenderPass,
): boolean {
  return (
    interaction === "viewport-zoom" &&
    schema.canvas.renderScale.enabled &&
    pass.kind === "rasterize" &&
    pass.quality === "retina" &&
    (pass.runsOn === "worker" ||
      pass.runsOn === "gpu" ||
      pass.runsOn === "worker-or-gpu")
  );
}

function getPipelineReferenceErrors(
  passId: string,
  field: string,
  references: readonly string[] | undefined,
): string[] {
  if (!references || references.length === 0) {
    return [`rendererPipeline pass "${passId}" must list ${field}.`];
  }

  return references.flatMap((reference) =>
    hasPipelineReference(reference)
      ? []
      : [
          `rendererPipeline pass "${passId}" ${field} entry "${reference}" is too vague. Name the concrete runtime target, source key, resource key, or cache key part.`,
        ],
  );
}

function getRequiredBenchmarkError(
  requirement: ToolcraftRenderPlanBenchmarkRequirement,
): string {
  return `rendererPipeline pass "${requirement.passId}" requires a protected kernel benchmark decision for candidates ${requirement.candidates.join(
    ", ",
  )} at workload ${JSON.stringify(requirement.workload)} before the render plan is accepted.`;
}

function getEnvelopeRenderPlanErrors(
  schema: ResolvedToolcraftAppSchema,
  config: ToolcraftEnvelopeValidationContext["config"],
  parsedPipeline: ToolcraftRendererPipelineParseResult,
  policy: ToolcraftPerformanceCoverageValidationPolicy,
): string[] {
  const assessment = assessParsedToolcraftEnvelopeRenderPlan(
    schema,
    config,
    parsedPipeline,
  );
  return [
    ...assessment.errors,
    ...(policy.unresolvedKernelBenchmarks === "error"
      ? assessment.requiredBenchmarks.map(getRequiredBenchmarkError)
      : []),
  ];
}

type ToolcraftRendererPipelineValidationContext = {
  config: ToolcraftEnvelopePerformanceConfig;
  evaluateRenderPlan: boolean;
  parsedPipeline: ToolcraftRendererPipelineParseResult;
  policy: ToolcraftPerformanceCoverageValidationPolicy;
};

function getRendererPipelineErrorsFromParsedPipeline(
  schema: ResolvedToolcraftAppSchema,
  context: ToolcraftRendererPipelineValidationContext,
): string[] {
  const { config, parsedPipeline } = context;
  const errors: string[] = [];
  const rawPipeline = config.rendererPipeline as unknown;
  const envelopeRenderPlanErrors = context.evaluateRenderPlan
    ? getEnvelopeRenderPlanErrors(
        schema,
        context.config,
        parsedPipeline,
        context.policy,
      )
    : [];

  if (config.usesCustomRenderer && rawPipeline === undefined) {
    return [
      "Custom renderers must declare rendererPipeline so render passes, cache keys, and invalidation are machine-checkable.",
      ...envelopeRenderPlanErrors,
    ];
  }

  if (!config.usesCustomRenderer && rawPipeline !== undefined) {
    return [
      "Non-custom renderer configs must omit rendererPipeline.",
      ...envelopeRenderPlanErrors,
    ];
  }

  if (rawPipeline === undefined) {
    return envelopeRenderPlanErrors;
  }

  if (!parsedPipeline.pipeline) {
    return [
      ...new Set([...parsedPipeline.errors, ...envelopeRenderPlanErrors]),
    ];
  }
  const pipeline = parsedPipeline.pipeline;

  if (pipeline.passes.length === 0) {
    errors.push("rendererPipeline must declare at least one render pass.");
  }

  if (pipeline.interactionInvalidation.length === 0) {
    errors.push(
      "rendererPipeline must declare interactionInvalidation so high-frequency UI work cannot accidentally invalidate expensive passes.",
    );
  }

  const passIds = new Set<string>();

  for (const pass of pipeline.passes) {
    const passId = pass.id.trim();

    if (!passId) {
      errors.push("rendererPipeline passes must have non-empty ids.");
    } else if (passIds.has(passId)) {
      errors.push(`rendererPipeline pass id "${passId}" must be unique.`);
    } else {
      passIds.add(passId);
    }

    if (!renderPassKinds.has(pass.kind)) {
      errors.push(
        `rendererPipeline pass "${pass.id}" kind "${pass.kind}" is not supported.`,
      );
    }

    if (!renderPassRunLocations.has(pass.runsOn)) {
      errors.push(
        `rendererPipeline pass "${pass.id}" runsOn "${pass.runsOn}" is not supported.`,
      );
    }

    const requiresGpu = pass.runsOn === "gpu" || pass.runsOn === "worker-or-gpu";
    if (requiresGpu && pass.gpu === undefined) {
      errors.push(
        `rendererPipeline pass "${pass.id}" runs on ${pass.runsOn} and must declare gpu execution semantics.`,
      );
    } else if (!requiresGpu && pass.gpu !== undefined) {
      errors.push(
        `rendererPipeline pass "${pass.id}" runs on ${pass.runsOn} and must omit gpu execution semantics.`,
      );
    }

    if (!renderPassOutputs.has(pass.output)) {
      errors.push(
        `rendererPipeline pass "${pass.id}" output "${pass.output}" is not supported.`,
      );
    }

    if (!renderPassQualities.has(pass.quality)) {
      errors.push(
        `rendererPipeline pass "${pass.id}" quality "${pass.quality}" is not supported.`,
      );
    }

    errors.push(...getPipelineReferenceErrors(pass.id, "inputs", pass.inputs));
    errors.push(
      ...getPipelineReferenceErrors(
        pass.id,
        "invalidatedBy",
        pass.invalidatedBy,
      ),
    );

    if (pass.cacheKey) {
      errors.push(
        ...getPipelineReferenceErrors(pass.id, "cacheKey", pass.cacheKey),
      );
    }

    if (
      cacheRequiredRenderPassKinds.has(pass.kind) &&
      pass.lifecycle?.cache !== "none" &&
      (!pass.cacheKey || pass.cacheKey.length === 0)
    ) {
      errors.push(
        `rendererPipeline pass "${pass.id}" is a cache-sensitive ${pass.kind} pass and must declare cacheKey so tests can reject full recomputation on every control change.`,
      );
    }

    if (pass.kind === "decode") {
      const hasMediaImportInvalidation = pipeline.interactionInvalidation.some(
        (invalidation) => invalidation.interaction === "media-import",
      );

      if (!hasMediaImportInvalidation) {
        errors.push(
          `rendererPipeline pass "${pass.id}" decodes media, so interactionInvalidation must include a media-import path.`,
        );
      }
    }
  }

  const passesById = getPassById(pipeline);

  for (const invalidation of pipeline.interactionInvalidation) {
    if (!pipelineInteractions.has(invalidation.interaction)) {
      errors.push(
        `rendererPipeline interaction "${invalidation.interaction}" is not supported.`,
      );
    }

    errors.push(
      ...getPipelineReferenceErrors(
        invalidation.interaction,
        "targets",
        invalidation.targets,
      ),
    );

    const mustNotInvalidate = new Set(invalidation.mustNotInvalidate ?? []);
    const invalidatedPassIds = new Set(invalidation.invalidates);

    for (const passId of invalidation.invalidates) {
      if (!passId.trim()) {
        errors.push(
          `rendererPipeline ${invalidation.interaction} invalidates contains an empty pass id.`,
        );
        continue;
      }

      const pass = passesById.get(passId);

      if (!pass) {
        errors.push(
          `rendererPipeline ${invalidation.interaction} invalidates unknown pass "${passId}".`,
        );
        continue;
      }

      if (mustNotInvalidate.has(passId)) {
        errors.push(
          `rendererPipeline ${invalidation.interaction} cannot both invalidate and mustNotInvalidate pass "${passId}".`,
        );
      }

      if (
        highFrequencyViewportInteractions.has(invalidation.interaction) &&
        expensiveRenderPassKinds.has(pass.kind) &&
        !isRetinaViewportZoomRaster(schema, invalidation.interaction, pass)
      ) {
        errors.push(
          `rendererPipeline ${invalidation.interaction} must not invalidate expensive pass "${passId}" (${pass.kind}). Move viewport work to transforms/uniforms or explain it through a cheaper pass.`,
        );
      }
    }

    for (const passId of invalidation.mustNotInvalidate ?? []) {
      if (!passId.trim()) {
        errors.push(
          `rendererPipeline ${invalidation.interaction} mustNotInvalidate contains an empty pass id.`,
        );
      } else if (!passesById.has(passId)) {
        errors.push(
          `rendererPipeline ${invalidation.interaction} mustNotInvalidate unknown pass "${passId}".`,
        );
      }
    }

    for (const passId of invalidation.preparationInvalidates ?? []) {
      if (!passId.trim()) {
        errors.push(
          `rendererPipeline ${invalidation.interaction} preparationInvalidates contains an empty pass id.`,
        );
      } else if (!passesById.has(passId)) {
        errors.push(
          `rendererPipeline ${invalidation.interaction} preparationInvalidates unknown pass "${passId}".`,
        );
      }
    }

    for (const passId of invalidation.retainedAccesses ?? []) {
      if (!passId.trim()) {
        errors.push(
          `rendererPipeline ${invalidation.interaction} retainedAccesses contains an empty pass id.`,
        );
        continue;
      }
      const pass = passesById.get(passId);
      if (!pass) {
        errors.push(
          `rendererPipeline ${invalidation.interaction} retainedAccesses unknown pass "${passId}".`,
        );
      } else if (pass.lifecycle?.cache !== "retained-resource") {
        errors.push(
          `rendererPipeline ${invalidation.interaction} retainedAccesses pass "${passId}" must use retained-resource lifecycle.`,
        );
      }
      if (invalidatedPassIds.has(passId)) {
        errors.push(
          `rendererPipeline ${invalidation.interaction} cannot both invalidate and retain-access pass "${passId}".`,
        );
      }
    }
  }

  errors.push(...envelopeRenderPlanErrors);
  return errors;
}

export function getRendererPipelineErrorsForEnvelopeContext(
  context: ToolcraftEnvelopeValidationContext,
  policy: ToolcraftPerformanceCoverageValidationPolicy,
): string[] {
  return getRendererPipelineErrorsFromParsedPipeline(context.schema, {
    config: context.config,
    evaluateRenderPlan: context.workloadEnvelopeValid,
    parsedPipeline: context.parsedPipeline,
    policy,
  });
}
