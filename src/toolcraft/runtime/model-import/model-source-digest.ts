import type {
  ToolcraftModelSourceBundle,
  ToolcraftModelSourceBundleTransfer,
  ToolcraftModelSourceFile,
} from "./model-import-types";
import { TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS } from "./model-import-limits";
import { bytesToHex, sha256 } from "./canonical/sha256";

const textEncoder = new TextEncoder();
const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const TRANSFER_METADATA_CODE_UNIT_CEILING = 1_048_576;
const arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
)?.get;

export type ToolcraftModelSourceTransferDigestFailureCode =
  | "source-file-digest-mismatch"
  | "source-transfer-invalid"
  | "source-transfer-metadata-limit-exceeded";

export class ToolcraftModelSourceTransferDigestError extends Error {
  readonly category = "bundle" as const;
  readonly code: ToolcraftModelSourceTransferDigestFailureCode;

  constructor(
    code: ToolcraftModelSourceTransferDigestFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "ToolcraftModelSourceTransferDigestError";
    this.code = code;
  }
}

function digest(bytes: Uint8Array): string {
  return `sha256:${bytesToHex(sha256(bytes))}`;
}

function asWebCryptoInput(bytes: Uint8Array): ArrayBuffer {
  if (
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
  ) {
    return bytes.buffer;
  }
  return bytes.slice().buffer;
}

function encodeFrames(fields: readonly string[]): Uint8Array {
  const encodedFields = fields.map((field) => textEncoder.encode(field));
  const byteLength = encodedFields.reduce(
    (total, field) => total + 4 + field.byteLength,
    0,
  );
  const framed = new Uint8Array(byteLength);
  const view = new DataView(framed.buffer);
  let offset = 0;
  for (const field of encodedFields) {
    view.setUint32(offset, field.byteLength, false);
    offset += 4;
    framed.set(field, offset);
    offset += field.byteLength;
  }
  return framed;
}

export function digestModelSourceBytes(bytes: Uint8Array): string {
  return digest(bytes);
}

/** Keeps source-sized hashing off the browser event turn. */
export async function digestModelSourceBytesAsync(
  bytes: Uint8Array,
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      "WebCrypto SHA-256 is unavailable for model source import.",
    );
  }
  const result = await subtle.digest("SHA-256", asWebCryptoInput(bytes));
  return `sha256:${bytesToHex(new Uint8Array(result))}`;
}

function transferFailure(
  code: ToolcraftModelSourceTransferDigestFailureCode,
  message: string,
): never {
  throw new ToolcraftModelSourceTransferDigestError(code, message);
}

function intrinsicArrayBufferByteLength(value: unknown): number {
  if (!arrayBufferByteLengthGetter) {
    return transferFailure(
      "source-transfer-invalid",
      "The model source transfer buffer cannot be inspected safely.",
    );
  }
  try {
    return Reflect.apply(arrayBufferByteLengthGetter, value, []) as number;
  } catch {
    return transferFailure(
      "source-transfer-invalid",
      "The model source transfer contains an invalid byte buffer.",
    );
  }
}

function checkedMetadataTotal(current: number, value: unknown): number {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    current > TRANSFER_METADATA_CODE_UNIT_CEILING - value.length
  ) {
    return transferFailure(
      "source-transfer-metadata-limit-exceeded",
      "The model source transfer contains invalid or excessive path metadata.",
    );
  }
  return current + value.length;
}

export function digestModelSourceTransfer(
  bundle: ToolcraftModelSourceBundleTransfer,
): string {
  if (
    typeof bundle !== "object" ||
    bundle === null ||
    !Array.isArray(bundle.sourceFiles) ||
    bundle.sourceFiles.length === 0 ||
    bundle.sourceFiles.length >
      TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS.maxBundleFiles
  ) {
    return transferFailure(
      "source-transfer-invalid",
      "The model source transfer has an invalid file list.",
    );
  }

  let metadataCodeUnits = checkedMetadataTotal(0, bundle.rootPath);
  let totalBytes = 0;
  const paths = new Set<string>();
  const records: Array<
    Readonly<{
      actualDigest: string;
      byteLength: number;
      mimeType: string;
      path: string;
    }>
  > = [];
  for (let index = 0; index < bundle.sourceFiles.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(bundle.sourceFiles, index)) {
      return transferFailure(
        "source-transfer-invalid",
        "The model source transfer has a sparse file list.",
      );
    }
    const file = bundle.sourceFiles[index]!;
    metadataCodeUnits = checkedMetadataTotal(metadataCodeUnits, file.path);
    metadataCodeUnits = checkedMetadataTotal(metadataCodeUnits, file.mimeType);
    if (paths.has(file.path)) {
      return transferFailure(
        "source-transfer-invalid",
        "The model source transfer repeats a source path.",
      );
    }
    paths.add(file.path);
    const byteLength = intrinsicArrayBufferByteLength(file.bytes);
    if (
      !Number.isSafeInteger(byteLength) ||
      byteLength < 0 ||
      totalBytes >
        TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS.maxSourceBytes - byteLength
    ) {
      return transferFailure(
        "source-transfer-invalid",
        "The model source transfer exceeds its protected byte ceiling.",
      );
    }
    totalBytes += byteLength;
    const actualDigest = digestModelSourceBytes(new Uint8Array(file.bytes));
    if (
      typeof file.contentDigest !== "string" ||
      !SHA256_DIGEST_PATTERN.test(file.contentDigest) ||
      file.contentDigest !== actualDigest
    ) {
      return transferFailure(
        "source-file-digest-mismatch",
        "A model source file digest does not match its transferred bytes.",
      );
    }
    records.push(
      Object.freeze({
        actualDigest,
        byteLength,
        mimeType: file.mimeType,
        path: file.path,
      }),
    );
  }
  if (!paths.has(bundle.rootPath)) {
    return transferFailure(
      "source-transfer-invalid",
      "The model source transfer root path is missing from its file list.",
    );
  }

  records.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  const fields = [
    "toolcraft-model-source-transfer-v1",
    bundle.rootPath,
    String(records.length),
  ];
  for (const record of records) {
    fields.push(
      record.path,
      record.mimeType,
      String(record.byteLength),
      record.actualDigest,
    );
  }
  return digest(encodeFrames(fields));
}

export function createModelSourceResourceRef(
  contentDigest: string,
  mimeType: string,
): string {
  const identityDigest = digest(
    encodeFrames([
      "toolcraft-model-source-resource-v1",
      contentDigest,
      mimeType,
    ]),
  );
  return `toolcraft:model-source:${identityDigest}`;
}

export function digestModelSourceBundle(
  adapter: ToolcraftModelSourceBundle["adapter"],
  rootPath: string,
  sourceFiles: readonly ToolcraftModelSourceFile[],
): string {
  const orderedFiles = [...sourceFiles].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  const fields = [
    "toolcraft-model-source-bundle-v2",
    "model-package",
    adapter.format,
    adapter.adapterVersion,
    adapter.rootExtension,
    rootPath,
    String(orderedFiles.length),
  ];
  for (const file of orderedFiles) {
    fields.push(
      file.path,
      file.mimeType,
      String(file.byteLength),
      file.contentDigest,
    );
  }
  return digest(encodeFrames(fields));
}
