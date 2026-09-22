import type {
  ToolcraftModelImportLimits,
  ToolcraftModelTopologyProfile,
} from "../../schema/types";
import {
  TOOLCRAFT_MODEL_REPAIR_ALGORITHM_VERSION,
  type ToolcraftModelRepairOperation,
  type ToolcraftModelRepairPlan,
} from "./model-repair-plan";
import { TOOLCRAFT_MODEL_TOPOLOGY_ANALYZER_VERSION } from "./model-topology-analysis";
import { digestToolcraftRepairPlanPayload } from "./model-topology-digest";

const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const MAX_ID_LENGTH = 1_024;
const MAX_PRECONDITION_LENGTH = 512;
const MAX_PRECONDITIONS = 32;
const MAX_TEXT_CODE_UNITS = 8 * 1024 * 1024;

type UnknownRecord = Record<string, unknown>;
type ValidationBudget = { numericEntries: number; textCodeUnits: number };

export type ToolcraftModelRepairPlanValidationOptions = Readonly<{
  expectedPlanDigest: string;
  expectedProfile?: ToolcraftModelTopologyProfile;
  expectedSourceDocumentDigest?: string;
  limits: Readonly<ToolcraftModelImportLimits>;
}>;

function invalid(message: string): never {
  throw Object.assign(new Error(message), {
    category: "repair",
    code: "repair-plan-envelope-invalid",
  });
}

function record(
  value: unknown,
  allowedKeys: readonly string[],
  label: string,
): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalid(`Repair plan envelope ${label} must be an object.`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !allowedKeys.includes(key))) {
    return invalid(`Repair plan envelope ${label} has unsupported fields.`);
  }
  return value as UnknownRecord;
}

function requireOnlyFields(
  value: UnknownRecord,
  fields: readonly string[],
  label: string,
): void {
  if (Reflect.ownKeys(value).some((key) =>
    typeof key !== "string" || !fields.includes(key)
  )) {
    invalid(`Repair plan envelope ${label} has unsupported fields.`);
  }
}

function string(
  value: unknown,
  label: string,
  maxLength = MAX_ID_LENGTH,
): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    return invalid(`Repair plan envelope ${label} is invalid.`);
  }
  return value;
}

function digest(value: unknown, label: string): string {
  const result = string(value, label, 71);
  if (!SHA256_DIGEST_PATTERN.test(result)) {
    return invalid(`Repair plan envelope ${label} digest is invalid.`);
  }
  return result;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) {
    return invalid(`Repair plan envelope ${label} must be a safe integer.`);
  }
  return value as number;
}

function nonNegativeInteger(
  value: unknown,
  label: string,
  maximum: number,
): number {
  const result = integer(value, label);
  if (result < 0 || result > maximum) {
    return invalid(`Repair plan envelope ${label} exceeds its limit.`);
  }
  return result;
}

function strings(
  value: unknown,
  budget: ValidationBudget,
): readonly string[] {
  if (!Array.isArray(value) || value.length > MAX_PRECONDITIONS) {
    return invalid("Repair plan envelope safety preconditions are invalid.");
  }
  const result: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      return invalid("Repair plan envelope contains a sparse string array.");
    }
    const entry = string(
      value[index],
      "safety precondition",
      MAX_PRECONDITION_LENGTH,
    );
    if (entry.length > budget.textCodeUnits) {
      return invalid("Repair plan envelope text exceeds its limit.");
    }
    budget.textCodeUnits -= entry.length;
    result.push(entry);
  }
  return Object.freeze(result);
}

function numbers(
  value: unknown,
  label: string,
  maximumLength: number,
  maximumValue: number,
  budget: ValidationBudget,
): readonly number[] {
  if (!Array.isArray(value) || value.length > maximumLength ||
      value.length > budget.numericEntries) {
    return invalid(`Repair plan envelope ${label} exceeds its limit.`);
  }
  const result: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      return invalid(`Repair plan envelope ${label} is sparse.`);
    }
    result.push(nonNegativeInteger(value[index], label, maximumValue));
  }
  budget.numericEntries -= result.length;
  return Object.freeze(result);
}

function countDelta(
  value: unknown,
  limits: Readonly<ToolcraftModelImportLimits>,
): Readonly<{ triangles: number; vertices: number }> {
  const input = record(value, ["triangles", "vertices"], "count delta");
  const triangles = integer(input.triangles, "triangle count delta");
  const vertices = integer(input.vertices, "vertex count delta");
  if (Math.abs(triangles) > limits.maxTriangles ||
      Math.abs(vertices) > limits.maxVertices) {
    return invalid("Repair plan envelope count delta exceeds its limit.");
  }
  return Object.freeze({ triangles, vertices });
}

function operation(
  value: unknown,
  limits: Readonly<ToolcraftModelImportLimits>,
  budget: ValidationBudget,
): ToolcraftModelRepairOperation {
  const candidate = record(value, [
    "expectedCountDelta",
    "flippedTriangleIndices",
    "primitiveId",
    "primitiveIndex",
    "removedVertexIndices",
    "retainedVertexIndices",
    "safetyPreconditions",
    "triangleIndices",
    "type",
    "vertexCount",
  ], "operation");
  const type = string(candidate.type, "operation type", 80);
  const commonFields = [
    "expectedCountDelta",
    "primitiveId",
    "primitiveIndex",
    "safetyPreconditions",
    "type",
  ];
  const specificFields = type === "compact-unused-vertices"
    ? ["removedVertexIndices", "retainedVertexIndices"]
    : type === "repair-local-winding"
      ? ["flippedTriangleIndices"]
      : type === "remove-duplicate-triangles" ||
          type === "remove-invalid-triangles"
        ? ["triangleIndices"]
        : type === "regenerate-normals"
          ? ["vertexCount"]
          : type === "recalculate-bounds"
            ? []
            : undefined;
  if (!specificFields) {
    return invalid("Repair plan envelope operation type is unsupported.");
  }
  requireOnlyFields(candidate, [...commonFields, ...specificFields], "operation");
  const primitiveId = string(candidate.primitiveId, "primitive id");
  if (primitiveId.length > budget.textCodeUnits) {
    return invalid("Repair plan envelope text exceeds its limit.");
  }
  budget.textCodeUnits -= primitiveId.length;
  const common = {
    expectedCountDelta: countDelta(candidate.expectedCountDelta, limits),
    primitiveId,
    primitiveIndex: nonNegativeInteger(
      candidate.primitiveIndex,
      "primitive index",
      limits.maxPrimitives - 1,
    ),
    safetyPreconditions: strings(candidate.safetyPreconditions, budget),
  };
  if (type === "compact-unused-vertices") {
    return Object.freeze({
      ...common,
      removedVertexIndices: numbers(candidate.removedVertexIndices,
        "removed vertex indices", limits.maxVertices, limits.maxVertices - 1, budget),
      retainedVertexIndices: numbers(candidate.retainedVertexIndices,
        "retained vertex indices", limits.maxVertices, limits.maxVertices - 1, budget),
      type,
    });
  }
  if (type === "repair-local-winding") {
    return Object.freeze({
      ...common,
      flippedTriangleIndices: numbers(candidate.flippedTriangleIndices,
        "flipped triangle indices", limits.maxTriangles, limits.maxTriangles - 1, budget),
      type,
    });
  }
  if (type === "remove-duplicate-triangles" ||
      type === "remove-invalid-triangles") {
    return Object.freeze({
      ...common,
      triangleIndices: numbers(candidate.triangleIndices,
        "triangle indices", limits.maxTriangles, limits.maxTriangles - 1, budget),
      type,
    });
  }
  if (type === "regenerate-normals") {
    return Object.freeze({
      ...common,
      type,
      vertexCount: nonNegativeInteger(
        candidate.vertexCount,
        "normal vertex count",
        limits.maxVertices,
      ),
    });
  }
  if (type === "recalculate-bounds") {
    return Object.freeze({ ...common, type });
  }
  return invalid("Repair plan envelope operation type is unsupported.");
}

export function validateToolcraftModelRepairPlan(
  value: unknown,
  options: ToolcraftModelRepairPlanValidationOptions,
): ToolcraftModelRepairPlan {
  const candidate = record(value, [
    "algorithmVersion",
    "analyzerVersion",
    "operations",
    "planDigest",
    "profile",
    "recipeId",
    "sourceDocumentDigest",
  ], "payload");
  if (!Array.isArray(candidate.operations) || candidate.operations.length === 0 ||
      candidate.operations.length > options.limits.maxPrimitives * 6 + 1) {
    return invalid("Repair plan envelope operation count exceeds its limit.");
  }
  const budget: ValidationBudget = {
    numericEntries: options.limits.maxTriangles * 3 +
      options.limits.maxVertices * 2,
    textCodeUnits: MAX_TEXT_CODE_UNITS,
  };
  const operations = Object.freeze(candidate.operations.map((entry) =>
    operation(entry, options.limits, budget)
  ));
  const algorithmVersion = string(candidate.algorithmVersion, "algorithm version", 80);
  const analyzerVersion = string(candidate.analyzerVersion, "analyzer version", 80);
  const planDigest = digest(candidate.planDigest, "semantic plan");
  const sourceDocumentDigest = digest(
    candidate.sourceDocumentDigest,
    "source document",
  );
  const profile = candidate.profile;
  if (profile !== "realtime-mesh" && profile !== "solid-mesh") {
    return invalid("Repair plan envelope profile is invalid.");
  }
  const validatedProfile: ToolcraftModelTopologyProfile = profile;
  if (algorithmVersion !== TOOLCRAFT_MODEL_REPAIR_ALGORITHM_VERSION ||
      analyzerVersion !== TOOLCRAFT_MODEL_TOPOLOGY_ANALYZER_VERSION ||
      (options.expectedProfile !== undefined &&
        validatedProfile !== options.expectedProfile) ||
      (options.expectedSourceDocumentDigest !== undefined &&
        sourceDocumentDigest !== options.expectedSourceDocumentDigest) ||
      planDigest !== options.expectedPlanDigest ||
      candidate.recipeId !== `${algorithmVersion}:${planDigest}`) {
    return invalid("Repair plan envelope identity or digest is invalid.");
  }
  const payload = {
    algorithmVersion,
    analyzerVersion,
    operations,
    profile: validatedProfile,
    sourceDocumentDigest,
  };
  if (digestToolcraftRepairPlanPayload(payload) !== planDigest) {
    return invalid("Repair plan envelope semantic digest does not match its payload.");
  }
  return Object.freeze({
    ...payload,
    planDigest,
    recipeId: `${algorithmVersion}:${planDigest}`,
  });
}
