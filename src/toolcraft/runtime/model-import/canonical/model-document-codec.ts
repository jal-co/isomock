import type { ToolcraftModelImportLimits } from "../../schema/types";
import type { ToolcraftModelDocument } from "./model-document";
import { throwModelDocumentCodecError } from "./model-document-codec-error";
import {
  decodeModelDocumentEnvelope,
  encodeModelDocumentEnvelope,
} from "./model-document-codec-envelope";
import { getModelDocumentCodecFormat } from "./model-document-codec-format";
import {
  createModelDocumentMetadata,
  decodeModelDocumentMetadata,
  encodeModelDocumentMetadata,
} from "./model-document-codec-metadata";
import {
  decodeModelDocumentPayloads,
  encodeModelDocumentPayloads,
} from "./model-document-codec-payload";
import {
  isToolcraftCanonicalModelLimitError,
  resolveToolcraftCanonicalModelLimits,
  type ToolcraftCanonicalModelLimits,
} from "./model-document-limits";
import {
  assertValidToolcraftModelDocument,
  getValidatedToolcraftModelDocumentSnapshot,
  ToolcraftModelDocumentValidationError,
} from "./model-document-validation";
import {
  assertCanonicalWorkerMemoryFloor,
  assertToolcraftModelEncodeWorkerMemory,
} from "./model-document-worker-memory";

export type { ToolcraftModelDocumentCodecFailureCode } from "./model-document-codec-error";
export { ToolcraftModelDocumentCodecError } from "./model-document-codec-error";

function resolveCodecLimits(
  requestedLimits: Partial<ToolcraftModelImportLimits> | undefined,
): ToolcraftCanonicalModelLimits {
  try {
    return resolveToolcraftCanonicalModelLimits(requestedLimits);
  } catch (error) {
    if (isToolcraftCanonicalModelLimitError(error)) {
      throwModelDocumentCodecError(
        "invalid-limit-options",
        error.path,
        error.message,
      );
    }
    throwModelDocumentCodecError(
      "invalid-limit-options",
      "limits",
      "Canonical model limit options could not be resolved safely.",
    );
  }
}

function getValidatedCodecSnapshot(
  document: ToolcraftModelDocument,
  limits: ToolcraftCanonicalModelLimits,
): ToolcraftModelDocument {
  try {
    return getValidatedToolcraftModelDocumentSnapshot(document, limits);
  } catch (error) {
    if (
      error instanceof ToolcraftModelDocumentValidationError &&
      error.code === "estimated-worker-memory-limit-exceeded"
    ) {
      throwModelDocumentCodecError(
        "estimated-worker-memory-limit-exceeded",
        "workerMemory.encode",
        error.message,
      );
    }
    throw error;
  }
}

function assertEncodedSizeWithinLimit(
  document: ToolcraftModelDocument,
  metadataByteLength: number,
  maxDecodedBytes: number,
): void {
  const format = getModelDocumentCodecFormat(document.version);
  let byteLength = format.payloadOffset + metadataByteLength;

  for (const primitive of document.primitives) {
    byteLength +=
      (primitive.positions.length +
        (primitive.normals?.length ?? 0) +
        primitive.indices.length) *
      4;
  }
  if (document.version === 2) {
    for (const primitive of document.primitives) {
      byteLength +=
        ((primitive.colors?.values.length ?? 0) +
          (primitive.textureCoordinates ?? []).reduce(
            (total, coordinates) => total + coordinates.values.length,
            0,
          )) *
        4;
    }
  }

  if (!Number.isSafeInteger(byteLength) || byteLength > maxDecodedBytes) {
    throwModelDocumentCodecError(
      "encoded-size-limit-exceeded",
      "envelope",
      `Canonical envelope exceeds maxDecodedBytes ${maxDecodedBytes}.`,
    );
  }
}

export function encodeToolcraftModelDocument(
  document: ToolcraftModelDocument,
  requestedLimits?: Partial<ToolcraftModelImportLimits>,
): Uint8Array {
  const limits = resolveCodecLimits(requestedLimits);
  assertCanonicalWorkerMemoryFloor("encode", limits);
  const snapshot = getValidatedCodecSnapshot(document, limits);
  assertToolcraftModelEncodeWorkerMemory(snapshot, limits);
  const metadata = createModelDocumentMetadata(snapshot);
  const metadataBytes = encodeModelDocumentMetadata(metadata);
  assertEncodedSizeWithinLimit(
    snapshot,
    metadataBytes.byteLength,
    limits.maxDecodedBytes,
  );
  const envelope = encodeModelDocumentPayloads(snapshot, metadataBytes);
  return encodeModelDocumentEnvelope(envelope, limits);
}

export function decodeToolcraftModelDocument(
  bytes: Uint8Array,
  requestedLimits?: Partial<ToolcraftModelImportLimits>,
): ToolcraftModelDocument {
  const limits = resolveCodecLimits(requestedLimits);
  const envelope = decodeModelDocumentEnvelope(bytes, limits);
  const appearanceByteLengths = envelope.codecVersion === 2
    ? {
        colors: envelope.sections[6].byteLength,
        textureCoordinates: envelope.sections[5].byteLength,
      }
    : { colors: 0, textureCoordinates: 0 };
  const { sections } = envelope;
  const metadata = decodeModelDocumentMetadata(
    sections[1],
    {
      colors: appearanceByteLengths.colors,
      indices: sections[4].byteLength,
      normals: sections[3].byteLength,
      positions: sections[2].byteLength,
      textureCoordinates: appearanceByteLengths.textureCoordinates,
    },
    limits,
    envelope.codecVersion,
  );
  const document = decodeModelDocumentPayloads(metadata, envelope);
  assertValidToolcraftModelDocument(document, limits);
  return document;
}
