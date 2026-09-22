import {
  BufferUtils,
  GLB_BUFFER,
  type GLTF,
  type JSONDocument,
} from "@gltf-transform/core";

import type { ToolcraftModelImportLimits } from "../../schema/types";
import { inspectBufferDataUri } from "../model-source-data-uri";
import {
  checkedGltfScale,
  checkedGltfTotal,
  gltfDecodeCheckpoint,
  gltfDecodeFailure,
} from "./gltf-decode-safety";
import {
  assertGltfByteRange,
  type GltfBufferViewInfo,
  type GltfJsonRecord,
  gltfJsonArray,
  gltfJsonIndexed,
  gltfJsonInteger,
  gltfJsonOptionalInteger,
  gltfJsonRecord,
} from "./gltf-json-inspection";

export type GltfBufferPreflight = Readonly<{
  bufferViews: GltfBufferViewInfo[];
  embeddedBytes: number;
  meshoptBytes: number;
}>;

type GltfBufferInfo = Readonly<{
  byteLength: number;
  readBytes: () => Uint8Array;
}>;

function dataUriReader(uri: string, expectedByteLength: number): () => Uint8Array {
  let bytes: Uint8Array | undefined;
  return () => {
    bytes ??= BufferUtils.createBufferFromDataURI(uri);
    if (bytes.byteLength !== expectedByteLength) {
      return gltfDecodeFailure(
        "format",
        "invalid-buffer-data-uri",
        "An embedded glTF buffer did not match its preflighted byte length.",
      );
    }
    return bytes;
  };
}

function inspectBuffers(
  json: GLTF.IGLTF,
  resources: JSONDocument["resources"],
  limits: ToolcraftModelImportLimits,
  signal: AbortSignal,
): { buffers: GltfBufferInfo[]; embeddedBytes: number } {
  const definitions = gltfJsonArray(
    json.buffers,
    "invalid-gltf-buffers",
    "glTF buffers",
  );
  if (definitions.length === 0) {
    return gltfDecodeFailure(
      "geometry",
      "no-renderable-static-geometry",
      "glTF geometry requires at least one buffer.",
    );
  }
  const buffers: GltfBufferInfo[] = [];
  let embeddedBytes = 0;
  definitions.forEach((value, index) => {
    gltfDecodeCheckpoint(signal, index);
    const definition = gltfJsonRecord(
      value,
      "invalid-gltf-buffer",
      `buffer ${index}`,
    );
    const declared = gltfJsonInteger(
      definition.byteLength,
      "invalid-gltf-buffer",
      `buffer ${index}.byteLength`,
      1,
    );
    const uri = definition.uri;
    let actual: number;
    let readBytes: () => Uint8Array;
    if (uri === undefined) {
      const resource = resources[GLB_BUFFER];
      actual = resource?.byteLength ?? 0;
      readBytes = () => resource!;
    } else if (typeof uri === "string") {
      const dataBytes = inspectBufferDataUri(uri, limits.maxDecodedBytes);
      if (dataBytes === undefined) {
        const resource = resources[uri];
        actual = resource?.byteLength ?? 0;
        readBytes = () => resource!;
      } else {
        actual = dataBytes;
        readBytes = dataUriReader(uri, dataBytes);
        embeddedBytes = checkedGltfTotal(
          embeddedBytes,
          dataBytes,
          limits.maxDecodedBytes,
          "decoded-byte-limit-exceeded",
          "Embedded glTF buffers",
        );
      }
    } else {
      return gltfDecodeFailure(
        "format",
        "invalid-gltf-buffer",
        `buffer ${index}.uri must be a string when provided.`,
      );
    }
    if (actual < declared) {
      return gltfDecodeFailure(
        "format",
        "buffer-byte-length-mismatch",
        `buffer ${index} is shorter than its declared byteLength.`,
      );
    }
    buffers.push({ byteLength: declared, readBytes });
  });
  return { buffers, embeddedBytes };
}

function inspectMeshoptExtension(
  extensionValue: unknown,
  destinationLength: number,
  buffers: readonly GltfBufferInfo[],
): number {
  const extension = gltfJsonRecord(
    extensionValue,
    "invalid-meshopt-extension",
    "EXT_meshopt_compression",
  );
  const sourceBuffer = gltfJsonIndexed(
    buffers,
    extension.buffer,
    "invalid-meshopt-extension",
    "Meshopt buffer",
  );
  const sourceOffset = gltfJsonOptionalInteger(
    extension.byteOffset,
    "invalid-meshopt-extension",
    "Meshopt byteOffset",
  );
  const sourceLength = gltfJsonInteger(
    extension.byteLength,
    "invalid-meshopt-extension",
    "Meshopt byteLength",
    1,
  );
  assertGltfByteRange(
    sourceOffset,
    sourceLength,
    sourceBuffer.byteLength,
    "invalid-meshopt-extension",
    "Meshopt compressed range",
  );
  const count = gltfJsonInteger(
    extension.count,
    "invalid-meshopt-extension",
    "Meshopt count",
    1,
  );
  const stride = gltfJsonInteger(
    extension.byteStride,
    "invalid-meshopt-extension",
    "Meshopt byteStride",
    1,
  );
  if (stride > 256) {
    return gltfDecodeFailure(
      "format",
      "invalid-meshopt-extension",
      "Meshopt byteStride exceeds 256 bytes.",
    );
  }
  if (
    !["ATTRIBUTES", "TRIANGLES", "INDICES"].includes(
      String(extension.mode),
    )
  ) {
    return gltfDecodeFailure(
      "format",
      "invalid-meshopt-extension",
      "Meshopt mode is not supported by EXT_meshopt_compression.",
    );
  }
  const expanded = checkedGltfScale(
    count,
    stride,
    "decoded-byte-limit-exceeded",
  );
  if (expanded !== destinationLength) {
    return gltfDecodeFailure(
      "format",
      "invalid-meshopt-extension",
      "Meshopt expansion must match its destination bufferView.",
    );
  }
  return expanded;
}

function inspectBufferViews(
  json: GLTF.IGLTF,
  buffers: readonly GltfBufferInfo[],
  limits: ToolcraftModelImportLimits,
  signal: AbortSignal,
): { meshoptBytes: number; views: GltfBufferViewInfo[] } {
  const definitions = gltfJsonArray(
    json.bufferViews,
    "invalid-buffer-views",
    "glTF bufferViews",
  );
  const views: GltfBufferViewInfo[] = [];
  let meshoptBytes = 0;
  definitions.forEach((value, index) => {
    gltfDecodeCheckpoint(signal, index);
    const definition = gltfJsonRecord(
      value,
      "invalid-buffer-view",
      `bufferView ${index}`,
    );
    const buffer = gltfJsonIndexed(
      buffers,
      definition.buffer,
      "invalid-buffer-view",
      `bufferView ${index}.buffer`,
    );
    const byteOffset = gltfJsonOptionalInteger(
      definition.byteOffset,
      "invalid-buffer-view",
      `bufferView ${index}.byteOffset`,
    );
    const byteLength = gltfJsonInteger(
      definition.byteLength,
      "invalid-buffer-view",
      `bufferView ${index}.byteLength`,
      1,
    );
    assertGltfByteRange(
      byteOffset,
      byteLength,
      buffer.byteLength,
      "invalid-buffer-view",
      `bufferView ${index}`,
    );
    const byteStride =
      definition.byteStride === undefined
        ? undefined
        : gltfJsonInteger(
            definition.byteStride,
            "invalid-buffer-view",
            `bufferView ${index}.byteStride`,
            4,
          );
    if (byteStride !== undefined && (byteStride > 252 || byteStride % 4 !== 0)) {
      return gltfDecodeFailure(
        "format",
        "invalid-buffer-view",
        `bufferView ${index}.byteStride is invalid.`,
      );
    }
    const extensions = definition.extensions;
    const meshopt =
      typeof extensions === "object" && extensions !== null
        ? (extensions as GltfJsonRecord).EXT_meshopt_compression
        : undefined;
    views.push({
      byteLength,
      byteOffset,
      ...(byteStride ? { byteStride } : {}),
      meshoptCompressed: meshopt !== undefined,
      readBytes: () =>
        buffer.readBytes().subarray(byteOffset, byteOffset + byteLength),
    });
    if (meshopt !== undefined) {
      meshoptBytes = checkedGltfTotal(
        meshoptBytes,
        inspectMeshoptExtension(meshopt, byteLength, buffers),
        limits.maxDecodedBytes,
        "decoded-byte-limit-exceeded",
        "Meshopt expansion",
      );
    }
  });
  return { meshoptBytes, views };
}

export function preflightGltfBuffers(
  json: GLTF.IGLTF,
  resources: JSONDocument["resources"],
  retainedWorkerBytes: number,
  limits: ToolcraftModelImportLimits,
  signal: AbortSignal,
): GltfBufferPreflight {
  const buffers = inspectBuffers(json, resources, limits, signal);
  checkedGltfTotal(
    retainedWorkerBytes,
    buffers.embeddedBytes,
    limits.maxEstimatedWorkerBytes,
    "estimated-worker-memory-limit-exceeded",
    "Embedded glTF buffer memory",
  );
  const bufferViews = inspectBufferViews(
    json,
    buffers.buffers,
    limits,
    signal,
  );
  return {
    bufferViews: bufferViews.views,
    embeddedBytes: buffers.embeddedBytes,
    meshoptBytes: bufferViews.meshoptBytes,
  };
}
