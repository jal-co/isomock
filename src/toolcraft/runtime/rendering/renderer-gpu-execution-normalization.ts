import {
  toolcraftGpuComputeResourceKinds,
  toolcraftGpuPassResourceKinds,
  toolcraftGpuPassStages,
  toolcraftGpuPassStates,
  toolcraftGpuPassSurfaceSets,
  type ToolcraftGpuPassExecution,
} from "./renderer-gpu-contract";

export type ToolcraftGpuPassExecutionNormalizationError = Readonly<{
  field: "resources" | "stage" | "state" | "surfaces" | null;
  message: string;
}>;

export type ToolcraftGpuPassExecutionNormalizationResult = Readonly<{
  errors: readonly ToolcraftGpuPassExecutionNormalizationError[];
  value: ToolcraftGpuPassExecution | null;
}>;

function formatSupportedValues(values: readonly unknown[]): string {
  const formatted = values.map((value) => JSON.stringify(value));
  return `${formatted.slice(0, -1).join(", ")}, or ${formatted.at(-1)}`;
}

function includesValue<Value extends string>(
  values: readonly Value[],
  value: unknown,
): value is Value {
  return typeof value === "string" && values.includes(value as Value);
}

function gpuError(
  field: ToolcraftGpuPassExecutionNormalizationError["field"],
  message: string,
): ToolcraftGpuPassExecutionNormalizationError {
  return Object.freeze({ field, message });
}

export function normalizeToolcraftGpuPassExecution(
  value: unknown,
): ToolcraftGpuPassExecutionNormalizationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return Object.freeze({
      errors: Object.freeze([gpuError(null, "must be a non-null object.")]),
      value: null,
    });
  }
  const record = value as Record<string, unknown>;
  const errors: ToolcraftGpuPassExecutionNormalizationError[] = [];
  const resources = includesValue(toolcraftGpuPassResourceKinds, record.resources)
    ? record.resources
    : null;
  const stage = includesValue(toolcraftGpuPassStages, record.stage)
    ? record.stage
    : null;
  const state = includesValue(toolcraftGpuPassStates, record.state)
    ? record.state
    : null;
  const inputSurfaces = record.surfaces;
  const surfaces = Array.isArray(inputSurfaces)
    ? toolcraftGpuPassSurfaceSets.find(
        (candidate) =>
          candidate.length === inputSurfaces.length &&
          candidate.every((surface, index) => surface === inputSurfaces[index]),
      ) ?? null
    : null;
  if (resources === null) {
    errors.push(
      gpuError(
        "resources",
        `must be one of ${formatSupportedValues(toolcraftGpuPassResourceKinds)}.`,
      ),
    );
  }
  if (stage === null) {
    errors.push(
      gpuError(
        "stage",
        `must be one of ${formatSupportedValues(toolcraftGpuPassStages)}.`,
      ),
    );
  }
  if (state === null) {
    errors.push(
      gpuError(
        "state",
        `must be one of ${formatSupportedValues(toolcraftGpuPassStates)}.`,
      ),
    );
  }
  if (surfaces === null) {
    errors.push(
      gpuError(
        "surfaces",
        `must be one of ${formatSupportedValues(toolcraftGpuPassSurfaceSets)}.`,
      ),
    );
  }
  if (
    stage === "compute" &&
    resources !== null &&
    !includesValue(toolcraftGpuComputeResourceKinds, resources)
  ) {
    errors.push(
      gpuError(
        "resources",
        `must be one of ${formatSupportedValues(toolcraftGpuComputeResourceKinds)} when stage is "compute".`,
      ),
    );
  }
  if (
    errors.length > 0 ||
    resources === null ||
    stage === null ||
    state === null ||
    surfaces === null
  ) {
    return Object.freeze({ errors: Object.freeze(errors), value: null });
  }
  const normalized = Object.freeze({
    resources,
    stage,
    state,
    surfaces,
  }) as ToolcraftGpuPassExecution;
  return Object.freeze({ errors: Object.freeze([]), value: normalized });
}
