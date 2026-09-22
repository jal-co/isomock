import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  MeshStandardMaterial,
  Sphere,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type {
  ToolcraftModelPrimitive,
  ToolcraftModelPrimitiveV1,
  ToolcraftModelPrimitiveV2,
} from "../../model-import/canonical/model-document";

export type ToolcraftRenderablePrimitive = ToolcraftModelPrimitiveV1 | ToolcraftModelPrimitiveV2;

type ToolcraftRenderGeometryArrays = Readonly<{
  colors?: Readonly<{ components: 3 | 4; values: Float32Array }>;
  indices: Uint32Array;
  normals?: Float32Array;
  positions: Float32Array;
  textureCoordinates?: readonly Readonly<{
    set: 0 | 1;
    values: Float32Array;
  }>[];
}>;

type ToolcraftPrimitiveGeometryBatch = {
  geometries: BufferGeometry[];
  material: MeshStandardMaterial;
  primitiveIds: string[];
};

type ToolcraftOpaquePrimitiveRepresentative = Readonly<{
  batch: ToolcraftPrimitiveGeometryBatch;
  primitive: ToolcraftRenderablePrimitive;
}>;

function createRenderGeometryArrays(
  primitive: ToolcraftRenderablePrimitive,
): ToolcraftRenderGeometryArrays {
  const vertexCount = primitive.positions.length / 3;
  const referenced = new Uint8Array(vertexCount);
  let referencedCount = 0;
  for (const vertexIndex of primitive.indices) {
    if (referenced[vertexIndex] === 0) {
      referenced[vertexIndex] = 1;
      referencedCount += 1;
    }
  }
  if (referencedCount === vertexCount) {
    return {
      ...("colors" in primitive && primitive.colors
        ? {
            colors: {
              components: primitive.colors.components,
              values: new Float32Array(primitive.colors.values),
            },
          }
        : {}),
      indices: new Uint32Array(primitive.indices),
      ...(primitive.normals ? { normals: new Float32Array(primitive.normals) } : {}),
      positions: new Float32Array(primitive.positions),
      ...("textureCoordinates" in primitive && primitive.textureCoordinates
        ? {
            textureCoordinates: primitive.textureCoordinates.map(({ set, values }) => ({
              set,
              values: new Float32Array(values),
            })),
          }
        : {}),
    };
  }

  const remap = new Uint32Array(vertexCount);
  const positions = new Float32Array(referencedCount * 3);
  const normals = primitive.normals ? new Float32Array(referencedCount * 3) : undefined;
  const colors =
    "colors" in primitive && primitive.colors
      ? {
          components: primitive.colors.components,
          values: new Float32Array(referencedCount * primitive.colors.components),
        }
      : undefined;
  const textureCoordinates =
    "textureCoordinates" in primitive && primitive.textureCoordinates
      ? primitive.textureCoordinates.map(({ set }) => ({
          set,
          values: new Float32Array(referencedCount * 2),
        }))
      : undefined;
  let targetVertex = 0;
  for (let sourceVertex = 0; sourceVertex < vertexCount; sourceVertex += 1) {
    if (referenced[sourceVertex] === 0) continue;
    remap[sourceVertex] = targetVertex;
    positions.set(
      primitive.positions.subarray(sourceVertex * 3, sourceVertex * 3 + 3),
      targetVertex * 3,
    );
    if (normals && primitive.normals) {
      normals.set(
        primitive.normals.subarray(sourceVertex * 3, sourceVertex * 3 + 3),
        targetVertex * 3,
      );
    }
    if (colors && "colors" in primitive && primitive.colors) {
      const components = primitive.colors.components;
      colors.values.set(
        primitive.colors.values.subarray(
          sourceVertex * components,
          sourceVertex * components + components,
        ),
        targetVertex * components,
      );
    }
    if (textureCoordinates && "textureCoordinates" in primitive && primitive.textureCoordinates) {
      textureCoordinates.forEach((target, setIndex) => {
        const source = primitive.textureCoordinates?.[setIndex];
        if (!source) return;
        target.values.set(
          source.values.subarray(sourceVertex * 2, sourceVertex * 2 + 2),
          targetVertex * 2,
        );
      });
    }
    targetVertex += 1;
  }
  const indices = new Uint32Array(primitive.indices.length);
  for (let index = 0; index < primitive.indices.length; index += 1) {
    indices[index] = remap[primitive.indices[index]!]!;
  }
  return {
    ...(colors ? { colors } : {}),
    indices,
    ...(normals ? { normals } : {}),
    positions,
    ...(textureCoordinates ? { textureCoordinates } : {}),
  };
}

function createGeometryFromRenderArrays(
  renderArrays: ReturnType<typeof createRenderGeometryArrays>,
  bounds: ToolcraftModelPrimitive["bounds"],
): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(renderArrays.positions, 3));
  geometry.setIndex(new BufferAttribute(renderArrays.indices, 1));
  if (renderArrays.normals) {
    geometry.setAttribute("normal", new BufferAttribute(renderArrays.normals, 3));
  } else {
    geometry.computeVertexNormals();
  }
  if (renderArrays.colors) {
    geometry.setAttribute(
      "color",
      new BufferAttribute(renderArrays.colors.values, renderArrays.colors.components),
    );
  }
  for (const textureCoordinates of renderArrays.textureCoordinates ?? []) {
    geometry.setAttribute(
      textureCoordinates.set === 0 ? "uv" : "uv1",
      new BufferAttribute(textureCoordinates.values, 2),
    );
  }
  geometry.boundingBox = new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max));
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new Sphere());
  return geometry;
}

function createGeometry(primitive: ToolcraftRenderablePrimitive): BufferGeometry {
  return createGeometryFromRenderArrays(createRenderGeometryArrays(primitive), primitive.bounds);
}

function geometryBatchSignature(geometry: BufferGeometry): string {
  return Object.entries(geometry.attributes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, attribute]) =>
      [
        name,
        attribute.itemSize,
        attribute.normalized ? 1 : 0,
        attribute.array.constructor.name,
      ].join(":"),
    )
    .join("|");
}

function hashPrimitiveArray(hash: number, values: ArrayBufferView | undefined): number {
  if (!values) return Math.imul(hash ^ 0xff, 16_777_619) >>> 0;
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  let next = Math.imul(hash ^ bytes.byteLength, 16_777_619) >>> 0;
  for (const value of bytes) {
    next = Math.imul(next ^ value, 16_777_619) >>> 0;
  }
  return next;
}

function primitiveGeometryFingerprint(primitive: ToolcraftRenderablePrimitive): string {
  let hash = hashPrimitiveArray(2_166_136_261, primitive.indices);
  hash = hashPrimitiveArray(hash, primitive.positions);
  hash = hashPrimitiveArray(hash, primitive.normals);
  if ("colors" in primitive) {
    hash = hashPrimitiveArray(hash, primitive.colors?.values);
  }
  if ("textureCoordinates" in primitive) {
    for (const coordinates of primitive.textureCoordinates ?? []) {
      hash = Math.imul(hash ^ coordinates.set, 16_777_619) >>> 0;
      hash = hashPrimitiveArray(hash, coordinates.values);
    }
  }
  return hash.toString(16);
}

function arraysEqual(
  left: ArrayLike<number> | undefined,
  right: ArrayLike<number> | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function primitiveGeometriesEqual(
  left: ToolcraftRenderablePrimitive,
  right: ToolcraftRenderablePrimitive,
): boolean {
  if (
    !arraysEqual(left.bounds.min, right.bounds.min) ||
    !arraysEqual(left.bounds.max, right.bounds.max) ||
    !arraysEqual(left.indices, right.indices) ||
    !arraysEqual(left.positions, right.positions) ||
    !arraysEqual(left.normals, right.normals)
  )
    return false;
  const leftColors = "colors" in left ? left.colors : undefined;
  const rightColors = "colors" in right ? right.colors : undefined;
  if (
    leftColors?.components !== rightColors?.components ||
    !arraysEqual(leftColors?.values, rightColors?.values)
  )
    return false;
  const leftCoordinates = "textureCoordinates" in left ? (left.textureCoordinates ?? []) : [];
  const rightCoordinates = "textureCoordinates" in right ? (right.textureCoordinates ?? []) : [];
  return (
    leftCoordinates.length === rightCoordinates.length &&
    leftCoordinates.every((coordinates, index) => {
      const other = rightCoordinates[index];
      return coordinates.set === other?.set && arraysEqual(coordinates.values, other.values);
    })
  );
}

function batchNodePrimitives(
  primitives: readonly ToolcraftRenderablePrimitive[],
  createMaterial: (primitive: ToolcraftRenderablePrimitive) => MeshStandardMaterial,
): ToolcraftPrimitiveGeometryBatch[] {
  const batchesByMaterial = new Map<
    MeshStandardMaterial,
    Map<string, ToolcraftPrimitiveGeometryBatch>
  >();
  const opaqueRepresentatives = new Map<
    MeshStandardMaterial,
    Map<string, ToolcraftOpaquePrimitiveRepresentative[]>
  >();
  for (const primitive of primitives) {
    const material = createMaterial(primitive);
    const canDeduplicate = primitives.length > 1 && !material.transparent && material.depthWrite;
    const fingerprint = canDeduplicate ? primitiveGeometryFingerprint(primitive) : undefined;
    const representatives =
      fingerprint === undefined ? undefined : opaqueRepresentatives.get(material)?.get(fingerprint);
    const duplicate = representatives?.find((representative) =>
      primitiveGeometriesEqual(representative.primitive, primitive),
    );
    if (duplicate) {
      duplicate.batch.primitiveIds.push(primitive.id);
      continue;
    }
    const geometry = createGeometry(primitive);
    let batchesBySignature = batchesByMaterial.get(material);
    if (!batchesBySignature) {
      batchesBySignature = new Map();
      batchesByMaterial.set(material, batchesBySignature);
    }
    const signature = geometryBatchSignature(geometry);
    const batch = batchesBySignature.get(signature);
    let targetBatch: ToolcraftPrimitiveGeometryBatch;
    if (batch) {
      batch.geometries.push(geometry);
      batch.primitiveIds.push(primitive.id);
      targetBatch = batch;
    } else {
      targetBatch = {
        geometries: [geometry],
        material,
        primitiveIds: [primitive.id],
      };
      batchesBySignature.set(signature, targetBatch);
    }
    if (fingerprint !== undefined) {
      let byFingerprint = opaqueRepresentatives.get(material);
      if (!byFingerprint) {
        byFingerprint = new Map();
        opaqueRepresentatives.set(material, byFingerprint);
      }
      const matches = byFingerprint.get(fingerprint) ?? [];
      matches.push({ batch: targetBatch, primitive });
      byFingerprint.set(fingerprint, matches);
    }
  }
  return [...batchesByMaterial.values()].flatMap((batches) => [...batches.values()]);
}

function mergePrimitiveBatch(batch: ToolcraftPrimitiveGeometryBatch): BufferGeometry {
  if (batch.geometries.length === 1) return batch.geometries[0]!;
  const merged = mergeGeometries(batch.geometries, false);
  if (!merged) {
    for (const geometry of batch.geometries) geometry.dispose();
    throw new Error("Compatible canonical model geometries could not be batched.");
  }
  for (const geometry of batch.geometries) geometry.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export type ToolcraftPrimitiveGeometryProjection = Readonly<{
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  primitiveIds: readonly string[];
}>;

export function createToolcraftPrimitiveGeometryProjections(
  primitives: readonly ToolcraftRenderablePrimitive[],
  createMaterial: (primitive: ToolcraftRenderablePrimitive) => MeshStandardMaterial,
): readonly ToolcraftPrimitiveGeometryProjection[] {
  return batchNodePrimitives(primitives, createMaterial).map((batch) => ({
    geometry: mergePrimitiveBatch(batch),
    material: batch.material,
    primitiveIds: [...batch.primitiveIds],
  }));
}
