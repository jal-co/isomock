import type { ToolcraftModelDecodeContext } from "../model-import-types";
import {
  checkedThreeStaticGeometryTotal,
  threeStaticGeometryFailure,
} from "./three-static-geometry-primitives";

const ARRAY_ELEMENT_BYTES = Object.freeze({
  b: 1,
  c: 1,
  d: 8,
  f: 4,
  i: 4,
  l: 8,
} as const);

export type FbxBinaryPreflightState = {
  arrayBytes: number;
  nodeCount: number;
  vertexCoordinates: number;
};

export function readFbxUint64(view: DataView, offset: number): number {
  const low = view.getUint32(offset, true);
  const high = view.getUint32(offset + 4, true);
  const value = high * 0x1_0000_0000 + low;
  if (!Number.isSafeInteger(value)) {
    return threeStaticGeometryFailure(
      "format",
      "unsafe-fbx-integer",
      "FBX binary offsets and counts must be safe integers.",
    );
  }
  return value;
}

export function requireFbxBinaryRange(
  offset: number,
  length: number,
  end: number,
  code = "malformed-binary-fbx",
): void {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset > end - length
  ) {
    return threeStaticGeometryFailure(
      "format",
      code,
      "FBX binary data contains an invalid or truncated range.",
    );
  }
}

export function readFbxBinaryName(
  bytes: Uint8Array,
  offset: number,
  length: number,
): string {
  requireFbxBinaryRange(offset, length, bytes.byteLength);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(offset, offset + length),
    );
  } catch {
    return threeStaticGeometryFailure(
      "format",
      "invalid-fbx-node-name",
      "FBX binary node names must use valid UTF-8.",
    );
  }
}

function scalarByteLength(type: string): number | undefined {
  if (type === "C") return 1;
  if (type === "Y") return 2;
  if (type === "F" || type === "I") return 4;
  if (type === "D" || type === "L") return 8;
  return undefined;
}

export function parseFbxBinaryProperty(
  view: DataView,
  offset: number,
  end: number,
  nodeName: string,
  state: FbxBinaryPreflightState,
  limits: ToolcraftModelDecodeContext["limits"],
): number {
  requireFbxBinaryRange(offset, 1, end);
  const type = String.fromCharCode(view.getUint8(offset));
  const scalarBytes = scalarByteLength(type);
  if (scalarBytes !== undefined) {
    requireFbxBinaryRange(offset + 1, scalarBytes, end);
    return offset + 1 + scalarBytes;
  }
  if (type === "R" || type === "S") {
    requireFbxBinaryRange(offset + 1, 4, end);
    const length = view.getUint32(offset + 1, true);
    requireFbxBinaryRange(offset + 5, length, end);
    return offset + 5 + length;
  }
  if (!(type in ARRAY_ELEMENT_BYTES)) {
    return threeStaticGeometryFailure(
      "format",
      "unsupported-fbx-property",
      `FBX binary property type ${JSON.stringify(type)} is unsupported.`,
    );
  }

  requireFbxBinaryRange(offset + 1, 12, end);
  const arrayLength = view.getUint32(offset + 1, true);
  const encoding = view.getUint32(offset + 5, true);
  const storedLength = view.getUint32(offset + 9, true);
  const decodedBytes = arrayLength * ARRAY_ELEMENT_BYTES[
    type as keyof typeof ARRAY_ELEMENT_BYTES
  ];
  if (!Number.isSafeInteger(decodedBytes)) {
    return threeStaticGeometryFailure(
      "resource-limit",
      "decoded-byte-limit-exceeded",
      "FBX binary array size exceeds the protected integer range.",
    );
  }
  state.arrayBytes = checkedThreeStaticGeometryTotal(
    state.arrayBytes,
    decodedBytes,
    limits.maxDecodedBytes,
    "decoded-byte-limit-exceeded",
    "FBX decoded array bytes",
  );
  if (nodeName === "Vertices") {
    if (type !== "d" && type !== "f") {
      return threeStaticGeometryFailure(
        "geometry",
        "invalid-fbx-vertices",
        "FBX vertex coordinates must use a floating-point array.",
      );
    }
    state.vertexCoordinates = checkedThreeStaticGeometryTotal(
      state.vertexCoordinates,
      arrayLength,
      limits.maxVertices * 3,
      "max-vertices-exceeded",
      "FBX source vertex coordinates",
    );
  }
  if (encoding !== 0 && encoding !== 1) {
    return threeStaticGeometryFailure(
      "format",
      "unsupported-fbx-array-encoding",
      "FBX binary arrays must be uncompressed or zlib-compressed.",
    );
  }
  const payloadLength = encoding === 0 ? decodedBytes : storedLength;
  if (encoding === 0 && storedLength !== decodedBytes) {
    return threeStaticGeometryFailure(
      "format",
      "invalid-fbx-array-length",
      "FBX uncompressed array length does not match its declared values.",
    );
  }
  requireFbxBinaryRange(offset + 13, payloadLength, end);
  return offset + 13 + payloadLength;
}

export function isFbxNullRecord(
  bytes: Uint8Array,
  offset: number,
  length: number,
): boolean {
  requireFbxBinaryRange(offset, length, bytes.byteLength);
  for (let index = offset; index < offset + length; index += 1) {
    if (bytes[index] !== 0) return false;
  }
  return true;
}
