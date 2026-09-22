import type { ToolcraftModelTopologyProfile } from "../../schema/types";
import type {
  ToolcraftModelDocument,
  ToolcraftModelRepairOperationType,
} from "../canonical/model-document";
import { regenerateAreaWeightedNormals } from "./model-repair-geometry";
import {
  digestToolcraftRepairPlanPayload,
  digestToolcraftTopologyDocument,
} from "./model-topology-digest";
import type {
  ToolcraftModelTopologyGraph,
  ToolcraftPrimitiveTopologyGraph,
} from "./model-topology-graph";

export const TOOLCRAFT_MODEL_REPAIR_ALGORITHM_VERSION = "toolcraft-safe-repair@1";

type CountDelta = Readonly<{ triangles: number; vertices: number }>;

type RepairOperationBase = Readonly<{
  expectedCountDelta: CountDelta;
  primitiveId: string;
  primitiveIndex: number;
  safetyPreconditions: readonly string[];
  type: ToolcraftModelRepairOperationType;
}>;

export type ToolcraftRemoveTrianglesRepairOperation = RepairOperationBase & Readonly<{
  triangleIndices: readonly number[];
  type: "remove-duplicate-triangles" | "remove-invalid-triangles";
}>;

export type ToolcraftCompactVerticesRepairOperation = RepairOperationBase & Readonly<{
  removedVertexIndices: readonly number[];
  retainedVertexIndices: readonly number[];
  type: "compact-unused-vertices";
}>;

export type ToolcraftRepairLocalWindingOperation = RepairOperationBase & Readonly<{
  flippedTriangleIndices: readonly number[];
  type: "repair-local-winding";
}>;

export type ToolcraftRegenerateNormalsRepairOperation = RepairOperationBase & Readonly<{
  vertexCount: number;
  type: "regenerate-normals";
}>;

export type ToolcraftRecalculateBoundsRepairOperation = RepairOperationBase & Readonly<{
  type: "recalculate-bounds";
}>;

export type ToolcraftModelRepairOperation =
  | ToolcraftCompactVerticesRepairOperation
  | ToolcraftRecalculateBoundsRepairOperation
  | ToolcraftRegenerateNormalsRepairOperation
  | ToolcraftRemoveTrianglesRepairOperation
  | ToolcraftRepairLocalWindingOperation;

export type ToolcraftModelRepairPlan = Readonly<{
  algorithmVersion: string;
  analyzerVersion: string;
  operations: readonly ToolcraftModelRepairOperation[];
  planDigest: string;
  profile: ToolcraftModelTopologyProfile;
  recipeId: string;
  sourceDocumentDigest: string;
}>;

function freezeNumbers(values: readonly number[]): readonly number[] {
  return Object.freeze([...values]);
}

function freezeOperation(
  operation: ToolcraftModelRepairOperation,
): ToolcraftModelRepairOperation {
  const arrays = operation.type === "compact-unused-vertices"
    ? {
        removedVertexIndices: freezeNumbers(operation.removedVertexIndices),
        retainedVertexIndices: freezeNumbers(operation.retainedVertexIndices),
      }
    : operation.type === "repair-local-winding"
      ? { flippedTriangleIndices: freezeNumbers(operation.flippedTriangleIndices) }
      : operation.type === "remove-duplicate-triangles" ||
          operation.type === "remove-invalid-triangles"
        ? { triangleIndices: freezeNumbers(operation.triangleIndices) }
        : {};
  return Object.freeze({
    ...operation,
    ...arrays,
    expectedCountDelta: Object.freeze({ ...operation.expectedCountDelta }),
    safetyPreconditions: Object.freeze([...operation.safetyPreconditions]),
  }) as ToolcraftModelRepairOperation;
}

function baseOperation(
  graph: ToolcraftPrimitiveTopologyGraph,
  type: ToolcraftModelRepairOperationType,
  expectedCountDelta: CountDelta,
  safetyPreconditions: readonly string[],
): RepairOperationBase {
  return {
    expectedCountDelta,
    primitiveId: graph.primitive.id,
    primitiveIndex: graph.primitiveIndex,
    safetyPreconditions,
    type,
  };
}

function effectiveIndices(graph: ToolcraftPrimitiveTopologyGraph): Uint32Array {
  const values: number[] = [];
  const flips = new Set(graph.flippedTriangleIndices);
  for (const triangle of graph.renderableTriangles) {
    const [a, b, c] = triangle.indices;
    values.push(a, flips.has(triangle.sourceTriangleIndex) ? c : b,
      flips.has(triangle.sourceTriangleIndex) ? b : c);
  }
  return new Uint32Array(values);
}

function canRegenerateNormals(graph: ToolcraftPrimitiveTopologyGraph): boolean {
  if (!(graph.primitive.positions instanceof Float32Array)) return false;
  const retained = new Set<number>();
  for (const triangle of graph.renderableTriangles) {
    for (const vertex of triangle.indices) retained.add(vertex);
  }
  const retainedVertices = [...retained].sort((a, b) => a - b);
  const remap = new Map(retainedVertices.map((vertex, index) => [vertex, index]));
  const positions = new Float32Array(retainedVertices.length * 3);
  retainedVertices.forEach((vertex, target) => {
    positions.set(graph.primitive.positions.subarray(vertex * 3, vertex * 3 + 3), target * 3);
  });
  const indices = effectiveIndices(graph);
  for (let index = 0; index < indices.length; index += 1) {
    indices[index] = remap.get(indices[index]!)!;
  }
  return regenerateAreaWeightedNormals(positions, indices) !== undefined;
}

function primitiveOperations(
  graph: ToolcraftPrimitiveTopologyGraph,
): ToolcraftModelRepairOperation[] | undefined {
  const operations: ToolcraftModelRepairOperation[] = [];
  const invalidTriangles = [
    ...graph.repeatedIndexTriangleIndices,
    ...graph.zeroAreaTriangleIndices,
  ].sort((a, b) => a - b);
  if (invalidTriangles.length > 0) {
    operations.push({
      ...baseOperation(graph, "remove-invalid-triangles", {
        triangles: -invalidTriangles.length,
        vertices: 0,
      }, ["indices are in range", "at least one renderable triangle remains"]),
      triangleIndices: invalidTriangles,
      type: "remove-invalid-triangles",
    });
  }
  if (graph.duplicateTriangleIndices.length > 0) {
    operations.push({
      ...baseOperation(graph, "remove-duplicate-triangles", {
        triangles: -graph.duplicateTriangleIndices.length,
        vertices: 0,
      }, ["triangles have exact cyclic index order"]),
      triangleIndices: graph.duplicateTriangleIndices,
      type: "remove-duplicate-triangles",
    });
  }
  if (graph.flippedTriangleIndices.length > 0 && graph.orientable &&
      graph.nonManifoldEdges.length === 0 &&
      graph.nonManifoldVertexIndices.length === 0 &&
      graph.oppositeWindingDuplicateTriangleIndices.length === 0) {
    operations.push({
      ...baseOperation(graph, "repair-local-winding", {
        triangles: 0,
        vertices: 0,
      }, ["edge parity is contradiction-free", "component anchors are deterministic"]),
      flippedTriangleIndices: graph.flippedTriangleIndices,
      type: "repair-local-winding",
    });
  }
  if (graph.unusedVertexIndices.length > 0) {
    const removed = new Set(graph.unusedVertexIndices);
    const retained: number[] = [];
    for (let vertex = 0; vertex < graph.vertexCount; vertex += 1) {
      if (!removed.has(vertex)) retained.push(vertex);
    }
    operations.push({
      ...baseOperation(graph, "compact-unused-vertices", {
        triangles: 0,
        vertices: -graph.unusedVertexIndices.length,
      }, ["retained indices have a one-to-one stable remap"]),
      removedVertexIndices: graph.unusedVertexIndices,
      retainedVertexIndices: retained,
      type: "compact-unused-vertices",
    });
  }
  if (graph.normalIssue !== "none") {
    if (!canRegenerateNormals(graph)) return undefined;
    operations.push({
      ...baseOperation(graph, "regenerate-normals", {
        triangles: 0,
        vertices: 0,
      }, ["area-weighted sums are finite and nonzero", "vertex identity remains distinct"]),
      type: "regenerate-normals",
      vertexCount: graph.vertexCount - graph.unusedVertexIndices.length,
    });
  }
  if (operations.length > 0 || !graph.primitiveBoundsValid) {
    operations.push({
      ...baseOperation(graph, "recalculate-bounds", {
        triangles: 0,
        vertices: 0,
      }, ["positions are finite XYZ triples"]),
      type: "recalculate-bounds",
    });
  }
  return operations;
}

function solidRequirementsCanBeProven(graph: ToolcraftModelTopologyGraph): boolean {
  return graph.primitives.every((primitive) =>
    primitive.boundaryEdges.length === 0 &&
    primitive.nonManifoldEdges.length === 0 &&
    primitive.nonManifoldVertexIndices.length === 0 &&
    primitive.oppositeWindingDuplicateTriangleIndices.length === 0 &&
    primitive.orientable
  );
}

export function compileToolcraftModelRepairPlan(
  document: ToolcraftModelDocument,
  graph: ToolcraftModelTopologyGraph,
  profile: ToolcraftModelTopologyProfile,
  analyzerVersion: string,
): ToolcraftModelRepairPlan | undefined {
  if (profile === "solid-mesh" && !solidRequirementsCanBeProven(graph)) {
    return undefined;
  }
  const operations: ToolcraftModelRepairOperation[] = [];
  for (const primitive of graph.primitives) {
    const compiled = primitiveOperations(primitive);
    if (compiled === undefined) return undefined;
    operations.push(...compiled);
  }
  if (!graph.documentBoundsValid &&
      !operations.some((operation) => operation.type === "recalculate-bounds")) {
    const first = graph.primitives[0];
    if (first === undefined) return undefined;
    operations.push({
      ...baseOperation(first, "recalculate-bounds", { triangles: 0, vertices: 0 },
        ["positions are finite XYZ triples"]),
      type: "recalculate-bounds",
    });
  }
  if (operations.length === 0) return undefined;

  const sourceDocumentDigest = digestToolcraftTopologyDocument(document);
  const payload = {
    algorithmVersion: TOOLCRAFT_MODEL_REPAIR_ALGORITHM_VERSION,
    analyzerVersion,
    operations,
    profile,
    sourceDocumentDigest,
  };
  const planDigest = digestToolcraftRepairPlanPayload(payload);
  const frozenOperations = Object.freeze(operations.map(freezeOperation));
  return Object.freeze({
    ...payload,
    operations: frozenOperations,
    planDigest,
    profile,
    recipeId: `${TOOLCRAFT_MODEL_REPAIR_ALGORITHM_VERSION}:${planDigest}`,
  });
}
