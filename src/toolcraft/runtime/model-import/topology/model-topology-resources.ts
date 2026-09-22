import type { ToolcraftModelImportLimits } from "../../schema/types";
import type { ToolcraftModelDocument } from "../canonical/model-document";
import { normalizeToolcraftModelImportLimits } from "../model-import-limits";
import { safeAdd, safeMultiply } from "./model-topology-math";

export type ToolcraftTopologyResourceCounts = Readonly<{
  decodedBytes: number;
  nodeCount: number;
  primitiveCount: number;
  triangleCount: number;
  vertexCount: number;
}>;

export type ToolcraftModelResourceEstimate = Readonly<{
  decodedBytes: number;
  estimatedPeakWorkerBytes: number;
  estimatedRepairBytes: number;
}>;

export type ToolcraftModelTopologyResourcePreflight =
  ToolcraftTopologyResourceCounts & ToolcraftModelResourceEstimate;

/*
 * Conservative 64-bit JS-engine working-set assumptions. Per triangle this
 * covers two potentially overlapping analyses during candidate proof. Each
 * analysis retains source and filtered triangle records, six directed and six
 * worst-case undirected numeric-key edge slots across both graphs, duplicate
 * string keys/maps, adjacency, fan, component, and winding structures. The
 * candidate geometry and plan arrays are additional. Node/primitive entries
 * cover copied hierarchy and plan metadata. Three decoded-size workspaces
 * cover digest joins plus source/candidate geometry overlap. Saturation turns
 * any arithmetic uncertainty into rejection.
 */
const SIMULTANEOUS_GRAPH_ANALYSES = 2;
const TRIANGLE_WORK_BYTES = SIMULTANEOUS_GRAPH_ANALYSES * (
  2 * 128 +
  6 * 80 +
  6 * 128 +
  192 +
  512
) +
  3 * Uint32Array.BYTES_PER_ELEMENT;
const VERTEX_WORK_BYTES =
  SIMULTANEOUS_GRAPH_ANALYSES * 384 +
  6 * Float32Array.BYTES_PER_ELEMENT;
const NODE_WORK_BYTES = 512;
const PRIMITIVE_WORK_BYTES = 1_024;
const DECODED_WORKSPACE_COPIES = 3;

function boundedCount(value: number): number {
  return Number.isSafeInteger(value) && value >= 0
    ? value
    : Number.MAX_SAFE_INTEGER;
}

export function resolveTopologyLimits(
  requested: Partial<ToolcraftModelImportLimits> | undefined,
): Readonly<ToolcraftModelImportLimits> {
  return Object.freeze(normalizeToolcraftModelImportLimits(requested));
}

export function estimateToolcraftTopologyResources(
  counts: ToolcraftTopologyResourceCounts,
): ToolcraftModelResourceEstimate {
  const decodedBytes = boundedCount(counts.decodedBytes);
  let estimatedRepairBytes = safeMultiply(
    boundedCount(counts.triangleCount),
    TRIANGLE_WORK_BYTES,
  );
  estimatedRepairBytes = safeAdd(estimatedRepairBytes, safeMultiply(
    boundedCount(counts.vertexCount),
    VERTEX_WORK_BYTES,
  ));
  estimatedRepairBytes = safeAdd(estimatedRepairBytes, safeMultiply(
    boundedCount(counts.nodeCount),
    NODE_WORK_BYTES,
  ));
  estimatedRepairBytes = safeAdd(estimatedRepairBytes, safeMultiply(
    boundedCount(counts.primitiveCount),
    PRIMITIVE_WORK_BYTES,
  ));
  estimatedRepairBytes = safeAdd(estimatedRepairBytes, safeMultiply(
    decodedBytes,
    DECODED_WORKSPACE_COPIES,
  ));
  return Object.freeze({
    decodedBytes,
    estimatedPeakWorkerBytes: safeAdd(decodedBytes, estimatedRepairBytes),
    estimatedRepairBytes,
  });
}

export function preflightToolcraftModelTopologyResources(
  document: ToolcraftModelDocument,
): ToolcraftModelTopologyResourcePreflight {
  let decodedBytes = 0;
  let triangleCount = 0;
  let vertexCount = 0;

  for (let index = 0; index < document.primitives.length; index += 1) {
    const primitive = document.primitives[index]!;
    if (primitive.positions instanceof Float32Array) {
      decodedBytes = safeAdd(decodedBytes, primitive.positions.byteLength);
      vertexCount = safeAdd(vertexCount, Math.floor(primitive.positions.length / 3));
    }
    if (primitive.indices instanceof Uint32Array) {
      decodedBytes = safeAdd(decodedBytes, primitive.indices.byteLength);
      triangleCount = safeAdd(triangleCount, Math.floor(primitive.indices.length / 3));
    }
    if (primitive.normals instanceof Float32Array) {
      decodedBytes = safeAdd(decodedBytes, primitive.normals.byteLength);
    }
  }

  const counts: ToolcraftTopologyResourceCounts = {
    decodedBytes,
    nodeCount: boundedCount(document.nodes.length),
    primitiveCount: boundedCount(document.primitives.length),
    triangleCount,
    vertexCount,
  };
  return Object.freeze({
    ...counts,
    ...estimateToolcraftTopologyResources(counts),
  });
}
