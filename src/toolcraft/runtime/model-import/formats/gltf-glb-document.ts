import { GLB_BUFFER, type JSONDocument } from "@gltf-transform/core";

import {
  gltfDecodeCheckpoint,
  gltfDecodeFailure,
} from "./gltf-decode-safety";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;

export type ExtractedGlb = Readonly<{
  jsonBytes: Uint8Array<ArrayBuffer>;
  resources: JSONDocument["resources"];
}>;

function malformedGlb(message: string): never {
  return gltfDecodeFailure("format", "malformed-glb", message);
}

export function extractGlbDocument(
  bytes: Uint8Array<ArrayBuffer>,
  signal: AbortSignal,
): ExtractedGlb {
  if (bytes.byteLength < HEADER_BYTES + CHUNK_HEADER_BYTES) {
    return malformedGlb("The GLB is too short to contain its JSON chunk.");
  }
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    return malformedGlb("The GLB magic header is invalid.");
  }
  if (view.getUint32(4, true) !== GLB_VERSION) {
    return malformedGlb("Only GLB version 2 is supported.");
  }
  const declaredLength = view.getUint32(8, true);
  if (declaredLength !== bytes.byteLength || declaredLength % 4 !== 0) {
    return malformedGlb("The GLB declared length does not match its bytes.");
  }

  let offset = HEADER_BYTES;
  let jsonBytes: Uint8Array<ArrayBuffer> | undefined;
  let binBytes: Uint8Array<ArrayBuffer> | undefined;
  let chunkIndex = 0;
  while (offset < declaredLength) {
    gltfDecodeCheckpoint(signal, chunkIndex);
    if (offset > declaredLength - CHUNK_HEADER_BYTES) {
      return malformedGlb("A GLB chunk header exceeds the declared length.");
    }
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const contentOffset = offset + CHUNK_HEADER_BYTES;
    if (
      chunkLength === 0 ||
      chunkLength % 4 !== 0 ||
      contentOffset > declaredLength - chunkLength
    ) {
      return malformedGlb("A GLB chunk has invalid or overflowing bounds.");
    }
    const chunk = new Uint8Array(
      bytes.buffer,
      bytes.byteOffset + contentOffset,
      chunkLength,
    );
    if (chunkIndex === 0) {
      if (chunkType !== JSON_CHUNK) {
        return malformedGlb("The first GLB chunk must contain JSON.");
      }
      jsonBytes = chunk;
    } else if (chunkType === JSON_CHUNK) {
      return malformedGlb("A GLB may contain only one JSON chunk.");
    } else if (chunkType === BIN_CHUNK) {
      if (binBytes) {
        return malformedGlb("A GLB may contain only one binary chunk.");
      }
      binBytes = chunk;
    }
    offset = contentOffset + chunkLength;
    chunkIndex += 1;
  }
  if (!jsonBytes || offset !== declaredLength) {
    return malformedGlb("The GLB JSON chunk is missing or truncated.");
  }
  const resources = Object.create(null) as JSONDocument["resources"];
  if (binBytes) resources[GLB_BUFFER] = binBytes;
  return Object.freeze({ jsonBytes, resources });
}
