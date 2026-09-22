import type { GLTF } from "@gltf-transform/core";

import type { ToolcraftModelImportLimits } from "../../schema/types";
import {
  validateGltfNormalEncoding,
  validateGltfPositionEncoding,
} from "./gltf-attribute-encoding";
import {
  checkedGltfScale,
  checkedGltfTotal,
  gltfDecodeCheckpoint,
  gltfDecodeFailure,
} from "./gltf-decode-safety";
import {
  type GltfAccessorInfo,
  type GltfBufferViewInfo,
  type GltfJsonRecord,
  gltfJsonArray,
  gltfJsonIndexed,
  gltfJsonInteger,
  gltfJsonRecord,
} from "./gltf-json-inspection";

export type GltfPrimitivePreflight = Readonly<{
  canonicalBytes: number;
  decodedCountExpectations: GltfDecodedCountExpectation[];
  dracoScratchBytes: number;
  meshCount: number;
  primitiveCount: number;
}>;

export type GltfDecodedCountExpectation = Readonly<{
  indexCount?: number;
  meshIndex: number;
  normalCount?: number;
  positionCount: number;
  primitiveIndex: number;
}>;

function triangleCountForMode(mode: number, count: number): number {
  if (mode === 4 && count >= 3 && count % 3 === 0) return count / 3;
  if ((mode === 5 || mode === 6) && count >= 3) return count - 2;
  if (mode >= 0 && mode <= 3) {
    return gltfDecodeFailure(
      "format",
      "unsupported-primitive-mode",
      `glTF primitive mode ${mode} is not triangle geometry.`,
    );
  }
  return gltfDecodeFailure(
    "geometry",
    "malformed-triangle-primitive",
    "A triangle primitive has malformed cardinality or mode.",
  );
}

function inspectDraco(
  primitive: GltfJsonRecord,
  views: readonly GltfBufferViewInfo[],
  position: GltfAccessorInfo,
  normal: GltfAccessorInfo | undefined,
  indices: GltfAccessorInfo | undefined,
): number {
  const extensions = primitive.extensions;
  const value =
    typeof extensions === "object" && extensions !== null
      ? (extensions as GltfJsonRecord).KHR_draco_mesh_compression
      : undefined;
  if (value === undefined) {
    if (
      position.record.bufferView === undefined &&
      position.record.sparse === undefined
    ) {
      return gltfDecodeFailure(
        "geometry",
        "invalid-position-accessor",
        "POSITION has no bufferView, sparse values, or Draco payload.",
      );
    }
    return 0;
  }
  const extension = gltfJsonRecord(
    value,
    "invalid-draco-extension",
    "KHR_draco_mesh_compression",
  );
  gltfJsonIndexed(
    views,
    extension.bufferView,
    "invalid-draco-extension",
    "Draco bufferView",
  );
  const attributes = gltfJsonRecord(
    extension.attributes,
    "invalid-draco-extension",
    "Draco attributes",
  );
  for (const [semantic, attributeId] of Object.entries(attributes)) {
    gltfJsonInteger(
      attributeId,
      "invalid-draco-extension",
      `Draco attribute ${semantic}`,
    );
  }
  if (attributes.POSITION === undefined) {
    return gltfDecodeFailure(
      "geometry",
      "invalid-draco-extension",
      "Draco geometry must declare its POSITION attribute.",
    );
  }
  const vertexBytes = checkedGltfScale(
    position.count,
    normal ? 24 : 12,
    "estimated-worker-memory-limit-exceeded",
  );
  const indexBytes = checkedGltfScale(
    indices?.count ?? position.count,
    Uint32Array.BYTES_PER_ELEMENT,
    "estimated-worker-memory-limit-exceeded",
  );
  return checkedGltfTotal(
    vertexBytes,
    indexBytes,
    Number.MAX_SAFE_INTEGER,
    "estimated-worker-memory-limit-exceeded",
    "Draco declared expansion",
  );
}

export function preflightGltfPrimitives(
  json: GLTF.IGLTF,
  accessors: readonly GltfAccessorInfo[],
  views: readonly GltfBufferViewInfo[],
  limits: ToolcraftModelImportLimits,
  signal: AbortSignal,
): GltfPrimitivePreflight {
  const requiredExtensions = new Set(json.extensionsRequired ?? []);
  const meshes = gltfJsonArray(
    json.meshes,
    "invalid-gltf-meshes",
    "glTF meshes",
  );
  let canonicalBytes = 0;
  const decodedCountExpectations: GltfDecodedCountExpectation[] = [];
  let dracoScratchBytes = 0;
  let primitiveCount = 0;
  let triangles = 0;
  let vertices = 0;
  meshes.forEach((meshValue, meshIndex) => {
    const mesh = gltfJsonRecord(
      meshValue,
      "invalid-gltf-mesh",
      `mesh ${meshIndex}`,
    );
    const primitives = gltfJsonArray(
      mesh.primitives,
      "invalid-gltf-primitives",
      `mesh ${meshIndex}.primitives`,
    );
    primitives.forEach((primitiveValue, primitiveIndex) => {
      gltfDecodeCheckpoint(signal, primitiveCount);
      primitiveCount += 1;
      if (primitiveCount > limits.maxPrimitives) {
        return gltfDecodeFailure(
          "resource-limit",
          "max-primitives-exceeded",
          `glTF exceeds maxPrimitives ${limits.maxPrimitives}.`,
        );
      }
      const primitive = gltfJsonRecord(
        primitiveValue,
        "invalid-gltf-primitive",
        `mesh ${meshIndex} primitive ${primitiveIndex}`,
      );
      const attributes = gltfJsonRecord(
        primitive.attributes,
        "invalid-gltf-primitive",
        "Primitive attributes",
      );
      const position = gltfJsonIndexed(
        accessors,
        attributes.POSITION,
        "invalid-position-accessor",
        "POSITION accessor",
      );
      validateGltfPositionEncoding(position, requiredExtensions);
      const normal =
        attributes.NORMAL === undefined
          ? undefined
          : gltfJsonIndexed(
              accessors,
              attributes.NORMAL,
              "invalid-normal-accessor",
              "NORMAL accessor",
            );
      if (normal) {
        validateGltfNormalEncoding(normal, position.count, requiredExtensions);
      }
      const indices =
        primitive.indices === undefined
          ? undefined
          : gltfJsonIndexed(
              accessors,
              primitive.indices,
              "invalid-index-accessor",
              "Index accessor",
            );
      if (
        indices &&
        (indices.type !== "SCALAR" ||
          ![5121, 5123, 5125].includes(indices.componentType) ||
          indices.normalized)
      ) {
        return gltfDecodeFailure(
          "geometry",
          "invalid-index-accessor",
          "Indices must be non-normalized unsigned scalar accessors.",
        );
      }
      const mode =
        primitive.mode === undefined
          ? 4
          : gltfJsonInteger(
              primitive.mode,
              "invalid-gltf-primitive",
              "Primitive mode",
            );
      decodedCountExpectations.push({
        ...(indices ? { indexCount: indices.count } : {}),
        meshIndex,
        ...(normal ? { normalCount: normal.count } : {}),
        positionCount: position.count,
        primitiveIndex,
      });
      const primitiveTriangles = triangleCountForMode(
        mode,
        indices?.count ?? position.count,
      );
      if (vertices > limits.maxVertices - position.count) {
        return gltfDecodeFailure(
          "resource-limit",
          "max-vertices-exceeded",
          `glTF exceeds maxVertices ${limits.maxVertices}.`,
        );
      }
      if (triangles > limits.maxTriangles - primitiveTriangles) {
        return gltfDecodeFailure(
          "resource-limit",
          "max-triangles-exceeded",
          `glTF exceeds maxTriangles ${limits.maxTriangles}.`,
        );
      }
      vertices += position.count;
      triangles += primitiveTriangles;
      const vertexBytes = checkedGltfScale(
        position.count,
        normal ? 24 : 12,
        "decoded-byte-limit-exceeded",
      );
      const indexBytes = checkedGltfScale(
        primitiveTriangles,
        3 * Uint32Array.BYTES_PER_ELEMENT,
        "decoded-byte-limit-exceeded",
      );
      canonicalBytes = checkedGltfTotal(
        canonicalBytes,
        checkedGltfTotal(
          vertexBytes,
          indexBytes,
          limits.maxDecodedBytes,
          "decoded-byte-limit-exceeded",
          "Canonical glTF primitive",
        ),
        limits.maxDecodedBytes,
        "decoded-byte-limit-exceeded",
        "Canonical glTF geometry",
      );
      dracoScratchBytes = checkedGltfTotal(
        dracoScratchBytes,
        inspectDraco(primitive, views, position, normal, indices),
        limits.maxEstimatedWorkerBytes,
        "estimated-worker-memory-limit-exceeded",
        "Draco declared expansion",
      );
    });
  });
  return {
    canonicalBytes,
    decodedCountExpectations,
    dracoScratchBytes,
    meshCount: meshes.length,
    primitiveCount,
  };
}
