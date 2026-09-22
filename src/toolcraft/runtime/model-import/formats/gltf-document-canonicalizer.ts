import type { Document, Mesh } from "@gltf-transform/core";

import type { ToolcraftModelFormat } from "../../schema/types";
import {
  type ToolcraftModelCanonicalizationOperation,
  type ToolcraftModelDocument,
  type ToolcraftModelPrimitiveV2,
} from "../canonical/model-document";
import {
  getValidatedToolcraftModelDocumentSnapshot,
  ToolcraftModelDocumentValidationError,
} from "../canonical/model-document-validation";
import type {
  ToolcraftModelDecodeContext,
  ToolcraftModelDecodeResult,
} from "../model-import-types";
import {
  diagnosticsForGltfFeatures,
  estimateGltfCanonicalMetadataBytes,
  type GltfFeatureInventory,
} from "./gltf-canonical-metadata";
import {
  aggregateGltfPrimitiveBounds,
  boundsForGltfPositions,
  copyGltfTriangleIndices,
  copyGltfVec3Accessor,
  planGltfTriangleIndices,
} from "./gltf-canonical-geometry";
import { planGltfCanonicalHierarchy } from "./gltf-canonical-hierarchy";
import { createGltfCanonicalAppearanceBuilder } from "./gltf-canonical-appearance";
import {
  checkedGltfScale,
  checkedGltfTotal,
  gltfDecodeCheckpoint,
  gltfDecodeFailure,
  throwIfGltfDecodeAborted,
} from "./gltf-decode-safety";
import type { GltfMissingAppearanceBinding } from "./gltf-missing-appearance";

export type { GltfFeatureInventory } from "./gltf-canonical-metadata";

export type GltfCanonicalizationOptions = Readonly<{
  adapterVersion: string;
  features: GltfFeatureInventory;
  limits: ToolcraftModelDecodeContext["limits"];
  missingAppearanceBindings: readonly GltfMissingAppearanceBinding[];
  retainedWorkerBytes: number;
  signal: AbortSignal;
  sourceFormat: Extract<ToolcraftModelFormat, "glb" | "gltf">;
}>;

export function canonicalizeGltfDocument(
  gltf: Document,
  options: GltfCanonicalizationOptions,
): ToolcraftModelDecodeResult {
  throwIfGltfDecodeAborted(options.signal);
  const selected = planGltfCanonicalHierarchy(
    gltf,
    options.limits,
    options.retainedWorkerBytes,
    options.signal,
  );
  let accessorBytes = 0;
  for (const [index, accessor] of gltf.getRoot().listAccessors().entries()) {
    gltfDecodeCheckpoint(options.signal, index);
    accessorBytes = checkedGltfTotal(
      accessorBytes,
      accessor.getArray()?.byteLength ?? 0,
      options.limits.maxDecodedBytes,
      "decoded-byte-limit-exceeded",
      "Decoded glTF accessors",
    );
  }
  const workerBase = checkedGltfTotal(
    options.retainedWorkerBytes,
    accessorBytes,
    options.limits.maxEstimatedWorkerBytes,
    "estimated-worker-memory-limit-exceeded",
    "glTF worker memory",
  );
  const workerWithMetadata = checkedGltfTotal(
    workerBase,
    selected.plannedMetadataBytes,
    options.limits.maxEstimatedWorkerBytes,
    "estimated-worker-memory-limit-exceeded",
    "glTF worker memory",
  );
  const appearanceBuilder = createGltfCanonicalAppearanceBuilder(
    gltf,
    options.missingAppearanceBindings,
    options.limits,
    options.signal,
  );
  const primitives: ToolcraftModelPrimitiveV2[] = [];
  const primitiveIdsByMesh = new Map<Mesh, string[]>();
  let canonicalBytes = 0;
  let totalTriangles = 0;
  let totalVertices = 0;
  let usedSequentialIndexing = false;
  let usedTriangulation = false;

  for (const mesh of gltf.getRoot().listMeshes()) {
    if (!selected.referencedMeshes.has(mesh)) continue;
    const primitiveIds: string[] = [];
    for (const primitive of mesh.listPrimitives()) {
      throwIfGltfDecodeAborted(options.signal);
      if (primitives.length >= options.limits.maxPrimitives) {
        return gltfDecodeFailure(
          "resource-limit",
          "max-primitives-exceeded",
          `Canonical geometry exceeds maxPrimitives ${options.limits.maxPrimitives}.`,
        );
      }
      const position = primitive.getAttribute("POSITION");
      if (!position) {
        return gltfDecodeFailure(
          "geometry",
          "missing-position-accessor",
          "Every imported primitive requires static POSITION data.",
        );
      }
      const vertices = position.getCount();
      if (
        vertices <= 0 ||
        totalVertices > options.limits.maxVertices - vertices
      ) {
        return gltfDecodeFailure(
          "resource-limit",
          "max-vertices-exceeded",
          `Canonical geometry exceeds maxVertices ${options.limits.maxVertices}.`,
        );
      }
      const indexPlan = planGltfTriangleIndices(primitive, vertices);
      if (
        totalTriangles >
        options.limits.maxTriangles - indexPlan.triangleCount
      ) {
        return gltfDecodeFailure(
          "resource-limit",
          "max-triangles-exceeded",
          `Canonical geometry exceeds maxTriangles ${options.limits.maxTriangles}.`,
        );
      }
      const normal = primitive.getAttribute("NORMAL");
      if (normal && normal.getCount() !== vertices) {
        return gltfDecodeFailure(
          "geometry",
          "normal-count-mismatch",
          "NORMAL and POSITION accessors must have equal counts.",
        );
      }
      const primitiveAppearance = appearanceBuilder.primitiveAppearance(
        primitive,
        vertices,
      );
      const vertexBytes = checkedGltfScale(
        vertices,
        normal ? 24 : 12,
        "decoded-byte-limit-exceeded",
      );
      const primitiveBytes = checkedGltfTotal(
        checkedGltfTotal(
          vertexBytes,
          primitiveAppearance.attributeBytes,
          options.limits.maxDecodedBytes,
          "decoded-byte-limit-exceeded",
          "Canonical glTF vertex attributes",
        ),
        indexPlan.indexByteLength,
        options.limits.maxDecodedBytes,
        "decoded-byte-limit-exceeded",
        "Canonical glTF primitive",
      );
      canonicalBytes = checkedGltfTotal(
        canonicalBytes,
        primitiveBytes,
        options.limits.maxDecodedBytes,
        "decoded-byte-limit-exceeded",
        "Canonical glTF geometry",
      );
      checkedGltfTotal(
        workerWithMetadata,
        checkedGltfScale(
          canonicalBytes,
          2,
          "estimated-worker-memory-limit-exceeded",
        ),
        options.limits.maxEstimatedWorkerBytes,
        "estimated-worker-memory-limit-exceeded",
        "glTF worker memory",
      );

      const positions = copyGltfVec3Accessor(
        position,
        "POSITION",
        options.signal,
      );
      const id = `primitive:${primitives.length}`;
      primitives.push({
        ...(primitiveAppearance.colors
          ? { colors: primitiveAppearance.colors }
          : {}),
        bounds: boundsForGltfPositions(positions, options.signal),
        id,
        indices: copyGltfTriangleIndices(
          indexPlan,
          vertices,
          options.signal,
        ),
        ...(primitiveAppearance.materialId
          ? { materialId: primitiveAppearance.materialId }
          : {}),
        ...(normal
          ? {
              normals: copyGltfVec3Accessor(
                normal,
                "NORMAL",
                options.signal,
              ),
            }
          : {}),
        positions,
        ...(primitiveAppearance.textureCoordinates
          ? { textureCoordinates: primitiveAppearance.textureCoordinates }
          : {}),
      });
      primitiveIds.push(id);
      totalVertices += vertices;
      totalTriangles += indexPlan.triangleCount;
      usedSequentialIndexing ||= indexPlan.sequential;
      usedTriangulation ||= indexPlan.triangulated;
    }
    primitiveIdsByMesh.set(mesh, primitiveIds);
  }
  if (primitives.length === 0) {
    return gltfDecodeFailure(
      "geometry",
      "no-renderable-static-geometry",
      "The glTF source has no finite renderable triangle base geometry.",
    );
  }

  const sourceNodes = gltf.getRoot().listNodes();
  const nodeIds = new Map(
    sourceNodes.map((node, index) => [node, `node:${index}`]),
  );
  const nodes = selected.nodes.map((node) => ({
    children: node.listChildren().map((child) => nodeIds.get(child)!),
    id: nodeIds.get(node)!,
    localMatrix: selected.localMatrices.get(node)!,
    name: node.getName(),
    primitiveIds: node.getMesh()
      ? (primitiveIdsByMesh.get(node.getMesh()!) ?? [])
      : [],
  }));
  const operations: ToolcraftModelCanonicalizationOperation[] = [];
  if (usedTriangulation) operations.push("deterministic-triangulation");
  if (usedSequentialIndexing) operations.push("sequential-indexing");
  const appearance = appearanceBuilder.finish();
  const document: ToolcraftModelDocument = {
    bounds: aggregateGltfPrimitiveBounds(primitives, options.signal),
    materials: appearance.materials,
    nodes,
    primitives,
    provenance: {
      adapterVersion: options.adapterVersion,
      canonicalSchemaVersion: 2,
      operations,
      sourceFormat: options.sourceFormat,
    },
    rootNodeIds: selected.roots.map((node) => nodeIds.get(node)!),
    textures: appearance.textures,
    version: 2,
  };

  const metadataBytes = estimateGltfCanonicalMetadataBytes(
    document,
    options.signal,
  );
  const canonicalSnapshotBytes = checkedGltfTotal(
    checkedGltfTotal(
      canonicalBytes,
      appearance.resourceBytes,
      Number.MAX_SAFE_INTEGER,
      "estimated-worker-memory-limit-exceeded",
      "glTF canonical appearance resources",
    ),
    metadataBytes,
    Number.MAX_SAFE_INTEGER,
    "estimated-worker-memory-limit-exceeded",
    "glTF canonical snapshot",
  );
  checkedGltfTotal(
    workerBase,
    checkedGltfScale(
      canonicalSnapshotBytes,
      2,
      "estimated-worker-memory-limit-exceeded",
    ),
    options.limits.maxEstimatedWorkerBytes,
    "estimated-worker-memory-limit-exceeded",
    "glTF canonical snapshot memory",
  );
  throwIfGltfDecodeAborted(options.signal);
  try {
    return {
      appearanceResources: appearance.appearanceResources,
      diagnostics: [
        ...diagnosticsForGltfFeatures(options.features),
        ...appearance.diagnostics,
      ],
      document: getValidatedToolcraftModelDocumentSnapshot(
        document,
        options.limits,
      ),
    };
  } catch (error) {
    if (error instanceof ToolcraftModelDocumentValidationError) {
      const category =
        error.code.startsWith("max-") ||
        error.code === "estimated-worker-memory-limit-exceeded"
          ? "resource-limit"
          : "geometry";
      return gltfDecodeFailure(category, error.code, error.message);
    }
    throw error;
  }
}
