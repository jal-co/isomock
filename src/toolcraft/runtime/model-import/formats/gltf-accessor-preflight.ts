import type { GLTF } from "@gltf-transform/core";

import type { ToolcraftModelImportLimits } from "../../schema/types";
import {
  checkedGltfScale,
  checkedGltfTotal,
  gltfDecodeCheckpoint,
  gltfDecodeFailure,
} from "./gltf-decode-safety";
import {
  assertGltfByteRange,
  type GltfAccessorInfo,
  type GltfBufferViewInfo,
  GLTF_COMPONENT_BYTES,
  getGltfElementByteLength,
  gltfJsonArray,
  gltfJsonIndexed,
  gltfJsonInteger,
  gltfJsonOptionalInteger,
  gltfJsonRecord,
} from "./gltf-json-inspection";

function assertAligned(
  view: GltfBufferViewInfo,
  offset: number,
  alignment: number,
  label: string,
): void {
  if ((view.byteOffset + offset) % alignment !== 0) {
    gltfDecodeFailure(
      "format",
      "invalid-gltf-accessor",
      `${label} is not aligned to its component size.`,
    );
  }
}

function inspectSparseAccessor(
  sparseValue: unknown,
  accessorCount: number,
  componentBytes: number,
  elementBytes: number,
  views: readonly GltfBufferViewInfo[],
  label: string,
  signal: AbortSignal,
): number {
  const sparse = gltfJsonRecord(
    sparseValue,
    "invalid-gltf-accessor",
    `${label}.sparse`,
  );
  const count = gltfJsonInteger(
    sparse.count,
    "invalid-gltf-accessor",
    `${label}.sparse.count`,
    1,
  );
  if (count > accessorCount) {
    return gltfDecodeFailure(
      "format",
      "invalid-gltf-accessor",
      `${label}.sparse.count exceeds accessor count.`,
    );
  }

  const indices = gltfJsonRecord(
    sparse.indices,
    "invalid-gltf-accessor",
    `${label}.sparse.indices`,
  );
  const indexComponentType = gltfJsonInteger(
    indices.componentType,
    "invalid-gltf-accessor",
    `${label}.sparse.indices.componentType`,
  );
  if (![5121, 5123, 5125].includes(indexComponentType)) {
    return gltfDecodeFailure(
      "format",
      "invalid-sparse-indices",
      `${label}.sparse indices must use an unsigned integer component type.`,
    );
  }
  const indexComponentBytes = GLTF_COMPONENT_BYTES[indexComponentType]!;
  const indexView = gltfJsonIndexed(
    views,
    indices.bufferView,
    "invalid-gltf-accessor",
    `${label}.sparse.indices.bufferView`,
  );
  const indexOffset = gltfJsonOptionalInteger(
    indices.byteOffset,
    "invalid-gltf-accessor",
    `${label}.sparse.indices.byteOffset`,
  );
  assertAligned(indexView, indexOffset, indexComponentBytes, `${label}.sparse.indices`);
  assertGltfByteRange(
    indexOffset,
    checkedGltfScale(
      count,
      indexComponentBytes,
      "decoded-byte-limit-exceeded",
    ),
    indexView.byteLength,
    "invalid-gltf-accessor",
    `${label}.sparse.indices`,
  );
  if (indexView.meshoptCompressed) {
    return gltfDecodeFailure(
      "format",
      "invalid-sparse-indices",
      `${label}.sparse indices cannot be verified from a compressed bufferView before decode.`,
    );
  }
  const indexBytes = indexView.readBytes();
  const indexData = new DataView(
    indexBytes.buffer,
    indexBytes.byteOffset,
    indexBytes.byteLength,
  );
  let previous = -1;
  for (let index = 0; index < count; index += 1) {
    gltfDecodeCheckpoint(signal, index);
    const offset = indexOffset + index * indexComponentBytes;
    const sparseIndex =
      indexComponentType === 5121
        ? indexData.getUint8(offset)
        : indexComponentType === 5123
          ? indexData.getUint16(offset, true)
          : indexData.getUint32(offset, true);
    if (sparseIndex >= accessorCount) {
      return gltfDecodeFailure(
        "format",
        "invalid-sparse-indices",
        `${label}.sparse index is outside the accessor count.`,
      );
    }
    if (sparseIndex <= previous) {
      return gltfDecodeFailure(
        "format",
        "invalid-sparse-indices",
        `${label}.sparse indices must be strictly increasing and unique.`,
      );
    }
    previous = sparseIndex;
  }

  const values = gltfJsonRecord(
    sparse.values,
    "invalid-gltf-accessor",
    `${label}.sparse.values`,
  );
  const valueView = gltfJsonIndexed(
    views,
    values.bufferView,
    "invalid-gltf-accessor",
    `${label}.sparse.values.bufferView`,
  );
  const valueOffset = gltfJsonOptionalInteger(
    values.byteOffset,
    "invalid-gltf-accessor",
    `${label}.sparse.values.byteOffset`,
  );
  assertAligned(valueView, valueOffset, componentBytes, `${label}.sparse.values`);
  assertGltfByteRange(
    valueOffset,
    checkedGltfScale(count, elementBytes, "decoded-byte-limit-exceeded"),
    valueView.byteLength,
    "invalid-gltf-accessor",
    `${label}.sparse.values`,
  );
  return checkedGltfScale(
    count,
    elementBytes + Uint32Array.BYTES_PER_ELEMENT,
    "decoded-byte-limit-exceeded",
  );
}

export function preflightGltfAccessors(
  json: GLTF.IGLTF,
  views: readonly GltfBufferViewInfo[],
  limits: ToolcraftModelImportLimits,
  signal: AbortSignal,
): { accessors: GltfAccessorInfo[]; decodedBytes: number } {
  const definitions = gltfJsonArray(
    json.accessors,
    "invalid-gltf-accessors",
    "glTF accessors",
  );
  const accessors: GltfAccessorInfo[] = [];
  let decodedBytes = 0;
  definitions.forEach((value, index) => {
    gltfDecodeCheckpoint(signal, index);
    const label = `accessor ${index}`;
    const definition = gltfJsonRecord(
      value,
      "invalid-gltf-accessor",
      label,
    );
    const count = gltfJsonInteger(
      definition.count,
      "invalid-gltf-accessor",
      `${label}.count`,
      1,
    );
    const componentType = gltfJsonInteger(
      definition.componentType,
      "invalid-gltf-accessor",
      `${label}.componentType`,
    );
    const type = definition.type;
    const elementBytes =
      typeof type === "string"
        ? getGltfElementByteLength(componentType, type)
        : undefined;
    if (!elementBytes || typeof type !== "string") {
      return gltfDecodeFailure(
        "format",
        "invalid-gltf-accessor",
        `${label} has an unsupported componentType or type.`,
      );
    }
    if (
      definition.normalized !== undefined &&
      typeof definition.normalized !== "boolean"
    ) {
      return gltfDecodeFailure(
        "format",
        "invalid-gltf-accessor",
        `${label}.normalized must be boolean.`,
      );
    }
    if (
      definition.normalized === true &&
      [5126, 5130, 5131].includes(componentType)
    ) {
      return gltfDecodeFailure(
        "format",
        "invalid-gltf-accessor",
        `${label} cannot normalize FLOAT components.`,
      );
    }
    const byteLength = checkedGltfScale(
      count,
      elementBytes,
      "decoded-byte-limit-exceeded",
    );
    if (definition.bufferView === undefined) {
      if (definition.byteOffset !== undefined) {
        return gltfDecodeFailure(
          "format",
          "invalid-gltf-accessor",
          `${label}.byteOffset requires a bufferView.`,
        );
      }
    } else {
      const view = gltfJsonIndexed(
        views,
        definition.bufferView,
        "invalid-gltf-accessor",
        `${label}.bufferView`,
      );
      const offset = gltfJsonOptionalInteger(
        definition.byteOffset,
        "invalid-gltf-accessor",
        `${label}.byteOffset`,
      );
      const componentBytes = GLTF_COMPONENT_BYTES[componentType]!;
      assertAligned(view, offset, componentBytes, label);
      const stride = view.byteStride ?? elementBytes;
      if (stride < elementBytes || stride % componentBytes !== 0) {
        return gltfDecodeFailure(
          "format",
          "invalid-gltf-accessor",
          `${label} has an invalid byteStride.`,
        );
      }
      const spanned = checkedGltfTotal(
        checkedGltfScale(count - 1, stride, "decoded-byte-limit-exceeded"),
        elementBytes,
        Number.MAX_SAFE_INTEGER,
        "decoded-byte-limit-exceeded",
        label,
      );
      assertGltfByteRange(
        offset,
        spanned,
        view.byteLength,
        "invalid-gltf-accessor",
        label,
      );
    }
    const sparseBytes =
      definition.sparse === undefined
        ? 0
        : inspectSparseAccessor(
            definition.sparse,
            count,
            GLTF_COMPONENT_BYTES[componentType]!,
            elementBytes,
            views,
            label,
            signal,
          );
    decodedBytes = checkedGltfTotal(
      decodedBytes,
      byteLength + sparseBytes,
      limits.maxDecodedBytes,
      "decoded-byte-limit-exceeded",
      "Decoded glTF accessors",
    );
    accessors.push({
      byteLength,
      componentType,
      count,
      normalized: definition.normalized === true,
      record: definition,
      type,
    });
  });
  return { accessors, decodedBytes };
}
