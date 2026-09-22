import type {
  ToolcraftModelBounds,
  ToolcraftModelDocument,
  ToolcraftModelDocumentV1,
  ToolcraftModelDocumentV2,
  ToolcraftModelNode,
  ToolcraftModelPrimitive,
  ToolcraftModelPrimitiveV2,
  ToolcraftModelRepairOperationType,
} from "../canonical/model-document";
import { getValidatedToolcraftModelDocumentSnapshot } from "../canonical/model-document-validation";
import {
  calculateRequiredBounds,
  regenerateAreaWeightedNormals,
} from "./model-repair-geometry";
import {
  digestToolcraftRepairPlanPayload,
  digestToolcraftTopologyDocument,
} from "./model-topology-digest";
import {
  TOOLCRAFT_MODEL_REPAIR_ALGORITHM_VERSION,
  type ToolcraftCompactVerticesRepairOperation,
  type ToolcraftModelRepairOperation,
  type ToolcraftModelRepairPlan,
  type ToolcraftRemoveTrianglesRepairOperation,
} from "./model-repair-plan";

type WorkingPrimitive = {
  bounds: ToolcraftModelPrimitive["bounds"];
  id: string;
  indices: Uint32Array;
  materialId?: string;
  normals?: Float32Array;
  positions: Float32Array;
  sourceTriangleIndices: number[];
  colors?: ToolcraftModelPrimitiveV2["colors"];
  textureCoordinates?: ToolcraftModelPrimitiveV2["textureCoordinates"];
};

function clonePrimitive(primitive: ToolcraftModelPrimitiveV2): WorkingPrimitive {
  return {
    bounds: { max: [...primitive.bounds.max], min: [...primitive.bounds.min] },
    ...(primitive.colors ? {
      colors: {
        components: primitive.colors.components,
        values: primitive.colors.values.slice(),
      },
    } : {}),
    id: primitive.id,
    indices: primitive.indices.slice(),
    ...(primitive.materialId ? { materialId: primitive.materialId } : {}),
    normals: primitive.normals?.slice(),
    positions: primitive.positions.slice(),
    sourceTriangleIndices: Array.from(
      { length: primitive.indices.length / 3 },
      (_, index) => index,
    ),
    ...(primitive.textureCoordinates ? {
      textureCoordinates: primitive.textureCoordinates.map(({ set, values }) => ({
        set,
        values: values.slice(),
      })),
    } : {}),
  };
}

function compactAttribute(
  values: Float32Array,
  components: number,
  retained: readonly number[],
): Float32Array {
  const compacted = new Float32Array(retained.length * components);
  retained.forEach((sourceVertex, targetVertex) => {
    compacted.set(
      values.subarray(
        sourceVertex * components,
        sourceVertex * components + components,
      ),
      targetVertex * components,
    );
  });
  return compacted;
}

function assertOperationContext(
  primitive: WorkingPrimitive,
  primitiveIndex: number,
  operation: ToolcraftModelRepairOperation,
): void {
  if (operation.primitiveIndex !== primitiveIndex ||
      operation.primitiveId !== primitive.id) {
    throw new Error(`Repair operation ${operation.type} has stale primitive context.`);
  }
}

function removeTriangles(
  primitive: WorkingPrimitive,
  operation: ToolcraftRemoveTrianglesRepairOperation,
): void {
  const removed = new Set(operation.triangleIndices);
  if (removed.size !== operation.triangleIndices.length) {
    throw new Error(`${operation.type} contains duplicate triangle inputs.`);
  }
  const indices: number[] = [];
  const sourceTriangleIndices: number[] = [];
  let removedCount = 0;
  primitive.sourceTriangleIndices.forEach((sourceTriangleIndex, currentIndex) => {
    if (removed.has(sourceTriangleIndex)) {
      removedCount += 1;
      return;
    }
    indices.push(
      primitive.indices[currentIndex * 3]!,
      primitive.indices[currentIndex * 3 + 1]!,
      primitive.indices[currentIndex * 3 + 2]!,
    );
    sourceTriangleIndices.push(sourceTriangleIndex);
  });
  if (removedCount !== removed.size ||
      operation.expectedCountDelta.triangles !== -removedCount) {
    throw new Error(`${operation.type} triangle inputs no longer match the source.`);
  }
  primitive.indices = new Uint32Array(indices);
  primitive.sourceTriangleIndices = sourceTriangleIndices;
}

function repairWinding(
  primitive: WorkingPrimitive,
  operation: Extract<ToolcraftModelRepairOperation, { type: "repair-local-winding" }>,
): void {
  const flipped = new Set(operation.flippedTriangleIndices);
  let flipCount = 0;
  primitive.sourceTriangleIndices.forEach((sourceTriangleIndex, currentIndex) => {
    if (!flipped.has(sourceTriangleIndex)) return;
    const offset = currentIndex * 3;
    const second = primitive.indices[offset + 1]!;
    primitive.indices[offset + 1] = primitive.indices[offset + 2]!;
    primitive.indices[offset + 2] = second;
    flipCount += 1;
  });
  if (flipCount !== flipped.size) {
    throw new Error("repair-local-winding triangle inputs no longer match the source.");
  }
}

function compactVertices(
  primitive: WorkingPrimitive,
  operation: ToolcraftCompactVerticesRepairOperation,
): void {
  const retained = operation.retainedVertexIndices;
  const removed = new Set(operation.removedVertexIndices);
  if (retained.length + removed.size !== primitive.positions.length / 3 ||
      operation.expectedCountDelta.vertices !== -removed.size) {
    throw new Error("compact-unused-vertices inputs do not partition source vertices.");
  }
  const remap = new Map<number, number>();
  const positions = new Float32Array(retained.length * 3);
  const canCompactNormals = primitive.normals?.length === primitive.positions.length;
  const normals = canCompactNormals ? new Float32Array(retained.length * 3) : undefined;
  retained.forEach((sourceVertex, targetVertex) => {
    if (removed.has(sourceVertex) || remap.has(sourceVertex) ||
        sourceVertex < 0 || sourceVertex >= primitive.positions.length / 3) {
      throw new Error("compact-unused-vertices has an invalid retained vertex input.");
    }
    remap.set(sourceVertex, targetVertex);
    positions.set(
      primitive.positions.subarray(sourceVertex * 3, sourceVertex * 3 + 3),
      targetVertex * 3,
    );
    if (normals !== undefined && primitive.normals !== undefined) {
      normals.set(
        primitive.normals.subarray(sourceVertex * 3, sourceVertex * 3 + 3),
        targetVertex * 3,
      );
    }
  });
  const indices = new Uint32Array(primitive.indices.length);
  for (let index = 0; index < primitive.indices.length; index += 1) {
    const mapped = remap.get(primitive.indices[index]!);
    if (mapped === undefined) {
      throw new Error("compact-unused-vertices would discard a referenced vertex.");
    }
    indices[index] = mapped;
  }
  primitive.positions = positions;
  primitive.indices = indices;
  primitive.normals = normals;
  if (primitive.colors) {
    primitive.colors = {
      components: primitive.colors.components,
      values: compactAttribute(
        primitive.colors.values,
        primitive.colors.components,
        retained,
      ),
    };
  }
  if (primitive.textureCoordinates) {
    primitive.textureCoordinates = primitive.textureCoordinates.map(
      ({ set, values }) => ({
        set,
        values: compactAttribute(values, 2, retained),
      }),
    );
  }
}

function applyOperation(
  primitives: WorkingPrimitive[],
  operation: ToolcraftModelRepairOperation,
): void {
  const primitive = primitives[operation.primitiveIndex];
  if (primitive === undefined) {
    throw new Error(`Repair operation ${operation.type} references a missing primitive.`);
  }
  assertOperationContext(primitive, operation.primitiveIndex, operation);
  switch (operation.type) {
    case "remove-invalid-triangles":
    case "remove-duplicate-triangles":
      removeTriangles(primitive, operation);
      return;
    case "repair-local-winding":
      repairWinding(primitive, operation);
      return;
    case "compact-unused-vertices":
      compactVertices(primitive, operation);
      return;
    case "regenerate-normals": {
      if (primitive.positions.length / 3 !== operation.vertexCount) {
        throw new Error("regenerate-normals vertex count no longer matches the plan.");
      }
      const normals = regenerateAreaWeightedNormals(
        primitive.positions,
        primitive.indices,
      );
      if (normals === undefined) {
        throw new Error("regenerate-normals safety preconditions were not satisfied.");
      }
      primitive.normals = normals;
      return;
    }
    case "recalculate-bounds":
      primitive.bounds = calculateRequiredBounds(primitive.positions);
      return;
  }
}

function verifyPlanDigest(plan: ToolcraftModelRepairPlan): void {
  const payload = {
    algorithmVersion: plan.algorithmVersion,
    analyzerVersion: plan.analyzerVersion,
    operations: plan.operations,
    profile: plan.profile,
    sourceDocumentDigest: plan.sourceDocumentDigest,
  };
  if (digestToolcraftRepairPlanPayload(payload) !== plan.planDigest) {
    throw new Error("Repair plan digest does not match its compiled operations.");
  }
  if (plan.algorithmVersion !== TOOLCRAFT_MODEL_REPAIR_ALGORITHM_VERSION ||
      plan.recipeId !== `${plan.algorithmVersion}:${plan.planDigest}`) {
    throw new Error("Repair plan recipe identity is unsupported.");
  }
}

function aggregatePrimitiveBounds(
  primitives: readonly ToolcraftModelPrimitive[],
): ToolcraftModelDocument["bounds"] {
  const min: [number, number, number] = [...primitives[0]!.bounds.min];
  const max: [number, number, number] = [...primitives[0]!.bounds.max];
  for (const primitive of primitives.slice(1)) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], primitive.bounds.min[axis]);
      max[axis] = Math.max(max[axis], primitive.bounds.max[axis]);
    }
  }
  return { max, min };
}

function uniqueOperationTypes(
  operations: readonly ToolcraftModelRepairOperation[],
): readonly ToolcraftModelRepairOperationType[] {
  const seen = new Set<ToolcraftModelRepairOperationType>();
  const types: ToolcraftModelRepairOperationType[] = [];
  for (const operation of operations) {
    if (!seen.has(operation.type)) {
      seen.add(operation.type);
      types.push(operation.type);
    }
  }
  return Object.freeze(types);
}

export function deriveToolcraftModelRepair(
  document: ToolcraftModelDocument,
  plan: ToolcraftModelRepairPlan,
): ToolcraftModelDocument {
  verifyPlanDigest(plan);
  if (digestToolcraftTopologyDocument(document) !== plan.sourceDocumentDigest) {
    throw new Error("Repair plan source document digest does not match the supplied document.");
  }
  const working = document.primitives.map(clonePrimitive);
  for (const operation of plan.operations) applyOperation(working, operation);
  const primitives: readonly ToolcraftModelPrimitiveV2[] = working.map((primitive) => {
    const bounds: ToolcraftModelBounds = Object.freeze({
      max: Object.freeze([...primitive.bounds.max]) as ToolcraftModelBounds["max"],
      min: Object.freeze([...primitive.bounds.min]) as ToolcraftModelBounds["min"],
    });
    const result: ToolcraftModelPrimitiveV2 = {
      bounds,
      ...(primitive.colors ? { colors: primitive.colors } : {}),
      id: primitive.id,
      indices: primitive.indices,
      ...(primitive.materialId ? { materialId: primitive.materialId } : {}),
      ...(primitive.normals === undefined ? {} : { normals: primitive.normals }),
      positions: primitive.positions,
      ...(primitive.textureCoordinates
        ? { textureCoordinates: primitive.textureCoordinates }
        : {}),
    };
    return Object.freeze(result);
  });
  const repair = Object.freeze({
    algorithmVersion: plan.algorithmVersion,
    operations: uniqueOperationTypes(plan.operations),
    planDigest: plan.planDigest,
    recipeId: plan.recipeId,
  });
  const nodes: readonly ToolcraftModelNode[] = document.nodes.map((node) =>
    Object.freeze({
      ...node,
      children: Object.freeze([...node.children]),
      localMatrix: Object.freeze([...node.localMatrix]) as ToolcraftModelNode["localMatrix"],
      primitiveIds: Object.freeze([...node.primitiveIds]),
    })
  );
  const base = {
    bounds: Object.freeze(aggregatePrimitiveBounds(primitives)),
    nodes: Object.freeze(nodes),
    primitives: Object.freeze(primitives),
    rootNodeIds: Object.freeze([...document.rootNodeIds]),
  };
  const repaired: ToolcraftModelDocument = document.version === 1
    ? ({
        ...base,
        provenance: Object.freeze({
          ...document.provenance,
          operations: Object.freeze([...document.provenance.operations]),
          repair,
        }),
        version: 1,
      } satisfies ToolcraftModelDocumentV1)
    : ({
        ...base,
        materials: document.materials,
        provenance: Object.freeze({
          ...document.provenance,
          operations: Object.freeze([...document.provenance.operations]),
          repair,
        }),
        textures: document.textures,
        version: 2,
      } satisfies ToolcraftModelDocumentV2);
  return getValidatedToolcraftModelDocumentSnapshot(repaired);
}
