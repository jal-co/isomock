import { Accessor, type Primitive } from "@gltf-transform/core";

import type {
  ToolcraftModelBounds,
  ToolcraftModelPrimitive,
} from "../canonical/model-document";
import {
  checkedGltfScale,
  gltfDecodeCheckpoint,
  gltfDecodeFailure,
} from "./gltf-decode-safety";

export type GltfTriangleIndexPlan = Readonly<{
  indexByteLength: number;
  indexCount: number;
  mode: number;
  sequential: boolean;
  source: Accessor | null;
  triangleCount: number;
  triangulated: boolean;
}>;

export function copyGltfVec3Accessor(
  accessor: Accessor,
  semantic: "NORMAL" | "POSITION",
  signal: AbortSignal,
): Float32Array {
  if (accessor.getType() !== Accessor.Type.VEC3) {
    return gltfDecodeFailure(
      "geometry",
      semantic === "POSITION"
        ? "invalid-position-accessor"
        : "invalid-normal-accessor",
      `${semantic} accessors must use VEC3 elements.`,
    );
  }
  const output = new Float32Array(
    checkedGltfScale(accessor.getCount(), 3, "max-vertices-exceeded"),
  );
  const element: number[] = [0, 0, 0];
  for (let index = 0; index < accessor.getCount(); index += 1) {
    gltfDecodeCheckpoint(signal, index);
    accessor.getElement(index, element);
    for (let axis = 0; axis < 3; axis += 1) {
      const value = element[axis]!;
      if (!Number.isFinite(value)) {
        return gltfDecodeFailure(
          "geometry",
          semantic === "POSITION" ? "non-finite-position" : "non-finite-normal",
          `${semantic} contains a non-finite component.`,
        );
      }
      output[index * 3 + axis] = value;
    }
  }
  return output;
}

export function copyGltfVec2Accessor(
  accessor: Accessor,
  semantic: "TEXCOORD_0" | "TEXCOORD_1",
  signal: AbortSignal,
): Float32Array {
  if (accessor.getType() !== Accessor.Type.VEC2) {
    return gltfDecodeFailure(
      "geometry",
      "invalid-texture-coordinate-accessor",
      `${semantic} accessors must use VEC2 elements.`,
    );
  }
  const output = new Float32Array(
    checkedGltfScale(accessor.getCount(), 2, "max-vertices-exceeded"),
  );
  const element: number[] = [0, 0];
  for (let index = 0; index < accessor.getCount(); index += 1) {
    gltfDecodeCheckpoint(signal, index);
    accessor.getElement(index, element);
    for (let axis = 0; axis < 2; axis += 1) {
      const value = element[axis]!;
      if (!Number.isFinite(value)) {
        return gltfDecodeFailure(
          "geometry",
          "non-finite-texture-coordinate",
          `${semantic} contains a non-finite component.`,
        );
      }
      output[index * 2 + axis] = value;
    }
  }
  return output;
}

export function copyGltfColorAccessor(
  accessor: Accessor,
  signal: AbortSignal,
): Readonly<{ components: 3 | 4; values: Float32Array }> {
  const components = accessor.getType() === Accessor.Type.VEC3
    ? 3
    : accessor.getType() === Accessor.Type.VEC4
    ? 4
    : undefined;
  if (!components) {
    return gltfDecodeFailure(
      "geometry",
      "invalid-color-accessor",
      "COLOR_0 accessors must use VEC3 or VEC4 elements.",
    );
  }
  const output = new Float32Array(
    checkedGltfScale(
      accessor.getCount(),
      components,
      "max-vertices-exceeded",
    ),
  );
  const element: number[] = [0, 0, 0, 1];
  for (let index = 0; index < accessor.getCount(); index += 1) {
    gltfDecodeCheckpoint(signal, index);
    accessor.getElement(index, element);
    for (let channel = 0; channel < components; channel += 1) {
      const value = element[channel]!;
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        return gltfDecodeFailure(
          "geometry",
          "invalid-vertex-color",
          "COLOR_0 components must be finite values from 0 through 1.",
        );
      }
      output[index * components + channel] = value;
    }
  }
  return Object.freeze({ components, values: output });
}

function triangleCount(mode: number, sourceCount: number): number {
  if (mode === 4) {
    if (sourceCount < 3 || sourceCount % 3 !== 0) {
      return gltfDecodeFailure(
        "geometry",
        "malformed-triangle-primitive",
        "TRIANGLES input must contain complete triangle triples.",
      );
    }
    return sourceCount / 3;
  }
  if (mode === 5 || mode === 6) {
    if (sourceCount < 3) {
      return gltfDecodeFailure(
        "geometry",
        "malformed-triangle-primitive",
        "Triangle strips and fans require at least three vertices.",
      );
    }
    return sourceCount - 2;
  }
  return gltfDecodeFailure(
    "format",
    "unsupported-primitive-mode",
    `glTF primitive mode ${mode} is not supported by triangle geometry import.`,
  );
}

export function planGltfTriangleIndices(
  primitive: Primitive,
  vertexCount: number,
): GltfTriangleIndexPlan {
  const source = primitive.getIndices();
  if (
    source &&
    (source.getType() !== Accessor.Type.SCALAR ||
      ![5121, 5123, 5125].includes(source.getComponentType()) ||
      source.getNormalized())
  ) {
    return gltfDecodeFailure(
      "geometry",
      "invalid-index-accessor",
      "Indices must be non-normalized unsigned scalar accessors.",
    );
  }
  const mode = primitive.getMode();
  const triangles = triangleCount(mode, source?.getCount() ?? vertexCount);
  const indexCount = checkedGltfScale(
    triangles,
    3,
    "max-triangles-exceeded",
  );
  return {
    indexByteLength: checkedGltfScale(
      indexCount,
      Uint32Array.BYTES_PER_ELEMENT,
      "decoded-byte-limit-exceeded",
    ),
    indexCount,
    mode,
    sequential: !source,
    source,
    triangleCount: triangles,
    triangulated: mode !== 4,
  };
}

export function copyGltfTriangleIndices(
  plan: GltfTriangleIndexPlan,
  vertexCount: number,
  signal: AbortSignal,
): Uint32Array {
  const output = new Uint32Array(plan.indexCount);
  const read = (index: number): number => {
    gltfDecodeCheckpoint(signal, index);
    const value = plan.source ? plan.source.getScalar(index) : index;
    if (!Number.isInteger(value) || value < 0 || value >= vertexCount) {
      return gltfDecodeFailure(
        "geometry",
        "index-out-of-range",
        "A glTF triangle index is corrupt or outside its POSITION accessor.",
      );
    }
    return value;
  };
  for (let triangle = 0; triangle < plan.triangleCount; triangle += 1) {
    const offset = triangle * 3;
    if (plan.mode === 4) {
      output[offset] = read(offset);
      output[offset + 1] = read(offset + 1);
      output[offset + 2] = read(offset + 2);
    } else if (plan.mode === 5) {
      const first = triangle & 1 ? triangle + 1 : triangle;
      const second = triangle & 1 ? triangle : triangle + 1;
      output[offset] = read(first);
      output[offset + 1] = read(second);
      output[offset + 2] = read(triangle + 2);
    } else {
      output[offset] = read(0);
      output[offset + 1] = read(triangle + 1);
      output[offset + 2] = read(triangle + 2);
    }
  }
  return output;
}

export function boundsForGltfPositions(
  positions: Float32Array,
  signal: AbortSignal,
): ToolcraftModelBounds {
  const min: [number, number, number] = [
    positions[0]!,
    positions[1]!,
    positions[2]!,
  ];
  const max: [number, number, number] = [...min];
  for (let offset = 3; offset < positions.length; offset += 3) {
    gltfDecodeCheckpoint(signal, offset / 3);
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[offset + axis]!);
      max[axis] = Math.max(max[axis], positions[offset + axis]!);
    }
  }
  return { max, min };
}

export function aggregateGltfPrimitiveBounds(
  primitives: readonly ToolcraftModelPrimitive[],
  signal: AbortSignal,
): ToolcraftModelBounds {
  const min: [number, number, number] = [...primitives[0]!.bounds.min];
  const max: [number, number, number] = [...primitives[0]!.bounds.max];
  for (let index = 1; index < primitives.length; index += 1) {
    gltfDecodeCheckpoint(signal, index);
    const primitive = primitives[index]!;
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], primitive.bounds.min[axis]);
      max[axis] = Math.max(max[axis], primitive.bounds.max[axis]);
    }
  }
  return { max, min };
}
