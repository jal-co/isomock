import type {
  ToolcraftModelBounds,
  ToolcraftModelDocument,
  ToolcraftModelPrimitive,
} from "../canonical/model-document";
import {
  boundsEqual,
  calculatePositionBounds,
  edgeKey,
  isZeroAreaVector,
  sameWindingKey,
  triangleAreaVector,
  unorderedTriangleKey,
  type TriangleIndices,
} from "./model-topology-math";

export type ToolcraftTopologyTriangle = Readonly<{
  indices: TriangleIndices;
  sourceTriangleIndex: number;
}>;

type EdgeIncidence = Readonly<{
  direction: -1 | 1;
  from: number;
  sourceTriangleIndex: number;
  to: number;
}>;

export type ToolcraftTopologyEdge = Readonly<{
  incidences: readonly EdgeIncidence[];
  key: number;
  vertices: readonly [number, number];
}>;

export type ToolcraftPrimitiveTopologyGraph = Readonly<{
  boundaryEdges: readonly ToolcraftTopologyEdge[];
  componentCount: number;
  duplicateTriangleIndices: readonly number[];
  edges: readonly ToolcraftTopologyEdge[];
  expectedBounds?: ToolcraftModelBounds;
  flippedTriangleIndices: readonly number[];
  indexCardinalityValid: boolean;
  indicesValid: boolean;
  invalidIndexCount: number;
  nonFinitePositionCount: number;
  nonManifoldEdges: readonly ToolcraftTopologyEdge[];
  nonManifoldVertexIndices: readonly number[];
  normalIssue:
    | "count-mismatch"
    | "missing"
    | "non-finite"
    | "none"
    | "zero-length";
  oppositeWindingDuplicateTriangleIndices: readonly number[];
  orientable: boolean;
  positionCardinalityValid: boolean;
  primitive: ToolcraftModelPrimitive;
  primitiveBoundsValid: boolean;
  primitiveIndex: number;
  renderableTriangles: readonly ToolcraftTopologyTriangle[];
  repeatedIndexTriangleIndices: readonly number[];
  sourceBoundaryEdges: readonly ToolcraftTopologyEdge[];
  sourceEdges: readonly ToolcraftTopologyEdge[];
  sourceNonManifoldEdges: readonly ToolcraftTopologyEdge[];
  sourceNonManifoldVertexIndices: readonly number[];
  triangleCount: number;
  unusedVertexIndices: readonly number[];
  vertexCount: number;
  windingConflictEdgeCount: number;
  zeroAreaTriangleIndices: readonly number[];
}>;

export type ToolcraftModelTopologyGraph = Readonly<{
  documentBoundsValid: boolean;
  primitives: readonly ToolcraftPrimitiveTopologyGraph[];
}>;

function countNormalIssue(
  primitive: ToolcraftModelPrimitive,
  vertexCount: number,
): ToolcraftPrimitiveTopologyGraph["normalIssue"] {
  if (primitive.normals === undefined) return "missing";
  if (!(primitive.normals instanceof Float32Array) ||
      primitive.normals.length !== vertexCount * 3) {
    return "count-mismatch";
  }
  let hasZero = false;
  for (let offset = 0; offset < primitive.normals.length; offset += 3) {
    const x = primitive.normals[offset]!;
    const y = primitive.normals[offset + 1]!;
    const z = primitive.normals[offset + 2]!;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return "non-finite";
    }
    if (x === 0 && y === 0 && z === 0) hasZero = true;
  }
  return hasZero ? "zero-length" : "none";
}

function collectRenderableTriangles(
  primitive: ToolcraftModelPrimitive,
  vertexCount: number,
): {
  duplicateTriangleIndices: number[];
  invalidIndexCount: number;
  oppositeWindingDuplicateTriangleIndices: number[];
  renderableTriangles: ToolcraftTopologyTriangle[];
  sourceRenderableTriangles: ToolcraftTopologyTriangle[];
  repeatedIndexTriangleIndices: number[];
  zeroAreaTriangleIndices: number[];
} {
  const duplicateTriangleIndices: number[] = [];
  const oppositeWindingDuplicateTriangleIndices: number[] = [];
  const renderableTriangles: ToolcraftTopologyTriangle[] = [];
  const sourceRenderableTriangles: ToolcraftTopologyTriangle[] = [];
  const repeatedIndexTriangleIndices: number[] = [];
  const zeroAreaTriangleIndices: number[] = [];
  const firstWindingByUnorderedKey = new Map<string, string>();
  const seenWindingKeys = new Set<string>();
  let invalidIndexCount = 0;

  if (!(primitive.indices instanceof Uint32Array) ||
      !(primitive.positions instanceof Float32Array) ||
      primitive.indices.length % 3 !== 0) {
    return {
      duplicateTriangleIndices,
      invalidIndexCount,
      oppositeWindingDuplicateTriangleIndices,
      renderableTriangles,
      sourceRenderableTriangles,
      repeatedIndexTriangleIndices,
      zeroAreaTriangleIndices,
    };
  }

  for (let offset = 0; offset < primitive.indices.length; offset += 3) {
    const sourceTriangleIndex = offset / 3;
    const indices = [
      primitive.indices[offset]!,
      primitive.indices[offset + 1]!,
      primitive.indices[offset + 2]!,
    ] as const;
    const outOfRange = indices.filter((index) => index >= vertexCount).length;
    if (outOfRange > 0) {
      invalidIndexCount += outOfRange;
      continue;
    }
    if (indices[0] === indices[1] || indices[0] === indices[2] ||
        indices[1] === indices[2]) {
      repeatedIndexTriangleIndices.push(sourceTriangleIndex);
      continue;
    }
    if (isZeroAreaVector(triangleAreaVector(primitive.positions, indices))) {
      zeroAreaTriangleIndices.push(sourceTriangleIndex);
      continue;
    }

    sourceRenderableTriangles.push({ indices, sourceTriangleIndex });

    const windingKey = sameWindingKey(indices);
    const unorderedKey = unorderedTriangleKey(indices);
    if (seenWindingKeys.has(windingKey)) {
      duplicateTriangleIndices.push(sourceTriangleIndex);
      continue;
    }
    const firstWinding = firstWindingByUnorderedKey.get(unorderedKey);
    if (firstWinding !== undefined && firstWinding !== windingKey) {
      oppositeWindingDuplicateTriangleIndices.push(sourceTriangleIndex);
    } else if (firstWinding === undefined) {
      firstWindingByUnorderedKey.set(unorderedKey, windingKey);
    }
    seenWindingKeys.add(windingKey);
    renderableTriangles.push({ indices, sourceTriangleIndex });
  }

  return {
    duplicateTriangleIndices,
    invalidIndexCount,
    oppositeWindingDuplicateTriangleIndices,
    renderableTriangles,
    sourceRenderableTriangles,
    repeatedIndexTriangleIndices,
    zeroAreaTriangleIndices,
  };
}

function buildEdges(
  triangles: readonly ToolcraftTopologyTriangle[],
  vertexCount: number,
): ToolcraftTopologyEdge[] {
  const incidenceByEdge = new Map<number, EdgeIncidence[]>();
  for (const triangle of triangles) {
    const [a, b, c] = triangle.indices;
    for (const [from, to] of [[a, b], [b, c], [c, a]] as const) {
      const key = edgeKey(from, to, vertexCount);
      const incidences = incidenceByEdge.get(key) ?? [];
      incidences.push({
        direction: from < to ? 1 : -1,
        from,
        sourceTriangleIndex: triangle.sourceTriangleIndex,
        to,
      });
      incidenceByEdge.set(key, incidences);
    }
  }
  return [...incidenceByEdge.entries()]
    .sort(([left], [right]) => left - right)
    .map(([key, incidences]) => {
      incidences.sort((left, right) =>
        left.sourceTriangleIndex - right.sourceTriangleIndex
      );
      const first = Math.floor(key / vertexCount);
      const second = key % vertexCount;
      return { incidences, key, vertices: [first, second] };
    });
}

function triangleAdjacency(
  triangles: readonly ToolcraftTopologyTriangle[],
  edges: readonly ToolcraftTopologyEdge[],
): Map<number, Set<number>> {
  const adjacency = new Map<number, Set<number>>();
  for (const triangle of triangles) {
    adjacency.set(triangle.sourceTriangleIndex, new Set());
  }
  for (const edge of edges) {
    for (let index = 1; index < edge.incidences.length; index += 1) {
      const a = edge.incidences[index - 1]!.sourceTriangleIndex;
      const b = edge.incidences[index]!.sourceTriangleIndex;
      adjacency.get(a)!.add(b);
      adjacency.get(b)!.add(a);
    }
  }
  return adjacency;
}

function countComponents(adjacency: ReadonlyMap<number, ReadonlySet<number>>): number {
  const seen = new Set<number>();
  let count = 0;
  const roots = [...adjacency.keys()].sort((a, b) => a - b);
  for (const root of roots) {
    if (seen.has(root)) continue;
    count += 1;
    const queue = [root];
    seen.add(root);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const neighbors = [...(adjacency.get(queue[cursor]!) ?? [])]
        .sort((a, b) => a - b);
      for (const neighbor of neighbors) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }
  return count;
}

function solveWinding(
  triangles: readonly ToolcraftTopologyTriangle[],
  edges: readonly ToolcraftTopologyEdge[],
): { conflictEdgeCount: number; flippedTriangleIndices: number[]; orientable: boolean } {
  const constraints = new Map<number, { neighbor: number; xor: 0 | 1 }[]>();
  for (const triangle of triangles) constraints.set(triangle.sourceTriangleIndex, []);
  for (const edge of edges) {
    if (edge.incidences.length !== 2) continue;
    const [left, right] = edge.incidences;
    const xor = left!.direction === right!.direction ? 1 : 0;
    constraints.get(left!.sourceTriangleIndex)!.push({
      neighbor: right!.sourceTriangleIndex,
      xor,
    });
    constraints.get(right!.sourceTriangleIndex)!.push({
      neighbor: left!.sourceTriangleIndex,
      xor,
    });
  }

  const parity = new Map<number, 0 | 1>();
  let conflictEdgeCount = 0;
  for (const root of [...constraints.keys()].sort((a, b) => a - b)) {
    if (parity.has(root)) continue;
    parity.set(root, 0);
    const queue = [root];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor]!;
      const neighbors = [...constraints.get(current)!]
        .sort((a, b) => a.neighbor - b.neighbor || a.xor - b.xor);
      for (const constraint of neighbors) {
        const expected = (parity.get(current)! ^ constraint.xor) as 0 | 1;
        const existing = parity.get(constraint.neighbor);
        if (existing === undefined) {
          parity.set(constraint.neighbor, expected);
          queue.push(constraint.neighbor);
        } else if (existing !== expected && current < constraint.neighbor) {
          conflictEdgeCount += 1;
        }
      }
    }
  }
  return {
    conflictEdgeCount,
    flippedTriangleIndices: [...parity.entries()]
      .filter(([, value]) => value === 1)
      .map(([triangleIndex]) => triangleIndex)
      .sort((a, b) => a - b),
    orientable: conflictEdgeCount === 0,
  };
}

function findNonManifoldVertices(
  triangles: readonly ToolcraftTopologyTriangle[],
  edges: readonly ToolcraftTopologyEdge[],
): number[] {
  const triangleIdsByVertex = new Map<number, Set<number>>();
  const adjacencyByVertex = new Map<number, Map<number, Set<number>>>();
  const nonManifold = new Set<number>();
  for (const triangle of triangles) {
    for (const vertex of triangle.indices) {
      const ids = triangleIdsByVertex.get(vertex) ?? new Set<number>();
      ids.add(triangle.sourceTriangleIndex);
      triangleIdsByVertex.set(vertex, ids);
    }
  }
  for (const edge of edges) {
    if (edge.incidences.length > 2) {
      nonManifold.add(edge.vertices[0]);
      nonManifold.add(edge.vertices[1]);
    }
    for (const vertex of edge.vertices) {
      const adjacency = adjacencyByVertex.get(vertex) ?? new Map<number, Set<number>>();
      for (const incidence of edge.incidences) {
        if (!adjacency.has(incidence.sourceTriangleIndex)) {
          adjacency.set(incidence.sourceTriangleIndex, new Set());
        }
      }
      for (let index = 1; index < edge.incidences.length; index += 1) {
        const a = edge.incidences[index - 1]!.sourceTriangleIndex;
        const b = edge.incidences[index]!.sourceTriangleIndex;
        adjacency.get(a)!.add(b);
        adjacency.get(b)!.add(a);
      }
      adjacencyByVertex.set(vertex, adjacency);
    }
  }
  for (const [vertex, triangleIds] of triangleIdsByVertex) {
    const adjacency = adjacencyByVertex.get(vertex) ?? new Map();
    for (const triangleId of triangleIds) {
      if (!adjacency.has(triangleId)) adjacency.set(triangleId, new Set());
    }
    if (countComponents(adjacency) > 1) nonManifold.add(vertex);
  }
  return [...nonManifold].sort((a, b) => a - b);
}

function analyzePrimitive(
  primitive: ToolcraftModelPrimitive,
  primitiveIndex: number,
): ToolcraftPrimitiveTopologyGraph {
  const positionsValid = primitive.positions instanceof Float32Array;
  const positionCardinalityValid = positionsValid &&
    primitive.positions.length > 0 && primitive.positions.length % 3 === 0;
  const vertexCount = positionCardinalityValid ? primitive.positions.length / 3 : 0;
  let nonFinitePositionCount = 0;
  if (positionsValid) {
    for (const value of primitive.positions) {
      if (!Number.isFinite(value)) nonFinitePositionCount += 1;
    }
  }
  const indicesValid = primitive.indices instanceof Uint32Array;
  const indexCardinalityValid = indicesValid &&
    primitive.indices.length > 0 && primitive.indices.length % 3 === 0;
  const triangleCount = indexCardinalityValid ? primitive.indices.length / 3 : 0;
  const collected = collectRenderableTriangles(primitive, vertexCount);
  const edges = buildEdges(collected.renderableTriangles, vertexCount);
  const sourceEdges = buildEdges(collected.sourceRenderableTriangles, vertexCount);
  const adjacency = triangleAdjacency(collected.renderableTriangles, edges);
  const winding = solveWinding(collected.renderableTriangles, edges);
  const usedVertices = new Set<number>();
  for (const triangle of collected.renderableTriangles) {
    for (const vertex of triangle.indices) usedVertices.add(vertex);
  }
  const unusedVertexIndices: number[] = [];
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    if (!usedVertices.has(vertex)) unusedVertexIndices.push(vertex);
  }
  const expectedBounds = nonFinitePositionCount === 0 && positionsValid
    ? calculatePositionBounds(primitive.positions)
    : undefined;

  return Object.freeze({
    boundaryEdges: edges.filter((edge) => edge.incidences.length === 1),
    componentCount: countComponents(adjacency),
    duplicateTriangleIndices: collected.duplicateTriangleIndices,
    edges,
    expectedBounds,
    flippedTriangleIndices: winding.flippedTriangleIndices,
    indexCardinalityValid,
    indicesValid,
    invalidIndexCount: collected.invalidIndexCount,
    nonFinitePositionCount,
    nonManifoldEdges: edges.filter((edge) => edge.incidences.length > 2),
    nonManifoldVertexIndices: findNonManifoldVertices(
      collected.renderableTriangles,
      edges,
    ),
    normalIssue: countNormalIssue(primitive, vertexCount),
    oppositeWindingDuplicateTriangleIndices:
      collected.oppositeWindingDuplicateTriangleIndices,
    orientable: winding.orientable,
    positionCardinalityValid,
    primitive,
    primitiveBoundsValid: boundsEqual(primitive.bounds, expectedBounds),
    primitiveIndex,
    renderableTriangles: collected.renderableTriangles,
    repeatedIndexTriangleIndices: collected.repeatedIndexTriangleIndices,
    sourceBoundaryEdges: sourceEdges.filter((edge) => edge.incidences.length === 1),
    sourceEdges,
    sourceNonManifoldEdges: sourceEdges.filter((edge) => edge.incidences.length > 2),
    sourceNonManifoldVertexIndices: findNonManifoldVertices(
      collected.sourceRenderableTriangles,
      sourceEdges,
    ),
    triangleCount,
    unusedVertexIndices,
    vertexCount,
    windingConflictEdgeCount: winding.conflictEdgeCount,
    zeroAreaTriangleIndices: collected.zeroAreaTriangleIndices,
  });
}

export function buildToolcraftModelTopologyGraph(
  document: ToolcraftModelDocument,
): ToolcraftModelTopologyGraph {
  const primitives = document.primitives.map(analyzePrimitive);
  const expectedBounds = primitives.every((primitive) => primitive.expectedBounds)
    ? (() => {
        const bounds = primitives.map((primitive) => primitive.expectedBounds!);
        const min: [number, number, number] = [...bounds[0]!.min];
        const max: [number, number, number] = [...bounds[0]!.max];
        for (const item of bounds.slice(1)) {
          for (let axis = 0; axis < 3; axis += 1) {
            min[axis] = Math.min(min[axis], item.min[axis]);
            max[axis] = Math.max(max[axis], item.max[axis]);
          }
        }
        return { max, min };
      })()
    : undefined;
  return Object.freeze({
    documentBoundsValid: boundsEqual(document.bounds, expectedBounds),
    primitives: Object.freeze(primitives),
  });
}
