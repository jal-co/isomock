import type {
  ToolcraftModelBounds,
  ToolcraftModelPrimitive,
} from "./model-document";
import type { ToolcraftCanonicalModelLimits } from "./model-document-limits";
import {
  isDenseArray,
  isNonemptyString,
  isRecord,
} from "./model-document-validation-helpers";
import {
  modelDocumentFailure,
  VALID_TOOLCRAFT_MODEL_DOCUMENT,
  type ToolcraftModelDocumentValidationFailure,
  type ToolcraftModelDocumentValidationResult,
} from "./model-document-validation-result";

type GeometryTotals = { triangles: number; vertices: number };
type PrimitiveValidationResult =
  | { ok: true; triangles: number; vertices: number }
  | ToolcraftModelDocumentValidationFailure;

export function validateModelBounds(
  value: unknown,
  path: string,
): ToolcraftModelDocumentValidationResult {
  if (!isRecord(value) || !isDenseArray(value.min) || !isDenseArray(value.max)) {
    return modelDocumentFailure(
      "invalid-bound",
      path,
      `${path} must contain min and max XYZ tuples.`,
    );
  }

  if (value.min.length !== 3 || value.max.length !== 3) {
    return modelDocumentFailure(
      "invalid-bound",
      path,
      `${path} must contain exactly three min and max components.`,
    );
  }

  for (let axis = 0; axis < 3; axis += 1) {
    const min = value.min[axis];
    const max = value.max[axis];

    if (
      typeof min !== "number" ||
      typeof max !== "number" ||
      !Number.isFinite(min) ||
      !Number.isFinite(max)
    ) {
      return modelDocumentFailure(
        "non-finite-bound",
        `${path}.${typeof min !== "number" || !Number.isFinite(min) ? "min" : "max"}[${axis}]`,
        `${path} components must be finite numbers.`,
      );
    }

    if (min > max) {
      return modelDocumentFailure(
        "unordered-bound",
        `${path}[${axis}]`,
        `${path}.min must not exceed ${path}.max.`,
      );
    }
  }

  return VALID_TOOLCRAFT_MODEL_DOCUMENT;
}

function geometryBounds(positions: Float32Array): ToolcraftModelBounds {
  const min: [number, number, number] = [
    positions[0]!,
    positions[1]!,
    positions[2]!,
  ];
  const max: [number, number, number] = [...min];

  for (let offset = 3; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[offset + axis]!;
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }

  return { max, min };
}

export function modelBoundsEqual(
  left: ToolcraftModelBounds,
  right: ToolcraftModelBounds,
): boolean {
  return left.min.every((value, axis) => value === right.min[axis]) &&
    left.max.every((value, axis) => value === right.max[axis]);
}

function hasRenderableTriangle(
  positions: Float32Array,
  indices: Uint32Array,
): boolean {
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset]!;
    const b = indices[offset + 1]!;
    const c = indices[offset + 2]!;

    if (a === b || a === c || b === c) {
      continue;
    }

    const rawAx = positions[a * 3]!;
    const rawAy = positions[a * 3 + 1]!;
    const rawAz = positions[a * 3 + 2]!;
    const rawBx = positions[b * 3]!;
    const rawBy = positions[b * 3 + 1]!;
    const rawBz = positions[b * 3 + 2]!;
    const rawCx = positions[c * 3]!;
    const rawCy = positions[c * 3 + 1]!;
    const rawCz = positions[c * 3 + 2]!;
    const scale = Math.max(
      Math.abs(rawAx), Math.abs(rawAy), Math.abs(rawAz),
      Math.abs(rawBx), Math.abs(rawBy), Math.abs(rawBz),
      Math.abs(rawCx), Math.abs(rawCy), Math.abs(rawCz),
    );

    if (scale === 0) {
      continue;
    }

    const ax = rawAx / scale;
    const ay = rawAy / scale;
    const az = rawAz / scale;
    const abx = rawBx / scale - ax;
    const aby = rawBy / scale - ay;
    const abz = rawBz / scale - az;
    const acx = rawCx / scale - ax;
    const acy = rawCy / scale - ay;
    const acz = rawCz / scale - az;
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;

    if (crossX !== 0 || crossY !== 0 || crossZ !== 0) {
      return true;
    }
  }

  return false;
}

export function validateModelPrimitive(
  value: unknown,
  index: number,
  totals: GeometryTotals,
  limits: ToolcraftCanonicalModelLimits,
): PrimitiveValidationResult {
  const path = `primitives[${index}]`;

  if (!isRecord(value)) {
    return modelDocumentFailure(
      "invalid-primitive",
      path,
      `${path} must be an object.`,
    );
  }

  if (!isNonemptyString(value.id)) {
    return modelDocumentFailure(
      "empty-id",
      `${path}.id`,
      `${path}.id must be a nonempty string.`,
    );
  }

  const boundsResult = validateModelBounds(value.bounds, `${path}.bounds`);
  if (!boundsResult.ok) {
    return boundsResult;
  }

  if (!(value.positions instanceof Float32Array)) {
    return modelDocumentFailure(
      "invalid-positions-type",
      `${path}.positions`,
      `${path}.positions must be a Float32Array.`,
    );
  }

  if (value.positions.length === 0) {
    return modelDocumentFailure(
      "empty-primitive",
      `${path}.positions`,
      `${path} must contain position data.`,
    );
  }

  if (value.positions.length % 3 !== 0) {
    return modelDocumentFailure(
      "invalid-position-cardinality",
      `${path}.positions`,
      `${path}.positions must contain XYZ triples.`,
    );
  }

  const vertices = value.positions.length / 3;
  if (totals.vertices + vertices > limits.maxVertices) {
    return modelDocumentFailure(
      "max-vertices-exceeded",
      `${path}.positions`,
      `Canonical geometry exceeds maxVertices ${limits.maxVertices}.`,
    );
  }

  for (let component = 0; component < value.positions.length; component += 1) {
    if (!Number.isFinite(value.positions[component])) {
      return modelDocumentFailure(
        "non-finite-position",
        `${path}.positions[${component}]`,
        `${path}.positions must contain only finite values.`,
      );
    }
  }

  if (!(value.indices instanceof Uint32Array)) {
    return modelDocumentFailure(
      "invalid-indices-type",
      `${path}.indices`,
      `${path}.indices must be a Uint32Array.`,
    );
  }

  if (value.indices.length === 0) {
    return modelDocumentFailure(
      "empty-primitive",
      `${path}.indices`,
      `${path} must contain at least one triangle.`,
    );
  }

  if (value.indices.length % 3 !== 0) {
    return modelDocumentFailure(
      "invalid-triangle-cardinality",
      `${path}.indices`,
      `${path}.indices must contain triangle triples.`,
    );
  }

  const triangles = value.indices.length / 3;
  if (totals.triangles + triangles > limits.maxTriangles) {
    return modelDocumentFailure(
      "max-triangles-exceeded",
      `${path}.indices`,
      `Canonical geometry exceeds maxTriangles ${limits.maxTriangles}.`,
    );
  }

  for (let component = 0; component < value.indices.length; component += 1) {
    if (value.indices[component]! >= vertices) {
      return modelDocumentFailure(
        "index-out-of-range",
        `${path}.indices[${component}]`,
        `${path}.indices[${component}] exceeds the primitive vertex range.`,
      );
    }
  }

  if (value.normals !== undefined) {
    if (!(value.normals instanceof Float32Array)) {
      return modelDocumentFailure(
        "invalid-normals-type",
        `${path}.normals`,
        `${path}.normals must be a Float32Array when provided.`,
      );
    }

    if (value.normals.length !== value.positions.length) {
      return modelDocumentFailure(
        "normal-count-mismatch",
        `${path}.normals`,
        `${path}.normals must match the position component count.`,
      );
    }

    for (let component = 0; component < value.normals.length; component += 1) {
      if (!Number.isFinite(value.normals[component])) {
        return modelDocumentFailure(
          "non-finite-normal",
          `${path}.normals[${component}]`,
          `${path}.normals must contain only finite values.`,
        );
      }
    }
  }

  if (!modelBoundsEqual(value.bounds as ToolcraftModelBounds, geometryBounds(value.positions))) {
    return modelDocumentFailure(
      "primitive-bounds-mismatch",
      `${path}.bounds`,
      `${path}.bounds must exactly match its positions.`,
    );
  }

  if (!hasRenderableTriangle(value.positions, value.indices)) {
    return modelDocumentFailure(
      "no-renderable-triangle",
      `${path}.indices`,
      `${path} must contain at least one nondegenerate triangle.`,
    );
  }

  return { ok: true, triangles, vertices };
}

export function aggregatePrimitiveBounds(
  primitives: readonly ToolcraftModelPrimitive[],
): ToolcraftModelBounds {
  const first = primitives[0]!.bounds;
  const min: [number, number, number] = [...first.min];
  const max: [number, number, number] = [...first.max];

  for (let index = 1; index < primitives.length; index += 1) {
    const bounds = primitives[index]!.bounds;
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], bounds.min[axis]);
      max[axis] = Math.max(max[axis], bounds.max[axis]);
    }
  }

  return { max, min };
}
