import type { ToolcraftModelDocument } from "./model-document";
import type { ToolcraftCanonicalModelLimits } from "./model-document-limits";
import { throwModelDocumentCodecError } from "./model-document-codec-error";
import {
  MODEL_DOCUMENT_CODEC_V2,
  getModelDocumentCodecFormat,
} from "./model-document-codec-format";

const WORKER_FIXED_OVERHEAD_BYTES = 16n * 1024n;
const ENCODE_METADATA_PEAK_FACTOR = 42n;
const DECODE_METADATA_UTF_COPIES = 4n;
const DECODE_METADATA_OBJECT_COPIES = 36n;

export type ToolcraftCanonicalEncodeWorkerMemoryShape = Readonly<{
  childReferenceCount: number;
  maximumNodeId: string;
  maximumNodeName: string;
  maximumPrimitiveId: string;
  nodeCount: number;
  nodePrimitiveReferenceCount: number;
  payloadByteLength: number;
  primitiveCount: number;
  provenance: ToolcraftModelDocument["provenance"];
  rootNodeCount: number;
}>;

function workerLimit(limits: ToolcraftCanonicalModelLimits): bigint {
  return BigInt(Math.floor(limits.maxEstimatedWorkerBytes));
}

function assertWithinWorkerLimit(
  estimatedBytes: bigint,
  operation: "decode" | "encode",
  limits: ToolcraftCanonicalModelLimits,
): void {
  if (estimatedBytes <= workerLimit(limits)) {
    return;
  }

  throwModelDocumentCodecError(
    "estimated-worker-memory-limit-exceeded",
    `workerMemory.${operation}`,
    `Canonical ${operation} requires an estimated ${estimatedBytes.toString()} worker bytes, exceeding maxEstimatedWorkerBytes ${limits.maxEstimatedWorkerBytes}.`,
  );
}

export function assertCanonicalWorkerMemoryFloor(
  operation: "decode" | "encode",
  limits: ToolcraftCanonicalModelLimits,
): void {
  assertWithinWorkerLimit(WORKER_FIXED_OVERHEAD_BYTES, operation, limits);
}

export function assertToolcraftModelDecodeInputWorkerMemory(
  envelopeByteLength: number,
  limits: ToolcraftCanonicalModelLimits,
): void {
  assertWithinWorkerLimit(
    WORKER_FIXED_OVERHEAD_BYTES + BigInt(envelopeByteLength) * 2n,
    "decode",
    limits,
  );
}

export function exceedsOwnedEncodeGeometryWorkerMemory(
  payloadByteLength: number,
  limits: ToolcraftCanonicalModelLimits,
): boolean {
  return (
    WORKER_FIXED_OVERHEAD_BYTES + BigInt(payloadByteLength) * 4n >
    workerLimit(limits)
  );
}

function jsonStringByteUpperBound(value: string): bigint {
  let bytes = 2n;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit === 0x22 || codeUnit === 0x5c) {
      bytes += 2n;
    } else if (codeUnit <= 0x1f) {
      bytes += 6n;
    } else if (codeUnit <= 0x7f) {
      bytes += 1n;
    } else if (codeUnit <= 0x7ff) {
      bytes += 2n;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4n;
        index += 1;
      } else {
        bytes += 6n;
      }
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      bytes += 6n;
    } else {
      bytes += 3n;
    }
  }
  return bytes;
}

function stringStorageBytes(value: string): bigint {
  return 32n + jsonStringByteUpperBound(value);
}

function arrayStorageBytes(length: number): bigint {
  return 64n + BigInt(length) * 16n;
}

function boundsStorageBytes(): bigint {
  return 256n + arrayStorageBytes(3) * 2n + 6n * 32n;
}

function estimateProvenanceStorageBytes(
  provenance: ToolcraftModelDocument["provenance"],
): bigint {
  let bytes = 1024n;
  bytes += stringStorageBytes(provenance.adapterVersion);
  bytes += stringStorageBytes(provenance.sourceFormat);
  bytes += arrayStorageBytes(provenance.operations.length);
  for (const operation of provenance.operations) {
    bytes += stringStorageBytes(operation);
  }

  if (provenance.repair !== undefined) {
    bytes += 1024n;
    bytes += stringStorageBytes(provenance.repair.algorithmVersion);
    bytes += stringStorageBytes(provenance.repair.planDigest);
    bytes += stringStorageBytes(provenance.repair.recipeId);
    bytes += arrayStorageBytes(provenance.repair.operations.length);
    for (const operation of provenance.repair.operations) {
      bytes += stringStorageBytes(operation);
    }
  }

  return bytes;
}

function estimateAppearanceMetadataStorageBytes(
  document: ToolcraftModelDocument,
): bigint {
  if (document.version === 1) return 0n;

  let bytes = arrayStorageBytes(document.materials.length);
  bytes += arrayStorageBytes(document.textures.length);

  for (const texture of document.textures) {
    bytes += 1024n;
    bytes += stringStorageBytes(texture.id);
    bytes += stringStorageBytes(texture.mimeType);
    bytes += stringStorageBytes(texture.colorSpace);
    bytes += stringStorageBytes(texture.contentDigest);
    bytes += stringStorageBytes(texture.resourceRef);
    bytes += 512n;
  }

  for (const material of document.materials) {
    bytes += 2048n + stringStorageBytes(material.id);
    bytes += arrayStorageBytes(material.baseColor.length);
    bytes += arrayStorageBytes(material.emissive.length);
    for (const slot of [
      material.baseColorTexture,
      material.emissiveTexture,
      material.metallicRoughnessTexture,
      material.normalTexture,
      material.occlusionTexture,
    ]) {
      if (slot !== undefined) {
        bytes += 512n + stringStorageBytes(slot.textureId);
      }
    }
  }

  for (const primitive of document.primitives) {
    if (primitive.materialId !== undefined) {
      bytes += stringStorageBytes(primitive.materialId);
    }
    if (primitive.colors !== undefined) {
      bytes += 256n;
    }
    if (primitive.textureCoordinates !== undefined) {
      bytes += arrayStorageBytes(primitive.textureCoordinates.length);
      bytes += BigInt(primitive.textureCoordinates.length) * 256n;
    }
  }

  return bytes;
}

function estimateMetadataStorageBytes(document: ToolcraftModelDocument): bigint {
  let bytes = 4n * 1024n + boundsStorageBytes();
  bytes += arrayStorageBytes(document.nodes.length);
  bytes += arrayStorageBytes(document.primitives.length);
  bytes += arrayStorageBytes(document.rootNodeIds.length);

  for (const rootNodeId of document.rootNodeIds) {
    bytes += stringStorageBytes(rootNodeId);
  }

  for (const node of document.nodes) {
    bytes += 512n + stringStorageBytes(node.id) + stringStorageBytes(node.name);
    bytes += arrayStorageBytes(node.children.length);
    bytes += arrayStorageBytes(node.primitiveIds.length);
    bytes += arrayStorageBytes(node.localMatrix.length) + 16n * 32n;
    for (const child of node.children) {
      bytes += stringStorageBytes(child);
    }
    for (const primitiveId of node.primitiveIds) {
      bytes += stringStorageBytes(primitiveId);
    }
  }

  for (const primitive of document.primitives) {
    bytes += 1024n + boundsStorageBytes() + stringStorageBytes(primitive.id);
  }

  bytes += estimateProvenanceStorageBytes(document.provenance);
  bytes += estimateAppearanceMetadataStorageBytes(document);

  return bytes;
}

function boundedCount(value: number): bigint {
  return Number.isSafeInteger(value) && value >= 0
    ? BigInt(value)
    : BigInt(Number.MAX_SAFE_INTEGER);
}

function arrayStorageBytesForCount(length: bigint): bigint {
  return 64n + length * 16n;
}

function estimateMetadataStorageBytesForShape(
  shape: ToolcraftCanonicalEncodeWorkerMemoryShape,
): bigint {
  const childReferenceCount = boundedCount(shape.childReferenceCount);
  const nodeCount = boundedCount(shape.nodeCount);
  const nodePrimitiveReferenceCount = boundedCount(
    shape.nodePrimitiveReferenceCount,
  );
  const primitiveCount = boundedCount(shape.primitiveCount);
  const rootNodeCount = boundedCount(shape.rootNodeCount);
  const nodeIdBytes = stringStorageBytes(shape.maximumNodeId);
  const nodeNameBytes = stringStorageBytes(shape.maximumNodeName);
  const primitiveIdBytes = stringStorageBytes(shape.maximumPrimitiveId);

  let bytes = 4n * 1024n + boundsStorageBytes();
  bytes += arrayStorageBytesForCount(nodeCount);
  bytes += arrayStorageBytesForCount(primitiveCount);
  bytes += arrayStorageBytesForCount(rootNodeCount);
  bytes += rootNodeCount * nodeIdBytes;

  const nodeBaseBytes =
    512n +
    nodeIdBytes +
    nodeNameBytes +
    arrayStorageBytes(0) * 2n +
    arrayStorageBytes(16) +
    16n * 32n;
  bytes += nodeCount * nodeBaseBytes;
  bytes += childReferenceCount * (16n + nodeIdBytes);
  bytes += nodePrimitiveReferenceCount * (16n + primitiveIdBytes);
  bytes += primitiveCount * (1024n + boundsStorageBytes() + primitiveIdBytes);
  bytes += estimateProvenanceStorageBytes(shape.provenance);
  return bytes;
}

function payloadByteLength(document: ToolcraftModelDocument): bigint {
  let bytes = 0n;
  for (const primitive of document.primitives) {
    bytes += BigInt(primitive.positions.byteLength);
    bytes += BigInt(primitive.normals?.byteLength ?? 0);
    bytes += BigInt(primitive.indices.byteLength);
  }
  if (document.version === 2) {
    for (const primitive of document.primitives) {
      bytes += BigInt(primitive.colors?.values.byteLength ?? 0);
      for (const coordinates of primitive.textureCoordinates ?? []) {
        bytes += BigInt(coordinates.values.byteLength);
      }
    }
  }
  return bytes;
}

function estimateEncodeWorkerBytes(
  payloadBytes: bigint,
  metadataBytes: bigint,
  payloadOffset: number,
): bigint {
  const outputEnvelopeBytes =
    BigInt(payloadOffset) + metadataBytes + payloadBytes;

  return (
    WORKER_FIXED_OVERHEAD_BYTES +
    payloadBytes * 3n +
    outputEnvelopeBytes +
    metadataBytes * ENCODE_METADATA_PEAK_FACTOR
  );
}

function safeNumber(value: bigint): number {
  return value > BigInt(Number.MAX_SAFE_INTEGER)
    ? Number.MAX_SAFE_INTEGER
    : Number(value);
}

export function estimateToolcraftModelEncodeWorkerBytes(
  document: ToolcraftModelDocument,
): number {
  return safeNumber(
    estimateEncodeWorkerBytes(
      payloadByteLength(document),
      estimateMetadataStorageBytes(document),
      getModelDocumentCodecFormat(document.version).payloadOffset,
    ),
  );
}

export function estimateToolcraftCanonicalEncodeWorkerBytesForShape(
  shape: ToolcraftCanonicalEncodeWorkerMemoryShape,
): number {
  return safeNumber(
    estimateEncodeWorkerBytes(
      boundedCount(shape.payloadByteLength),
      estimateMetadataStorageBytesForShape(shape),
      MODEL_DOCUMENT_CODEC_V2.payloadOffset,
    ),
  );
}

export function assertToolcraftModelEncodeWorkerMemory(
  document: ToolcraftModelDocument,
  limits: ToolcraftCanonicalModelLimits,
): void {
  // Source geometry, owned snapshot, encoded sections, and final envelope
  // coexist. Metadata covers both graphs, JSON, UTF-8, and traversal arrays.
  const estimatedBytes = estimateEncodeWorkerBytes(
    payloadByteLength(document),
    estimateMetadataStorageBytes(document),
    getModelDocumentCodecFormat(document.version).payloadOffset,
  );
  assertWithinWorkerLimit(estimatedBytes, "encode", limits);
}

export function assertToolcraftModelDecodeWorkerMemory(
  envelopeByteLength: number,
  metadataByteLength: number,
  payloadByteLength: number,
  limits: ToolcraftCanonicalModelLimits,
): void {
  const metadataBytes = BigInt(metadataByteLength);
  const estimatedBytes =
    WORKER_FIXED_OVERHEAD_BYTES +
    BigInt(envelopeByteLength) * 2n +
    BigInt(payloadByteLength) * 2n +
    metadataBytes * DECODE_METADATA_UTF_COPIES +
    metadataBytes * DECODE_METADATA_OBJECT_COPIES;

  // Both caller and owned envelope copies coexist. Metadata factors cover
  // decoded strings, JSON's graph, the canonical clone, and validation copy.
  assertWithinWorkerLimit(estimatedBytes, "decode", limits);
}
