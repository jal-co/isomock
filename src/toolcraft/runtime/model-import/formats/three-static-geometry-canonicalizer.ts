import {
  BufferGeometry,
  type Material,
  type Object3D,
} from "three";

import type { ToolcraftSourceAssetFeedback } from "../../source-assets/source-asset-types";
import type {
  ToolcraftModelBounds,
  ToolcraftModelCanonicalizationOperation,
  ToolcraftModelDocument,
  ToolcraftModelDocumentV2,
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
  checkedThreeStaticGeometryTotal,
  copyThreeStaticGeometryPrimitive,
  countThreeStaticGeometryPrimitiveVertices,
  getThreeStaticGeometryAttributeArray,
  getThreeStaticGeometryLocalMatrix,
  threeStaticGeometryFailure,
  throwIfThreeStaticGeometryAborted,
  type ThreeStaticGeometryFormat,
  type ThreeStaticGeometryPrimitivePlan,
  validateThreeStaticGeometryLimits,
} from "./three-static-geometry-primitives";
import {
  createThreeStaticAppearanceBuilder,
  type ThreeStaticAppearanceCatalog,
} from "./three-static-appearance-canonicalizer";

type CanonicalizationOptions = Readonly<{
  adapterVersion: string;
  appearance?: ThreeStaticAppearanceCatalog;
  limits: ToolcraftModelDecodeContext["limits"];
  operations?: readonly ToolcraftModelCanonicalizationOperation[];
  signal: AbortSignal;
  sourceByteLength: number;
  sourceFormat: ThreeStaticGeometryFormat;
}>;
type GeometryPlan = ThreeStaticGeometryPrimitivePlan & Readonly<{
  geometry: BufferGeometry;
  materialId?: string;
}>;
type DrawRange = Readonly<{
  count: number;
  material: Material | null;
  start: number;
}>;

function checkpoint(signal: AbortSignal, index: number): void {
  if ((index & 255) === 0) throwIfThreeStaticGeometryAborted(signal);
}

function collectObjectNodes(
  root: Object3D,
  options: CanonicalizationOptions,
): readonly Object3D[] {
  const nodes: Object3D[] = [];
  const seen = new Set<Object3D>();
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    checkpoint(options.signal, nodes.length);
    if (seen.has(node)) {
      return threeStaticGeometryFailure(
        "geometry",
        "invalid-object-hierarchy",
        "The decoded Three object hierarchy contains a repeated node.",
      );
    }
    seen.add(node);
    nodes.push(node);
    if (nodes.length > options.limits.maxNodes) {
      return threeStaticGeometryFailure(
        "resource-limit",
        "max-nodes-exceeded",
        `Canonical hierarchy exceeds maxNodes ${options.limits.maxNodes}.`,
      );
    }
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      stack.push(node.children[index]!);
    }
  }
  return nodes;
}

function asMaterial(value: unknown): Material | null {
  return value && typeof value === "object" &&
      (value as { isMaterial?: unknown }).isMaterial === true
    ? value as Material
    : null;
}

function materialAt(value: unknown, materialIndex: number): Material | null {
  return Array.isArray(value)
    ? asMaterial(value[materialIndex])
    : materialIndex === 0 ? asMaterial(value) : null;
}

function drawRanges(
  geometry: BufferGeometry,
  material: unknown,
): readonly DrawRange[] {
  const drawCount = geometry.getIndex()?.count ??
    geometry.getAttribute("position")?.count ?? 0;
  const groups = geometry.groups.length === 0
    ? [{ count: drawCount, materialIndex: 0, start: 0 }]
    : geometry.groups;
  return groups.map((group) => {
    const materialIndex = group.materialIndex ?? 0;
    if (
      !Number.isSafeInteger(group.start) ||
      !Number.isSafeInteger(group.count) ||
      !Number.isSafeInteger(materialIndex) ||
      group.start < 0 ||
      group.count <= 0 ||
      materialIndex < 0 ||
      group.start % 3 !== 0 ||
      group.count % 3 !== 0 ||
      group.start > drawCount - group.count
    ) {
      return threeStaticGeometryFailure(
        "geometry",
        "invalid-geometry-group",
        "Decoded geometry groups must contain bounded complete triangle ranges.",
      );
    }
    return {
      count: group.count,
      material: materialAt(material, materialIndex),
      start: group.start,
    };
  });
}

function resourceCategory(code: string): ToolcraftSourceAssetFeedback["category"] {
  return code.startsWith("max-") || code.startsWith("estimated-") ||
      code.startsWith("decoded-") || code === "invalid-limit-options"
    ? "resource-limit"
    : "geometry";
}

export function canonicalizeThreeStaticGeometry(
  input: Object3D | BufferGeometry,
  options: CanonicalizationOptions,
): ToolcraftModelDecodeResult {
  throwIfThreeStaticGeometryAborted(options.signal);
  validateThreeStaticGeometryLimits(options.limits);
  const directGeometry = input instanceof BufferGeometry ? input : undefined;
  const sourceNodes = directGeometry ? [] : collectObjectNodes(input as Object3D, options);
  const geometryAndMaterialByNode = new Map<
    Object3D,
    Readonly<{ geometry: BufferGeometry; material: unknown }>
  >();
  if (!directGeometry) {
    for (const node of sourceNodes) {
      if ((node as Object3D & { isMesh?: boolean }).isMesh !== true) continue;
      const mesh = node as Object3D & { geometry?: unknown; material?: unknown };
      if (!(mesh.geometry instanceof BufferGeometry)) {
        return threeStaticGeometryFailure(
          "geometry",
          "invalid-buffer-geometry",
          "A decoded mesh does not expose BufferGeometry.",
        );
      }
      geometryAndMaterialByNode.set(node, {
        geometry: mesh.geometry,
        material: mesh.material,
      });
    }
  }

  const geometryEntries = directGeometry
    ? [{ geometry: directGeometry, material: null, node: undefined }]
    : [...geometryAndMaterialByNode].map(([node, value]) => ({ ...value, node }));
  if (geometryEntries.length === 0) {
    return threeStaticGeometryFailure(
      "geometry",
      "no-renderable-static-geometry",
      "The source contains no static triangle geometry.",
    );
  }

  const appearance = createThreeStaticAppearanceBuilder(
    options.appearance,
    options.limits,
  );
  const emitsAppearance = options.appearance !== undefined;
  const plans: GeometryPlan[] = [];
  const planByKey = new Map<string, GeometryPlan>();
  const primitiveIdsByNode = new Map<Object3D, Set<string>>();
  const geometryIds = new Map<BufferGeometry, number>();
  const loadedBuffers = new Set<ArrayBufferLike>();
  let canonicalBytes = 0;
  let triangles = 0;
  let vertices = 0;

  for (const entry of geometryEntries) {
    throwIfThreeStaticGeometryAborted(options.signal);
    const { geometry } = entry;
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const color = geometry.getAttribute("color");
    const uv0 = geometry.getAttribute("uv");
    const uv1 = geometry.getAttribute("uv1") ?? geometry.getAttribute("uv2");
    const index = geometry.getIndex();
    if (!position || position.itemSize !== 3 ||
        !Number.isSafeInteger(position.count) || position.count <= 0) {
      return threeStaticGeometryFailure(
        "geometry",
        "invalid-position-attribute",
        "Every decoded primitive requires nonempty XYZ position data.",
      );
    }
    if (normal && (normal.itemSize !== 3 || normal.count !== position.count)) {
      return threeStaticGeometryFailure(
        "geometry",
        "normal-count-mismatch",
        "Decoded normals must match the XYZ position count.",
      );
    }
    if (color && (![3, 4].includes(color.itemSize) || color.count !== position.count)) {
      return threeStaticGeometryFailure(
        "geometry",
        "color-count-mismatch",
        "Decoded RGB or RGBA vertex colors must match the position count.",
      );
    }
    for (const uv of [uv0, uv1]) {
      if (uv && (uv.itemSize !== 2 || uv.count !== position.count)) {
        return threeStaticGeometryFailure(
          "geometry",
          "texture-coordinate-count-mismatch",
          "Decoded UV attributes must match the position count.",
        );
      }
    }
    const drawCount = index?.count ?? position.count;
    if (!Number.isSafeInteger(drawCount) || drawCount <= 0 || drawCount % 3 !== 0) {
      return threeStaticGeometryFailure(
        "geometry",
        "invalid-triangle-cardinality",
        "Decoded primitives must contain complete triangle triples.",
      );
    }
    for (const attribute of [...Object.values(geometry.attributes), index]) {
      if (attribute) loadedBuffers.add(getThreeStaticGeometryAttributeArray(attribute).buffer);
    }
    let geometryId = geometryIds.get(geometry);
    if (geometryId === undefined) {
      geometryId = geometryIds.size;
      geometryIds.set(geometry, geometryId);
    }
    const uvSets = new Set<number>([
      ...(uv0 ? [0] : []),
      ...(uv1 ? [1] : []),
    ]);
    for (const range of drawRanges(geometry, entry.material)) {
      const materialId = emitsAppearance
        ? appearance.materialFor(range.material, Boolean(color), uvSets)
        : undefined;
      const key = `${geometryId}|${range.start}|${range.count}|${materialId ?? ""}`;
      let plan = planByKey.get(key);
      if (!plan) {
        if (plans.length >= options.limits.maxPrimitives) {
          return threeStaticGeometryFailure(
            "resource-limit",
            "max-primitives-exceeded",
            `Canonical geometry exceeds maxPrimitives ${options.limits.maxPrimitives}.`,
          );
        }
        plan = {
          ...(emitsAppearance && color ? { color } : {}),
          drawCount: range.count,
          drawStart: range.start,
          geometry,
          index,
          ...(materialId ? { materialId } : {}),
          ...(normal ? { normal } : {}),
          position,
          primitiveId: `primitive:${plans.length}`,
          ...(!emitsAppearance || (!uv0 && !uv1) ? {} : {
            textureCoordinates: [
              ...(uv0 ? [{ attribute: uv0, set: 0 as const }] : []),
              ...(uv1 ? [{ attribute: uv1, set: 1 as const }] : []),
            ],
          }),
        };
        const primitiveVertices = countThreeStaticGeometryPrimitiveVertices(
          plan,
          options.signal,
        );
        vertices = checkedThreeStaticGeometryTotal(
          vertices,
          primitiveVertices,
          options.limits.maxVertices,
          "max-vertices-exceeded",
          "Canonical vertices",
        );
        triangles = checkedThreeStaticGeometryTotal(
          triangles,
          range.count / 3,
          options.limits.maxTriangles,
          "max-triangles-exceeded",
          "Canonical triangles",
        );
        const vertexStride = 12 + (normal ? 12 : 0) +
          (emitsAppearance && color ? color.itemSize * 4 : 0) +
          (emitsAppearance && uv0 ? 8 : 0) + (emitsAppearance && uv1 ? 8 : 0);
        canonicalBytes = checkedThreeStaticGeometryTotal(
          canonicalBytes,
          primitiveVertices * vertexStride + range.count * 4,
          options.limits.maxDecodedBytes,
          "decoded-byte-limit-exceeded",
          "Canonical geometry bytes",
        );
        plans.push(plan);
        planByKey.set(key, plan);
      }
      if (entry.node) {
        const ids = primitiveIdsByNode.get(entry.node) ?? new Set<string>();
        ids.add(plan.primitiveId);
        primitiveIdsByNode.set(entry.node, ids);
      }
    }
  }

  let loadedBytes = 0;
  for (const buffer of loadedBuffers) {
    loadedBytes = checkedThreeStaticGeometryTotal(
      loadedBytes,
      buffer.byteLength,
      options.limits.maxEstimatedWorkerBytes,
      "estimated-worker-memory-limit-exceeded",
      "Decoded Three geometry memory",
    );
  }
  const canonicalAppearance = appearance.finish();
  const nodeCount = directGeometry ? 1 : sourceNodes.length;
  const estimatedPeak = options.sourceByteLength * 4 + loadedBytes +
    canonicalBytes * 2 + canonicalAppearance.resourceBytes +
    nodeCount * 256 + plans.length * 192;
  checkedThreeStaticGeometryTotal(
    0,
    estimatedPeak,
    options.limits.maxEstimatedWorkerBytes,
    "estimated-worker-memory-limit-exceeded",
    "Static geometry worker memory",
  );

  const primitives = plans.map((plan) =>
    copyThreeStaticGeometryPrimitive(plan, options.signal, plan.materialId)
  );
  const nodeIds = new Map(sourceNodes.map((node, index) => [node, `node:${index}`]));
  const nodes: ToolcraftModelDocument["nodes"] = directGeometry
    ? [{
        children: [],
        id: "node:0",
        localMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        name: "",
        primitiveIds: plans.map(({ primitiveId }) => primitiveId),
      }]
    : sourceNodes.map((node) => ({
        children: node.children.map((child) => nodeIds.get(child)!),
        id: nodeIds.get(node)!,
        localMatrix: getThreeStaticGeometryLocalMatrix(node),
        name: node.name,
        primitiveIds: [...(primitiveIdsByNode.get(node) ?? [])],
      }));
  const operations = [...(options.operations ?? [])];
  if (plans.some(({ index }) => index === null)) operations.push("sequential-indexing");
  const bounds = primitives.reduce<ToolcraftModelBounds>(
    (current, primitive) => ({
      max: current.max.map((value, axis) =>
        Math.max(value, primitive.bounds.max[axis]!)) as [number, number, number],
      min: current.min.map((value, axis) =>
        Math.min(value, primitive.bounds.min[axis]!)) as [number, number, number],
    }),
    primitives[0]!.bounds,
  );
  const document: ToolcraftModelDocument = emitsAppearance ? {
    bounds,
    materials: canonicalAppearance.materials,
    nodes,
    primitives,
    provenance: {
      adapterVersion: options.adapterVersion,
      canonicalSchemaVersion: 2,
      operations,
      sourceFormat: options.sourceFormat,
    },
    rootNodeIds: ["node:0"],
    textures: canonicalAppearance.textures,
    version: 2,
  } satisfies ToolcraftModelDocumentV2 : {
    bounds,
    nodes,
    primitives,
    provenance: {
      adapterVersion: options.adapterVersion,
      canonicalSchemaVersion: 1,
      operations,
      sourceFormat: options.sourceFormat,
    },
    rootNodeIds: ["node:0"],
    version: 1,
  };

  throwIfThreeStaticGeometryAborted(options.signal);
  try {
    return {
      appearanceResources: canonicalAppearance.appearanceResources,
      diagnostics: canonicalAppearance.diagnostics,
      document: getValidatedToolcraftModelDocumentSnapshot(document, options.limits),
    };
  } catch (error) {
    if (error instanceof ToolcraftModelDocumentValidationError) {
      return threeStaticGeometryFailure(
        resourceCategory(error.code),
        error.code,
        error.message,
      );
    }
    throw error;
  }
}
