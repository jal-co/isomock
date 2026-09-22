import type { ToolcraftCanonicalModelLimits } from "./model-document-limits";
import {
  MODEL_DOCUMENT_CODEC_DESCRIPTOR_BYTES,
  MODEL_DOCUMENT_CODEC_HEADER_BYTES,
  MODEL_DOCUMENT_CODEC_MAGIC,
  MODEL_DOCUMENT_CODEC_V1,
  MODEL_DOCUMENT_CODEC_V2,
  getModelDocumentCodecFormat,
  modelDocumentDescriptorOffset,
  type ModelDocumentEnvelope,
  type ModelDocumentCodecFormat,
  type ModelDocumentSectionKind,
} from "./model-document-codec-format";
import { throwModelDocumentCodecError } from "./model-document-codec-error";
import {
  copyCanonicalTypedArray,
  inspectCanonicalTypedArray,
} from "./model-document-safe-typed-array";
import {
  assertToolcraftModelDecodeInputWorkerMemory,
  assertToolcraftModelDecodeWorkerMemory,
} from "./model-document-worker-memory";

const maximumSafeSectionLength = BigInt(Number.MAX_SAFE_INTEGER);

function snapshotDecodeInput(
  value: unknown,
  limits: ToolcraftCanonicalModelLimits,
): Uint8Array {
  const inspection = inspectCanonicalTypedArray(value, "Uint8Array");
  if (inspection === null || inspection.shared) {
    throwModelDocumentCodecError(
      "invalid-input",
      "bytes",
      "Canonical model document bytes must be an owned Uint8Array input.",
    );
  }
  if (inspection.length > limits.maxDecodedBytes) {
    throwModelDocumentCodecError(
      "encoded-size-limit-exceeded",
      "envelope",
      `Canonical envelope exceeds maxDecodedBytes ${limits.maxDecodedBytes}.`,
    );
  }

  assertToolcraftModelDecodeInputWorkerMemory(inspection.length, limits);
  try {
    return copyCanonicalTypedArray(inspection);
  } catch {
    throwModelDocumentCodecError(
      "invalid-input",
      "bytes",
      "Canonical model document bytes could not be snapshotted safely.",
    );
  }
}

function validateMagic(bytes: Uint8Array): void {
  for (let index = 0; index < MODEL_DOCUMENT_CODEC_MAGIC.length; index += 1) {
    if (bytes[index] !== MODEL_DOCUMENT_CODEC_MAGIC[index]) {
      throwModelDocumentCodecError(
        "bad-magic",
        `bytes[${index}]`,
        "Canonical model document magic does not match.",
      );
    }
  }
}

function encodeEnvelopeSections<SectionKind extends ModelDocumentSectionKind>(
  sections: Readonly<Record<SectionKind, Uint8Array>>,
  format: ModelDocumentCodecFormat<readonly SectionKind[]>,
  limits: ToolcraftCanonicalModelLimits,
): Uint8Array {
  let totalBytes = format.payloadOffset;

  for (const kind of format.sectionKinds) {
    const sectionLength = sections[kind].byteLength;
    if (!Number.isSafeInteger(sectionLength)) {
      throwModelDocumentCodecError(
        "unsafe-section-length",
        `sections.${kind}`,
        `Section ${kind} exceeds safe integer size.`,
      );
    }

    totalBytes += sectionLength;
    if (!Number.isSafeInteger(totalBytes)) {
      throwModelDocumentCodecError(
        "unsafe-section-length",
        `sections.${kind}`,
        "Canonical envelope size exceeds safe integer size.",
      );
    }
  }

  if (totalBytes > limits.maxDecodedBytes) {
    throwModelDocumentCodecError(
      "encoded-size-limit-exceeded",
      "envelope",
      `Canonical envelope exceeds maxDecodedBytes ${limits.maxDecodedBytes}.`,
    );
  }

  const encoded = new Uint8Array(totalBytes);
  encoded.set(MODEL_DOCUMENT_CODEC_MAGIC, 0);
  const view = new DataView(encoded.buffer);
  view.setUint16(8, format.version, true);
  view.setUint16(10, format.sectionKinds.length, true);
  view.setUint32(12, format.payloadOffset, true);

  let payloadOffset = format.payloadOffset;
  for (let index = 0; index < format.sectionKinds.length; index += 1) {
    const kind = format.sectionKinds[index]!;
    const section = sections[kind];
    const descriptorOffset = modelDocumentDescriptorOffset(index);
    view.setUint32(descriptorOffset, kind, true);
    view.setUint32(descriptorOffset + 4, 0, true);
    view.setBigUint64(
      descriptorOffset + 8,
      BigInt(section.byteLength),
      true,
    );
    encoded.set(section, payloadOffset);
    payloadOffset += section.byteLength;
  }

  return encoded;
}

export function encodeModelDocumentEnvelope(
  envelope: ModelDocumentEnvelope,
  limits: ToolcraftCanonicalModelLimits,
): Uint8Array {
  return envelope.codecVersion === 1
    ? encodeEnvelopeSections(envelope.sections, MODEL_DOCUMENT_CODEC_V1, limits)
    : encodeEnvelopeSections(envelope.sections, MODEL_DOCUMENT_CODEC_V2, limits);
}

export function decodeModelDocumentEnvelope(
  input: unknown,
  limits: ToolcraftCanonicalModelLimits,
): ModelDocumentEnvelope {
  const bytes = snapshotDecodeInput(input, limits);

  if (bytes.byteLength < MODEL_DOCUMENT_CODEC_HEADER_BYTES) {
    throwModelDocumentCodecError(
      "truncated-header",
      "header",
      "Canonical model document header is truncated.",
    );
  }

  if (bytes.byteLength > limits.maxDecodedBytes) {
    throwModelDocumentCodecError(
      "encoded-size-limit-exceeded",
      "envelope",
      `Canonical envelope exceeds maxDecodedBytes ${limits.maxDecodedBytes}.`,
    );
  }

  validateMagic(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(8, true);
  const format = getModelDocumentCodecFormat(version);
  if (format === undefined) {
    throwModelDocumentCodecError(
      "unsupported-codec-version",
      "header.version",
      `Unsupported canonical model document codec version ${version}.`,
    );
  }

  const sectionCount = view.getUint16(10, true);
  if (sectionCount !== format.sectionKinds.length) {
    throwModelDocumentCodecError(
      "invalid-section-count",
      "header.sectionCount",
      `Canonical codec version ${format.version} must declare ${format.sectionKinds.length} sections.`,
    );
  }

  const payloadOffset = view.getUint32(12, true);
  if (payloadOffset !== format.payloadOffset) {
    throwModelDocumentCodecError(
      "invalid-header-size",
      "header.payloadOffset",
      `Canonical envelope payload must start at byte ${format.payloadOffset}.`,
    );
  }

  if (bytes.byteLength < payloadOffset) {
    throwModelDocumentCodecError(
      "truncated-header",
      "sectionDirectory",
      "Canonical model document section directory is truncated.",
    );
  }

  const descriptors: { kind: number; length: number }[] = [];
  const seenKinds = new Set<number>();
  const sectionKindSet: ReadonlySet<number> = new Set(format.sectionKinds);

  for (let index = 0; index < sectionCount; index += 1) {
    const descriptorOffset = modelDocumentDescriptorOffset(index);
    if (descriptorOffset + MODEL_DOCUMENT_CODEC_DESCRIPTOR_BYTES > bytes.byteLength) {
      throwModelDocumentCodecError(
        "truncated-header",
        `sections[${index}]`,
        "Canonical model document section directory is truncated.",
      );
    }

    const kind = view.getUint32(descriptorOffset, true);
    const flags = view.getUint32(descriptorOffset + 4, true);
    const length = view.getBigUint64(descriptorOffset + 8, true);

    if (flags !== 0) {
      throwModelDocumentCodecError(
        "invalid-section-flags",
        `sections[${index}].flags`,
        `Section ${index} declares unsupported flags.`,
      );
    }

    if (seenKinds.has(kind)) {
      throwModelDocumentCodecError(
        "duplicate-section",
        `sections[${index}].kind`,
        `Canonical envelope duplicates section kind ${kind}.`,
      );
    }

    if (!sectionKindSet.has(kind)) {
      throwModelDocumentCodecError(
        "unknown-section",
        `sections[${index}].kind`,
        `Canonical envelope contains unknown section kind ${kind}.`,
      );
    }

    if (length > maximumSafeSectionLength) {
      throwModelDocumentCodecError(
        "unsafe-section-length",
        `sections[${index}].length`,
        `Section ${kind} exceeds safe integer size.`,
      );
    }

    const numericLength = Number(length);
    if (numericLength > limits.maxDecodedBytes) {
      throwModelDocumentCodecError(
        "section-length-limit-exceeded",
        `sections[${index}].length`,
        `Section ${kind} exceeds maxDecodedBytes ${limits.maxDecodedBytes}.`,
      );
    }

    if (kind !== 1 && numericLength % 4 !== 0) {
      throwModelDocumentCodecError(
        "invalid-section-byte-length",
        `sections[${index}].length`,
        `Typed-array section ${kind} must be divisible by four bytes.`,
      );
    }

    if (kind === 1 && numericLength === 0) {
      throwModelDocumentCodecError(
        "empty-metadata",
        `sections[${index}].length`,
        "Canonical metadata section must not be empty.",
      );
    }

    seenKinds.add(kind);
    descriptors.push({
      kind,
      length: numericLength,
    });
  }

  for (let index = 0; index < descriptors.length; index += 1) {
    if (descriptors[index]!.kind !== format.sectionKinds[index]) {
      throwModelDocumentCodecError(
        "invalid-section-order",
        `sections[${index}].kind`,
        "Canonical envelope sections are not in stable order.",
      );
    }
  }

  let expectedBytes = BigInt(payloadOffset);
  for (const descriptor of descriptors) {
    expectedBytes += BigInt(descriptor.length);
  }

  if (expectedBytes > BigInt(bytes.byteLength)) {
    throwModelDocumentCodecError(
      "truncated-envelope",
      "envelope",
      "Canonical model document payload is truncated.",
    );
  }

  if (expectedBytes < BigInt(bytes.byteLength)) {
    throwModelDocumentCodecError(
      "trailing-data",
      "envelope",
      "Canonical model document has trailing bytes.",
    );
  }

  const metadataByteLength = descriptors[0]!.length;
  let payloadByteLength = 0;
  for (let index = 1; index < descriptors.length; index += 1) {
    payloadByteLength += descriptors[index]!.length;
  }
  assertToolcraftModelDecodeWorkerMemory(
    bytes.byteLength,
    metadataByteLength,
    payloadByteLength,
    limits,
  );

  const sections = new Map<number, Uint8Array>();
  let sectionOffset = payloadOffset;
  for (const descriptor of descriptors) {
    sections.set(descriptor.kind, bytes.subarray(
      sectionOffset,
      sectionOffset + descriptor.length,
    ));
    sectionOffset += descriptor.length;
  }

  const section = (kind: ModelDocumentSectionKind): Uint8Array => {
    const value = sections.get(kind);
    if (value === undefined) {
      throwModelDocumentCodecError(
        "truncated-envelope",
        `sections.${kind}`,
        `Canonical envelope is missing section ${kind}.`,
      );
    }
    return value;
  };

  return version === 1
    ? {
        codecVersion: 1,
        sections: { 1: section(1), 2: section(2), 3: section(3), 4: section(4) },
      }
    : {
        codecVersion: 2,
        sections: {
          1: section(1),
          2: section(2),
          3: section(3),
          4: section(4),
          5: section(5),
          6: section(6),
        },
      };
}
