import { toolcraftGpuComputeResourceKinds } from "../rendering";
import type { ToolcraftEnvelopeValidationContext } from "./performance-envelope-validation-context";
import type { ToolcraftRendererPipelineParseResult } from "./performance-renderer-pipeline-parser";
import {
  hasExactToolcraftGpuTechniqueKeys,
  isToolcraftGpuTechniqueRecord,
  validateToolcraftGpuExceptionShape,
} from "./performance-renderer-gpu-technique-shape";
import type {
  ToolcraftExportRenderer,
  ToolcraftPreviewRenderer,
} from "./performance-types";

export type ToolcraftGpuPressure = Readonly<{
  passIds: readonly string[];
  reasons: readonly ("compute" | "feedback" | "storage")[];
  surface: "export" | "preview";
}>;

type ToolcraftGpuSurface = ToolcraftGpuPressure["surface"];
type ToolcraftFinalRenderer = ToolcraftExportRenderer | ToolcraftPreviewRenderer;
const webglExceptionKinds = new Set([
  "browser-compatibility",
  "reference-parity",
]);
const webgpuExceptionKinds = new Set(["reference-parity", "vgpu-api-gap"]);
const gpuBackends = new Set(["webgl", "webgpu"]);

function isGpuRenderer(
  renderer: ToolcraftFinalRenderer,
): renderer is "webgl" | "webgpu" {
  return renderer === "webgl" || renderer === "webgpu";
}

function validateException(
  value: unknown,
  kinds: ReadonlySet<string>,
  path: string,
  errors: string[],
): boolean {
  const validation = validateToolcraftGpuExceptionShape(value, kinds, path);
  errors.push(...validation.errors);
  return validation.valid;
}

function getProviderErrors(
  entry: Record<string, unknown>,
  surface: ToolcraftGpuSurface,
): Readonly<{ errors: string[]; permitsWebglPressure: boolean }> {
  const errors: string[] = [];
  const provider = entry.provider;
  const backend = entry.backend;
  const path = `rendererTechnique.gpu.${surface}`;
  let expectedKeys: readonly string[] = ["backend", "provider"];
  let permitsWebglPressure = false;

  switch (provider) {
    case "three":
      if (backend !== "webgl") {
        errors.push(`${path} provider "three" requires backend "webgl".`);
      }
      break;
    case "vgpu":
      expectedKeys = ["backend", "capability", "provider", "versionPolicy"];
      if (
        backend !== "webgpu" ||
        entry.capability !== "shader-webgpu-vgpu" ||
        entry.versionPolicy !== "app-pinned"
      ) {
        errors.push(
          `${path} provider "vgpu" requires the fixed VGPU capability and version policy.`,
        );
      }
      break;
    case "toolcraft-runtime":
      expectedKeys = ["backend", "owner", "provider"];
      if (backend !== "webgpu") {
        errors.push(
          `${path} provider "toolcraft-runtime" requires backend "webgpu".`,
        );
      }
      if (typeof entry.owner !== "string" || !entry.owner.trim()) {
        errors.push(`${path} must name its runtime owner.`);
      }
      break;
    case "native":
    case "reference-runtime":
      expectedKeys = ["backend", "exception", "provider"];
      if (backend === "webgl") {
        permitsWebglPressure = validateException(
          entry.exception,
          webglExceptionKinds,
          `${path}.exception`,
          errors,
        );
        if (!permitsWebglPressure) {
          errors.push(
            `${path} WebGL exceptions require browser-compatibility or reference-parity evidence.`,
          );
        }
      } else if (backend === "webgpu") {
        if (
          !validateException(
            entry.exception,
            webgpuExceptionKinds,
            `${path}.exception`,
            errors,
          )
        ) {
          errors.push(
            `${path} must use the approved VGPU provider or prove an API gap.`,
          );
        }
      }
      break;
    default:
      errors.push(`${path} must declare exactly one backend/provider.`);
  }

  const shapeValid = hasExactToolcraftGpuTechniqueKeys(entry, expectedKeys);
  if (!shapeValid) {
    errors.push(`${path} must contain exactly ${expectedKeys.join(", ")}.`);
  }

  return { errors, permitsWebglPressure: permitsWebglPressure && shapeValid };
}

export function deriveToolcraftGpuPressure(
  parsedPipeline: ToolcraftRendererPipelineParseResult,
  surface: ToolcraftGpuSurface,
): ToolcraftGpuPressure {
  const passIds = new Set<string>();
  const reasons = new Set<ToolcraftGpuPressure["reasons"][number]>();

  for (const pass of parsedPipeline.pipeline?.passes ?? []) {
    const gpu = pass.gpu;
    if (!gpu || !(gpu.surfaces as readonly string[]).includes(surface)) {
      continue;
    }
    if (gpu.stage === "compute") {
      passIds.add(pass.id);
      reasons.add("compute");
    }
    if (gpu.state === "feedback") {
      passIds.add(pass.id);
      reasons.add("feedback");
    }
    if (
      toolcraftGpuComputeResourceKinds.some(
        (resource) => resource === gpu.resources,
      )
    ) {
      passIds.add(pass.id);
      reasons.add("storage");
    }
  }

  return Object.freeze({
    passIds: Object.freeze([...passIds]),
    reasons: Object.freeze([...reasons]),
    surface,
  });
}

function getSurfaceErrors(
  context: ToolcraftEnvelopeValidationContext,
  surface: ToolcraftGpuSurface,
  finalRenderer: ToolcraftFinalRenderer,
  gpuMap: Record<string, unknown> | null,
): string[] {
  const errors: string[] = [];
  const targetedPasses = (context.parsedPipeline.pipeline?.passes ?? []).filter(
    (pass) =>
      (pass.gpu?.surfaces as readonly string[] | undefined)?.includes(surface),
  );
  const pipelineValid = context.parsedPipeline.errors.length === 0;
  const requiresEntry =
    (pipelineValid && targetedPasses.length > 0) || isGpuRenderer(finalRenderer);
  const entry = gpuMap?.[surface];
  const path = `rendererTechnique.gpu.${surface}`;

  if (entry === undefined) {
    if (requiresEntry) {
      errors.push(
        `${path} is required for the selected GPU renderer or targeted GPU pass.`,
      );
    }
    return errors;
  }

  if (pipelineValid && !requiresEntry) {
    errors.push(
      `${path} does not target a GPU pass or GPU final renderer.`,
    );
  }

  if (Array.isArray(entry) || !isToolcraftGpuTechniqueRecord(entry)) {
    errors.push(`${path} must declare exactly one backend/provider.`);
    return errors;
  }

  if (Object.prototype.hasOwnProperty.call(entry, "fallback")) {
    errors.push(
      `${path} fallback cannot satisfy or replace the primary backend.`,
    );
  }

  if (typeof entry.backend !== "string" || typeof entry.provider !== "string") {
    errors.push(`${path} must declare exactly one backend/provider.`);
    return errors;
  }
  if (!gpuBackends.has(entry.backend)) {
    errors.push(`${path} must declare exactly one supported GPU backend/provider.`);
    return errors;
  }

  if (isGpuRenderer(finalRenderer) && entry.backend !== finalRenderer) {
    errors.push(
      `${path}.backend "${entry.backend}" must match final renderer "${finalRenderer}".`,
    );
  }

  const providerValidation = getProviderErrors(entry, surface);
  errors.push(...providerValidation.errors);

  const pressure = deriveToolcraftGpuPressure(context.parsedPipeline, surface);
  if (
    pressure.reasons.length > 0 &&
    entry.backend === "webgl" &&
    !providerValidation.permitsWebglPressure
  ) {
    errors.push(
      `${path} uses WebGL even though GPU work in passes ${pressure.passIds.join(", ")} creates WebGPU pressure (${pressure.reasons.join(", ")}).`,
    );
  }
  return errors;
}

export function getToolcraftRendererGpuErrors(
  context: ToolcraftEnvelopeValidationContext,
): string[] {
  const technique = context.config.rendererTechnique;
  if (!technique) {
    return [];
  }

  const errors: string[] = [];
  const rawGpu = technique.gpu as unknown;
  const gpuMap = isToolcraftGpuTechniqueRecord(rawGpu) ? rawGpu : null;

  if (
    (context.config.rendererStrategy === "webgl" ||
      context.config.rendererStrategy === "webgpu") &&
    rawGpu === undefined
  ) {
    errors.push("GPU renderer strategies must declare rendererTechnique.gpu.");
  }

  if (rawGpu !== undefined) {
    if (
      !gpuMap ||
      !["preview", "export"].some((surface) => gpuMap[surface] !== undefined)
    ) {
      errors.push("rendererTechnique.gpu must be non-empty.");
    }
    if (
      gpuMap &&
      Object.prototype.hasOwnProperty.call(gpuMap, "fallback")
    ) {
      errors.push(
        "rendererTechnique.gpu fallback cannot satisfy or replace the primary backend.",
      );
    }
    for (const surface of Object.keys(gpuMap ?? {})) {
      if (surface !== "preview" && surface !== "export" && surface !== "fallback") {
        errors.push(
          `rendererTechnique.gpu.${surface} is not a supported surface entry.`,
        );
      }
    }
  }

  errors.push(
    ...getSurfaceErrors(
      context,
      "preview",
      technique.previewRenderer,
      gpuMap,
    ),
    ...getSurfaceErrors(
      context,
      "export",
      technique.exportRenderer,
      gpuMap,
    ),
  );

  return errors;
}
