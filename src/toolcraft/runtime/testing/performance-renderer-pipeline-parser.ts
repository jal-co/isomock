import type {
  ToolcraftInteractionInvalidation,
  ToolcraftRenderPass,
  ToolcraftRendererPipeline,
} from "./performance-types";
import {
  isToolcraftRendererPipelineRegistration,
  type AnyToolcraftRendererPipelineRegistration,
} from "../rendering/renderer-pipeline-registration";
import { normalizeToolcraftGpuPassExecution } from "../rendering/renderer-pipeline-normalization";
import { isRecord } from "./performance-render-plan-utils";

export type ToolcraftRendererPipelineParseResult = {
  errors: readonly string[];
  pipeline: ToolcraftRendererPipeline | null;
  registration: AnyToolcraftRendererPipelineRegistration | null;
};

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): string {
  const value = record[key];
  if (typeof value !== "string") {
    errors.push(`${path}.${key} must be a string.`);
    return "";
  }
  return value;
}

function readStringArray(
  value: unknown,
  path: string,
  errors: string[],
): readonly string[] {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return [];
  }

  const strings: string[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string") {
      errors.push(`${path}[${index}] must be a string.`);
    } else {
      strings.push(entry);
    }
  }
  return strings;
}

function parsePass(
  value: unknown,
  index: number,
  errors: string[],
): ToolcraftRenderPass | null {
  const path = `rendererPipeline.passes[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path} must be a non-null object.`);
    return null;
  }

  const errorCount = errors.length;
  const id = readRequiredString(value, "id", path, errors);
  const inputs = readStringArray(value.inputs, `${path}.inputs`, errors);
  const invalidatedBy = readStringArray(
    value.invalidatedBy,
    `${path}.invalidatedBy`,
    errors,
  );
  const kind = readRequiredString(value, "kind", path, errors);
  const output = readRequiredString(value, "output", path, errors);
  const quality = readRequiredString(value, "quality", path, errors);
  const runsOn = readRequiredString(value, "runsOn", path, errors);
  const gpuResult = value.gpu === undefined
    ? null
    : normalizeToolcraftGpuPassExecution(value.gpu);
  for (const error of gpuResult?.errors ?? []) {
    const field = error.field === null ? "" : `.${error.field}`;
    errors.push(`${path}.gpu${field} ${error.message}`);
  }
  const gpu = gpuResult?.value ?? undefined;
  const cacheKey =
    value.cacheKey === undefined
      ? undefined
      : readStringArray(value.cacheKey, `${path}.cacheKey`, errors);

  if (errors.length !== errorCount) {
    return null;
  }

  return {
    ...(cacheKey ? { cacheKey } : {}),
    ...(value.cost === undefined
      ? {}
      : { cost: value.cost as ToolcraftRenderPass["cost"] }),
    ...(gpu ? { gpu } : {}),
    id,
    inputs,
    invalidatedBy,
    kind: kind as ToolcraftRenderPass["kind"],
    ...(value.lifecycle === undefined
      ? {}
      : { lifecycle: value.lifecycle as ToolcraftRenderPass["lifecycle"] }),
    output: output as ToolcraftRenderPass["output"],
    quality: quality as ToolcraftRenderPass["quality"],
    runsOn: runsOn as ToolcraftRenderPass["runsOn"],
  };
}

function parseInvalidation(
  value: unknown,
  index: number,
  errors: string[],
): ToolcraftInteractionInvalidation | null {
  const path = `rendererPipeline.interactionInvalidation[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path} must be a non-null object.`);
    return null;
  }

  const errorCount = errors.length;
  const interaction = readRequiredString(value, "interaction", path, errors);
  const invalidates = readStringArray(
    value.invalidates,
    `${path}.invalidates`,
    errors,
  );
  const targets = readStringArray(value.targets, `${path}.targets`, errors);
  const mustNotInvalidate =
    value.mustNotInvalidate === undefined
      ? undefined
      : readStringArray(
          value.mustNotInvalidate,
          `${path}.mustNotInvalidate`,
          errors,
        );
  const preparationInvalidates =
    value.preparationInvalidates === undefined
      ? undefined
      : readStringArray(
          value.preparationInvalidates,
          `${path}.preparationInvalidates`,
          errors,
        );
  const retainedAccesses =
    value.retainedAccesses === undefined
      ? undefined
      : readStringArray(
          value.retainedAccesses,
          `${path}.retainedAccesses`,
          errors,
        );

  if (errors.length !== errorCount) {
    return null;
  }

  return {
    interaction: interaction as ToolcraftInteractionInvalidation["interaction"],
    invalidates,
    ...(mustNotInvalidate ? { mustNotInvalidate } : {}),
    ...(preparationInvalidates ? { preparationInvalidates } : {}),
    ...(retainedAccesses ? { retainedAccesses } : {}),
    targets,
  };
}

export function parseToolcraftRendererPipeline(
  value: unknown,
): ToolcraftRendererPipelineParseResult {
  if (value === undefined) {
    return { errors: [], pipeline: null, registration: null };
  }
  if (isToolcraftRendererPipelineRegistration(value)) {
    return { errors: [], pipeline: value, registration: value };
  }
  if (!isRecord(value)) {
    return {
      errors: ["rendererPipeline must be a non-null object."],
      pipeline: null,
      registration: null,
    };
  }

  const errors: string[] = [];
  const passes: ToolcraftRenderPass[] = [];
  if (!Array.isArray(value.passes)) {
    errors.push("rendererPipeline.passes must be an array.");
  } else {
    for (const [index, pass] of value.passes.entries()) {
      const parsedPass = parsePass(pass, index, errors);
      if (parsedPass) {
        passes.push(parsedPass);
      }
    }
  }

  const interactionInvalidation: ToolcraftInteractionInvalidation[] = [];
  if (!Array.isArray(value.interactionInvalidation)) {
    errors.push("rendererPipeline.interactionInvalidation must be an array.");
  } else {
    for (const [index, invalidation] of value.interactionInvalidation.entries()) {
      const parsedInvalidation = parseInvalidation(invalidation, index, errors);
      if (parsedInvalidation) {
        interactionInvalidation.push(parsedInvalidation);
      }
    }
  }

  if (value.runtimeId !== undefined && typeof value.runtimeId !== "string") {
    errors.push("rendererPipeline.runtimeId must be a string when provided.");
  }

  if (errors.length > 0) {
    return { errors, pipeline: null, registration: null };
  }

  return {
    errors: [],
    pipeline: {
      interactionInvalidation,
      passes,
      ...(typeof value.runtimeId === "string" ? { runtimeId: value.runtimeId } : {}),
    },
    registration: null,
  };
}
