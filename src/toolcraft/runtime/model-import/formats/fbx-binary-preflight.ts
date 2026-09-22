import type { ToolcraftModelDecodeContext } from "../model-import-types";
import {
  checkedThreeStaticGeometryTotal,
  threeStaticGeometryFailure,
  throwIfThreeStaticGeometryAborted,
} from "./three-static-geometry-primitives";
import {
  isFbxNullRecord,
  parseFbxBinaryProperty,
  readFbxBinaryName,
  readFbxUint64,
  requireFbxBinaryRange,
  type FbxBinaryPreflightState,
} from "./fbx-binary-preflight-reader";

const FBX_BINARY_MAGIC = "Kaydara FBX Binary  \0\x1a\0";
const UNSUPPORTED_NODE_NAMES = new Set([
  "AnimationCurve",
  "AnimationCurveNode",
  "AnimationLayer",
  "AnimationStack",
  "Deformer",
  "Pose",
]);

export type FbxBinaryEmbeddedImage = Readonly<{
  bytes: Uint8Array;
  fileName: string;
  id: number;
}>;

type MutableFbxBinaryVideo = {
  bytes?: Uint8Array;
  fileName?: string;
  id?: number;
};

function readIntegerProperty(
  view: DataView,
  offset: number,
  end: number,
): number | undefined {
  requireFbxBinaryRange(offset, 1, end);
  const type = String.fromCharCode(view.getUint8(offset));
  if (type === "I") {
    requireFbxBinaryRange(offset + 1, 4, end);
    return view.getInt32(offset + 1, true);
  }
  if (type === "L") {
    requireFbxBinaryRange(offset + 1, 8, end);
    return readFbxUint64(view, offset + 1);
  }
  return undefined;
}

function readStringProperty(
  bytes: Uint8Array,
  view: DataView,
  offset: number,
  end: number,
): string | undefined {
  requireFbxBinaryRange(offset, 5, end);
  if (String.fromCharCode(view.getUint8(offset)) !== "S") return undefined;
  const length = view.getUint32(offset + 1, true);
  requireFbxBinaryRange(offset + 5, length, end);
  return readFbxBinaryName(bytes, offset + 5, length);
}

function readRawProperty(
  bytes: Uint8Array,
  view: DataView,
  offset: number,
  end: number,
): Uint8Array | undefined {
  requireFbxBinaryRange(offset, 5, end);
  if (String.fromCharCode(view.getUint8(offset)) !== "R") return undefined;
  const length = view.getUint32(offset + 1, true);
  requireFbxBinaryRange(offset + 5, length, end);
  return bytes.subarray(offset + 5, offset + 5 + length);
}

function parseNode(
  bytes: Uint8Array,
  view: DataView,
  offset: number,
  version: number,
  parentEnd: number,
  state: FbxBinaryPreflightState,
  context: ToolcraftModelDecodeContext,
  embeddedImages: MutableFbxBinaryVideo[],
  parentVideo?: MutableFbxBinaryVideo,
): number {
  throwIfThreeStaticGeometryAborted(context.signal);
  const wide = version >= 7500;
  const headerLength = wide ? 25 : 13;
  requireFbxBinaryRange(offset, headerLength, parentEnd);
  const readCount = (at: number) =>
    wide ? readFbxUint64(view, at) : view.getUint32(at, true);
  const endOffset = readCount(offset);
  const propertyCount = readCount(offset + (wide ? 8 : 4));
  const propertyBytes = readCount(offset + (wide ? 16 : 8));
  const nameLength = view.getUint8(offset + (wide ? 24 : 12));
  if (endOffset === 0) return offset + headerLength;
  if (endOffset <= offset || endOffset > parentEnd) {
    return threeStaticGeometryFailure(
      "format",
      "invalid-fbx-node-range",
      "FBX binary node offsets must stay within their parent.",
    );
  }
  const nameOffset = offset + headerLength;
  const nodeName = readFbxBinaryName(bytes, nameOffset, nameLength);
  if (UNSUPPORTED_NODE_NAMES.has(nodeName)) {
    return threeStaticGeometryFailure(
      "format",
      "unsupported-fbx-feature",
      `Geometry-only FBX import does not accept ${nodeName} nodes.`,
    );
  }
  state.nodeCount = checkedThreeStaticGeometryTotal(
    state.nodeCount,
    1,
    context.limits.maxNodes,
    "max-nodes-exceeded",
    "FBX nodes",
  );

  let cursor = nameOffset + nameLength;
  const propertyEnd = cursor + propertyBytes;
  requireFbxBinaryRange(cursor, propertyBytes, endOffset);
  const video = nodeName === "Video" ? {} : parentVideo;
  for (let index = 0; index < propertyCount; index += 1) {
    const propertyOffset = cursor;
    cursor = parseFbxBinaryProperty(
      view,
      cursor,
      propertyEnd,
      nodeName,
      state,
      context.limits,
    );
    if (video && index === 0) {
      if (nodeName === "Video") {
        video.id = readIntegerProperty(view, propertyOffset, propertyEnd);
      } else if (nodeName === "Filename" || nodeName === "RelativeFilename") {
        video.fileName = readStringProperty(
          bytes,
          view,
          propertyOffset,
          propertyEnd,
        );
      } else if (nodeName === "Content") {
        video.bytes = readRawProperty(bytes, view, propertyOffset, propertyEnd);
      }
    }
  }
  if (cursor !== propertyEnd) {
    return threeStaticGeometryFailure(
      "format",
      "invalid-fbx-property-list",
      "FBX binary property bytes do not match the declared property count.",
    );
  }
  if (nodeName === "Video" && video) embeddedImages.push(video);
  while (cursor < endOffset) {
    const nullLength = wide ? 25 : 13;
    if (
      endOffset - cursor === nullLength &&
      isFbxNullRecord(bytes, cursor, nullLength)
    ) {
      cursor = endOffset;
      break;
    }
    const next = parseNode(
      bytes,
      view,
      cursor,
      version,
      endOffset,
      state,
      context,
      embeddedImages,
      video,
    );
    if (next <= cursor) {
      return threeStaticGeometryFailure(
        "format",
        "invalid-fbx-node-progress",
        "FBX binary child traversal did not advance.",
      );
    }
    cursor = next;
  }
  return cursor;
}

export function isBinaryFbx(source: ArrayBuffer): boolean {
  if (source.byteLength < FBX_BINARY_MAGIC.length) return false;
  return readFbxBinaryName(
    new Uint8Array(source),
    0,
    FBX_BINARY_MAGIC.length,
  ) === FBX_BINARY_MAGIC;
}

export function preflightBinaryFbx(
  source: ArrayBuffer,
  context: ToolcraftModelDecodeContext,
): readonly FbxBinaryEmbeddedImage[] {
  const bytes = new Uint8Array(source);
  const view = new DataView(source);
  requireFbxBinaryRange(0, 27, bytes.byteLength);
  const version = view.getUint32(23, true);
  if (version < 6400 || version > 7700) {
    return threeStaticGeometryFailure(
      "format",
      "unsupported-fbx-version",
      `FBX binary version ${version} is outside the supported range.`,
    );
  }
  const state: FbxBinaryPreflightState = {
    arrayBytes: 0,
    nodeCount: 0,
    vertexCoordinates: 0,
  };
  const embeddedImages: MutableFbxBinaryVideo[] = [];
  let cursor = 27;
  const nullLength = version >= 7500 ? 25 : 13;
  while (cursor + nullLength <= bytes.byteLength) {
    throwIfThreeStaticGeometryAborted(context.signal);
    if (isFbxNullRecord(bytes, cursor, nullLength)) break;
    cursor = parseNode(
      bytes,
      view,
      cursor,
      version,
      bytes.byteLength,
      state,
      context,
      embeddedImages,
    );
  }
  if (state.vertexCoordinates === 0 || state.vertexCoordinates % 3 !== 0) {
    return threeStaticGeometryFailure(
      "geometry",
      "invalid-fbx-vertices",
      "FBX requires complete nonempty XYZ vertex coordinates.",
    );
  }
  checkedThreeStaticGeometryTotal(
    0,
    source.byteLength * 4 + state.arrayBytes * 8,
    context.limits.maxEstimatedWorkerBytes,
    "estimated-worker-memory-limit-exceeded",
    "FBX preflight worker memory",
  );
  const admitted: FbxBinaryEmbeddedImage[] = [];
  const ids = new Set<number>();
  for (const image of embeddedImages) {
    const { bytes: imageBytes, fileName, id } = image;
    if (!imageBytes || imageBytes.byteLength === 0) continue;
    if (
      typeof id !== "number" || !Number.isSafeInteger(id) || id < 0 ||
      !fileName || ids.has(id)
    ) {
      return threeStaticGeometryFailure(
        "format",
        "invalid-fbx-embedded-image",
        "Embedded FBX images require unique non-negative ids and filenames.",
      );
    }
    ids.add(id);
    admitted.push({ bytes: imageBytes, fileName, id });
  }
  admitted.sort((left, right) => left.id - right.id);
  return Object.freeze(admitted.map((image) => Object.freeze(image)));
}
