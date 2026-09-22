import { normalizeRendererSceneBounds } from "./renderer-scene-bounds";
import type { ToolcraftGpuPassExecution } from "./renderer-gpu-contract";
import { normalizeToolcraftGpuPassExecution } from "./renderer-gpu-execution-normalization";
import type { ToolcraftInteractionInvalidation, ToolcraftRenderPass,
  ToolcraftRendererPipeline } from "./renderer-pipeline-types";

export {
  normalizeToolcraftGpuPassExecution,
  type ToolcraftGpuPassExecutionNormalizationError,
  type ToolcraftGpuPassExecutionNormalizationResult,
} from "./renderer-gpu-execution-normalization";

const supportedCacheModes = new Set(["none", "memoized", "retained-resource"]);
const supportedResourceScopes = new Set(["call", "interaction", "renderer", "source"]);
const supportedPassKinds = new Set([
  "decode", "preprocess", "pixel-transform", "vector-build", "text-layout",
  "rasterize", "composite", "handles", "export",
]);
const supportedPassOutputs = new Set(["source", "intermediate", "preview", "overlay", "export"]);
const supportedPassQualities = new Set(["preview", "full", "retina", "export"]);
const supportedRunLocations = new Set([
  "main", "worker", "gpu", "worker-or-gpu", "export-only",
]);
const supportedCostFrequencies = new Set([
  "once", "discrete", "interaction", "frame", "batch",
]);
const supportedCostRelationships = new Set([
  "constant", "linear", "quadratic", "product", "benchmark",
]);
const supportedInteractions = new Set([
  "initial-render", "animation-frame", "control-change", "control-drag",
  "media-import", "mask-drag", "viewport-drag", "viewport-zoom",
  "timeline-playback", "timeline-scrub", "export",
]);
const freezeStrings = (values: readonly string[]): readonly string[] =>
  Object.freeze([...values]);

function assertSupportedValue(
  passId: string,
  path: string,
  value: unknown,
  supported: ReadonlySet<string>,
): asserts value is string {
  if (typeof value !== "string" || !supported.has(value)) {
    throw new Error(
      `Renderer pipeline pass "${passId}" ${path} value "${String(value)}" is not supported.`,
    );
  }
}

function assertStringArray(
  passId: string,
  path: string,
  value: unknown,
): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(
      `Renderer pipeline pass "${passId}" ${path} must be an array of strings.`,
    );
  }
}

function assertInvalidationStringArray(
  path: string,
  value: unknown,
): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Renderer pipeline ${path} must be an array of strings.`);
  }
}

export function isRendererPipelineRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertInvalidationShape(
  invalidation: ToolcraftInteractionInvalidation,
  index: number,
): void {
  const path = `interactionInvalidation[${index}]`;
  if (!isRendererPipelineRecord(invalidation)) {
    throw new Error(`Renderer pipeline ${path} must be an object.`);
  }
  assertInvalidationStringArray(`${path}.invalidates`, invalidation.invalidates);
  assertInvalidationStringArray(`${path}.targets`, invalidation.targets);
  if (invalidation.mustNotInvalidate !== undefined) {
    assertInvalidationStringArray(
      `${path}.mustNotInvalidate`,
      invalidation.mustNotInvalidate,
    );
  }
  if (invalidation.preparationInvalidates !== undefined) {
    assertInvalidationStringArray(
      `${path}.preparationInvalidates`,
      invalidation.preparationInvalidates,
    );
  }
  if (invalidation.retainedAccesses !== undefined) {
    assertInvalidationStringArray(
      `${path}.retainedAccesses`,
      invalidation.retainedAccesses,
    );
  }
}

function assertPassShape(
  pass: ToolcraftRenderPass,
): ToolcraftGpuPassExecution | undefined {
  assertStringArray(pass.id, "inputs", pass.inputs);
  assertStringArray(pass.id, "invalidatedBy", pass.invalidatedBy);
  assertSupportedValue(pass.id, "kind", pass.kind, supportedPassKinds);
  assertSupportedValue(pass.id, "output", pass.output, supportedPassOutputs);
  assertSupportedValue(pass.id, "quality", pass.quality, supportedPassQualities);
  assertSupportedValue(pass.id, "runsOn", pass.runsOn, supportedRunLocations);
  const requiresGpu = pass.runsOn === "gpu" || pass.runsOn === "worker-or-gpu";
  if (requiresGpu && pass.gpu === undefined) {
    throw new Error(
      `rendererPipeline pass "${pass.id}" runs on ${pass.runsOn} and must declare gpu execution semantics.`,
    );
  }
  if (!requiresGpu && pass.gpu !== undefined) {
    throw new Error(
      `rendererPipeline pass "${pass.id}" runs on ${pass.runsOn} and must omit gpu execution semantics.`,
    );
  }
  const gpuResult = pass.gpu === undefined
    ? null
    : normalizeToolcraftGpuPassExecution(pass.gpu);
  if (gpuResult?.errors[0]) {
    const error = gpuResult.errors[0];
    const field = error.field === null ? "" : `.${error.field}`;
    throw new Error(
      `Renderer pipeline pass "${pass.id}" gpu${field} ${error.message}`,
    );
  }
  if (pass.cacheKey !== undefined) {
    assertStringArray(pass.id, "cacheKey", pass.cacheKey);
  }
  if (pass.lifecycle !== undefined) {
    assertSupportedValue(
      pass.id,
      "lifecycle.cache",
      pass.lifecycle.cache,
      supportedCacheModes,
    );
    assertSupportedValue(
      pass.id,
      "lifecycle.resourceScope",
      pass.lifecycle.resourceScope,
      supportedResourceScopes,
    );
  }
  if (pass.cost !== undefined) {
    assertStringArray(pass.id, "cost.dimensions", pass.cost.dimensions);
    assertSupportedValue(
      pass.id,
      "cost.frequency",
      pass.cost.frequency,
      supportedCostFrequencies,
    );
    assertSupportedValue(
      pass.id,
      "cost.relationship",
      pass.cost.relationship,
      supportedCostRelationships,
    );
  }
  return gpuResult?.value ?? undefined;
}

function assertCacheKeyNames(pass: ToolcraftRenderPass): void {
  const cache = pass.lifecycle?.cache ?? (pass.cacheKey ? "memoized" : "none");
  if (cache === "none" && pass.cacheKey) {
    throw new Error(
      `Renderer pipeline pass "${pass.id}" with cache "none" cannot declare cacheKey.`,
    );
  }
  if (cache !== "none" && (!pass.cacheKey || pass.cacheKey.length === 0)) {
    throw new Error(
      `Renderer pipeline pass "${pass.id}" with ${cache} cache requires cache key names.`,
    );
  }
  const names = new Set<string>();
  for (const name of pass.cacheKey ?? []) {
    if (!name || name.trim() !== name) {
      throw new Error(
        `Renderer pipeline pass "${pass.id}" cache key names must be non-empty trimmed strings.`,
      );
    }
    if (names.has(name)) {
      throw new Error(
        `Renderer pipeline pass "${pass.id}" cache key name "${name}" must be unique.`,
      );
    }
    names.add(name);
  }
  if (pass.lifecycle?.cache === "retained-resource" &&
      (pass.lifecycle.resourceScope === "interaction" ||
       pass.lifecycle.resourceScope === "call")) {
    throw new Error(
      `Renderer pipeline pass "${pass.id}" cannot retain ${pass.lifecycle.resourceScope}-scoped resources.`,
    );
  }
}

function clonePass(
  pass: ToolcraftRenderPass,
  gpu: ToolcraftGpuPassExecution | undefined,
): ToolcraftRenderPass {
  return Object.freeze({
    ...(pass.cacheKey ? { cacheKey: freezeStrings(pass.cacheKey) } : {}),
    ...(pass.cost
      ? {
          cost: Object.freeze({
            dimensions: freezeStrings(pass.cost.dimensions),
            frequency: pass.cost.frequency,
            relationship: pass.cost.relationship,
          }),
        }
      : {}),
    ...(gpu ? { gpu } : {}),
    id: pass.id,
    inputs: freezeStrings(pass.inputs),
    invalidatedBy: freezeStrings(pass.invalidatedBy),
    kind: pass.kind,
    ...(pass.lifecycle
      ? {
          lifecycle: Object.freeze({
            cache: pass.lifecycle.cache,
            resourceScope: pass.lifecycle.resourceScope,
          }),
        }
      : {}),
    output: pass.output,
    quality: pass.quality,
    runsOn: pass.runsOn,
    ...(pass.sceneBounds === undefined ? {} : { sceneBounds: normalizeRendererSceneBounds(pass.sceneBounds) }),
  });
}

export function normalizeToolcraftRenderPass(
  sourcePass: unknown,
  index: number,
): ToolcraftRenderPass {
  if (!isRendererPipelineRecord(sourcePass)) {
    throw new Error(`Renderer pipeline pass at index ${index} must be an object.`);
  }
  if (typeof sourcePass.id !== "string" || !sourcePass.id ||
      sourcePass.id.trim() !== sourcePass.id) {
    throw new Error("Renderer pipeline pass ids must be non-empty trimmed strings.");
  }
  const pass = sourcePass as ToolcraftRenderPass;
  const gpu = assertPassShape(pass);
  assertCacheKeyNames(pass);
  return clonePass(pass, gpu);
}

export function normalizeToolcraftInteractionInvalidation(
  sourceInvalidation: unknown,
  index: number,
  passesById: ReadonlyMap<string, ToolcraftRenderPass>,
): ToolcraftInteractionInvalidation {
  const invalidation = sourceInvalidation as ToolcraftInteractionInvalidation;
  assertInvalidationShape(invalidation, index);
  if (!supportedInteractions.has(invalidation.interaction)) {
    throw new Error(
      `Renderer pipeline interaction "${String(invalidation.interaction)}" is not supported.`,
    );
  }
  const clone = Object.freeze({
    interaction: invalidation.interaction,
    invalidates: freezeStrings(invalidation.invalidates),
    ...(invalidation.mustNotInvalidate
      ? { mustNotInvalidate: freezeStrings(invalidation.mustNotInvalidate) }
      : {}),
    ...(invalidation.preparationInvalidates
      ? {
          preparationInvalidates: freezeStrings(
            invalidation.preparationInvalidates,
          ),
        }
      : {}),
    ...(invalidation.retainedAccesses
      ? { retainedAccesses: freezeStrings(invalidation.retainedAccesses) }
      : {}),
    targets: freezeStrings(invalidation.targets),
  });
  for (const relation of [
    "invalidates",
    "mustNotInvalidate",
    "preparationInvalidates",
    "retainedAccesses",
  ] as const) {
    for (const passId of clone[relation] ?? []) {
      const pass = passesById.get(passId);
      if (!pass) {
        throw new Error(
          `Renderer pipeline ${clone.interaction} ${relation} undeclared pass "${passId}".`,
        );
      }
      if (
        relation === "retainedAccesses" &&
        pass.lifecycle?.cache !== "retained-resource"
      ) {
        throw new Error(
          `Renderer pipeline ${clone.interaction} retainedAccesses pass "${passId}" must use retained-resource lifecycle.`,
        );
      }
    }
  }
  const invalidatedPassIds = new Set(clone.invalidates);
  for (const passId of clone.retainedAccesses ?? []) {
    if (invalidatedPassIds.has(passId)) {
      throw new Error(
        `Renderer pipeline ${clone.interaction} cannot both invalidate and retain-access pass "${passId}".`,
      );
    }
  }
  return clone;
}

export function assertRendererPipelineDescriptorShape(
  descriptor: unknown,
): asserts descriptor is ToolcraftRendererPipeline {
  if (!isRendererPipelineRecord(descriptor)) {
    throw new Error("Renderer pipeline descriptor must be an object.");
  }
  if (!Array.isArray(descriptor.passes)) {
    throw new Error("Renderer pipeline passes must be an array.");
  }
  if (!Array.isArray(descriptor.interactionInvalidation)) {
    throw new Error("Renderer pipeline interactionInvalidation must be an array.");
  }
}
