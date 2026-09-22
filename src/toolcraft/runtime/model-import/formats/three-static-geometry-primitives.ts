import {
  Matrix4,
  type BufferAttribute,
  type InterleavedBufferAttribute,
  type Object3D,
} from "three";

import type { ToolcraftModelFormat } from "../../schema/types";
import type { ToolcraftSourceAssetFeedback } from "../../source-assets/source-asset-types";
import type {
  ToolcraftModelBounds,
  ToolcraftModelDocument,
  ToolcraftModelPrimitiveV2,
} from "../canonical/model-document";
import { TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS } from "../model-import-limit-values";
import type { ToolcraftModelDecodeContext } from "../model-import-types";

export type ThreeStaticGeometryFormat = Extract<
  ToolcraftModelFormat,
  "fbx" | "obj" | "ply" | "stl"
>;
export type ThreeStaticGeometryAttribute =
  | BufferAttribute
  | InterleavedBufferAttribute;
export type ThreeStaticGeometryPrimitivePlan = Readonly<{
  color?: ThreeStaticGeometryAttribute;
  drawCount: number;
  drawStart: number;
  index: BufferAttribute | null;
  normal?: ThreeStaticGeometryAttribute;
  position: ThreeStaticGeometryAttribute;
  primitiveId: string;
  textureCoordinates?: readonly Readonly<{
    attribute: ThreeStaticGeometryAttribute;
    set: 0 | 1;
  }>[];
}>;

export class ToolcraftThreeStaticGeometryError
  extends Error
  implements ToolcraftSourceAssetFeedback
{
  readonly category: ToolcraftSourceAssetFeedback["category"];
  readonly code: string;

  constructor(
    category: ToolcraftSourceAssetFeedback["category"],
    code: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolcraftThreeStaticGeometryError";
    this.category = category;
    this.code = code;
  }
}

export function threeStaticGeometryFailure(
  category: ToolcraftSourceAssetFeedback["category"],
  code: string,
  message: string,
): never {
  throw new ToolcraftThreeStaticGeometryError(category, code, message);
}

export function throwIfThreeStaticGeometryAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason ?? new DOMException("Model decode was cancelled.", "AbortError");
}

function checkpoint(signal: AbortSignal, index: number): void {
  if ((index & 255) === 0) throwIfThreeStaticGeometryAborted(signal);
}

export function getThreeStaticGeometryAttributeArray(
  attribute: ThreeStaticGeometryAttribute,
): ArrayBufferView {
  return "isInterleavedBufferAttribute" in attribute &&
      attribute.isInterleavedBufferAttribute
    ? attribute.data.array
    : attribute.array;
}

function boundsForPositions(positions: Float32Array): ToolcraftModelBounds {
  const min: [number, number, number] = [positions[0]!, positions[1]!, positions[2]!];
  const max: [number, number, number] = [...min];
  for (let offset = 3; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[offset + axis]!);
      max[axis] = Math.max(max[axis], positions[offset + axis]!);
    }
  }
  return { max, min };
}

function sourceIndex(
  plan: ThreeStaticGeometryPrimitivePlan,
  drawOffset: number,
): number {
  return plan.index?.getX(plan.drawStart + drawOffset) ??
    plan.drawStart + drawOffset;
}

export function countThreeStaticGeometryPrimitiveVertices(
  plan: ThreeStaticGeometryPrimitivePlan,
  signal: AbortSignal,
): number {
  const indices = new Set<number>();
  for (let drawOffset = 0; drawOffset < plan.drawCount; drawOffset += 1) {
    checkpoint(signal, drawOffset);
    const index = sourceIndex(plan, drawOffset);
    if (!Number.isInteger(index) || index < 0 || index >= plan.position.count) {
      return threeStaticGeometryFailure(
        "geometry",
        "index-out-of-range",
        "Decoded triangle indices must be integers within the position range.",
      );
    }
    indices.add(index);
  }
  return indices.size;
}

function createVertexRemap(
  plan: ThreeStaticGeometryPrimitivePlan,
  signal: AbortSignal,
): Readonly<{ indices: Uint32Array; sourceIndices: readonly number[] }> {
  const usedSources = new Set<number>();
  for (let drawOffset = 0; drawOffset < plan.drawCount; drawOffset += 1) {
    checkpoint(signal, drawOffset);
    usedSources.add(sourceIndex(plan, drawOffset));
  }
  const sourceIndices = [...usedSources].sort((left, right) => left - right);
  const canonicalBySource = new Map(
    sourceIndices.map((source, canonical) => [source, canonical]),
  );
  const indices = new Uint32Array(plan.drawCount);
  for (let drawOffset = 0; drawOffset < plan.drawCount; drawOffset += 1) {
    checkpoint(signal, drawOffset);
    indices[drawOffset] = canonicalBySource.get(sourceIndex(plan, drawOffset))!;
  }
  return { indices, sourceIndices };
}

function copyVec3(
  attribute: ThreeStaticGeometryAttribute,
  label: "normal" | "position",
  sourceIndices: readonly number[],
  signal: AbortSignal,
): Float32Array {
  const copy = new Float32Array(sourceIndices.length * 3);
  for (let index = 0; index < sourceIndices.length; index += 1) {
    checkpoint(signal, index);
    const source = sourceIndices[index]!;
    const values = [
      attribute.getX(source),
      attribute.getY(source),
      attribute.getZ(source),
    ];
    for (let axis = 0; axis < 3; axis += 1) {
      const value = values[axis]!;
      copy[index * 3 + axis] = value;
      if (!Number.isFinite(value) || !Number.isFinite(copy[index * 3 + axis])) {
        return threeStaticGeometryFailure(
          "geometry",
          `non-finite-${label}`,
          `Decoded ${label} data must contain only finite Float32 values.`,
        );
      }
    }
  }
  return copy;
}

function copyTextureCoordinates(
  attribute: ThreeStaticGeometryAttribute,
  sourceIndices: readonly number[],
  signal: AbortSignal,
): Float32Array {
  const values = new Float32Array(sourceIndices.length * 2);
  for (let index = 0; index < sourceIndices.length; index += 1) {
    checkpoint(signal, index);
    const source = sourceIndices[index]!;
    const u = attribute.getX(source);
    const v = attribute.getY(source);
    if (!Number.isFinite(u) || !Number.isFinite(v)) {
      return threeStaticGeometryFailure(
        "geometry",
        "non-finite-texture-coordinate",
        "Decoded texture coordinates must be finite.",
      );
    }
    values[index * 2] = u;
    values[index * 2 + 1] = v;
  }
  return values;
}

function copyColors(
  attribute: ThreeStaticGeometryAttribute,
  sourceIndices: readonly number[],
  signal: AbortSignal,
): ToolcraftModelPrimitiveV2["colors"] {
  const components = attribute.itemSize === 3 ? 3 : 4;
  const values = new Float32Array(sourceIndices.length * components);
  for (let index = 0; index < sourceIndices.length; index += 1) {
    checkpoint(signal, index);
    const source = sourceIndices[index]!;
    const channels = [
      attribute.getX(source),
      attribute.getY(source),
      attribute.getZ(source),
      attribute.getW(source),
    ];
    for (let channel = 0; channel < components; channel += 1) {
      const value = channels[channel]!;
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        return threeStaticGeometryFailure(
          "geometry",
          "invalid-vertex-color",
          "Decoded vertex colors must be finite values from 0 through 1.",
        );
      }
      values[index * components + channel] = value;
    }
  }
  return { components, values };
}

export function copyThreeStaticGeometryPrimitive(
  plan: ThreeStaticGeometryPrimitivePlan,
  signal: AbortSignal,
  materialId?: string,
): ToolcraftModelPrimitiveV2 {
  const remap = createVertexRemap(plan, signal);
  const positions = copyVec3(
    plan.position,
    "position",
    remap.sourceIndices,
    signal,
  );
  return {
    bounds: boundsForPositions(positions),
    ...(plan.color
      ? { colors: copyColors(plan.color, remap.sourceIndices, signal) }
      : {}),
    id: plan.primitiveId,
    indices: remap.indices,
    ...(materialId ? { materialId } : {}),
    ...(plan.normal
      ? {
          normals: copyVec3(
            plan.normal,
            "normal",
            remap.sourceIndices,
            signal,
          ),
        }
      : {}),
    positions,
    ...(plan.textureCoordinates
      ? {
          textureCoordinates: plan.textureCoordinates.map(({ attribute, set }) => ({
            set,
            values: copyTextureCoordinates(
              attribute,
              remap.sourceIndices,
              signal,
            ),
          })),
        }
      : {}),
  };
}

export function getThreeStaticGeometryLocalMatrix(
  node: Object3D,
): ToolcraftModelDocument["nodes"][number]["localMatrix"] {
  const matrix = node.matrixAutoUpdate
    ? new Matrix4().compose(node.position, node.quaternion, node.scale)
    : node.matrix;
  const values = matrix.toArray();
  if (values.some((value) => !Number.isFinite(value))) {
    return threeStaticGeometryFailure(
      "geometry",
      "non-finite-node-transform",
      "Decoded node transforms must contain only finite values.",
    );
  }
  return values as ToolcraftModelDocument["nodes"][number]["localMatrix"];
}

export function checkedThreeStaticGeometryTotal(
  current: number,
  additional: number,
  limit: number,
  code: string,
  label: string,
): number {
  if (
    !Number.isSafeInteger(current) ||
    !Number.isSafeInteger(additional) ||
    current < 0 ||
    additional < 0 ||
    current > limit - additional
  ) {
    return threeStaticGeometryFailure(
      "resource-limit",
      code,
      `${label} exceeds the configured limit ${limit}.`,
    );
  }
  return current + additional;
}

export function validateThreeStaticGeometryLimits(
  limits: ToolcraftModelDecodeContext["limits"],
): void {
  for (const name of Object.keys(
    TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS,
  ) as Array<keyof typeof TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS>) {
    const value = limits[name];
    if (
      !Number.isSafeInteger(value) ||
      value <= 0 ||
      value > TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS[name]
    ) {
      return threeStaticGeometryFailure(
        "resource-limit",
        "invalid-import-limits",
        `Model import limit ${name} is outside its protected integer range.`,
      );
    }
  }
}
