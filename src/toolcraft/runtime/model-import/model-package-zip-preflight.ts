import type { ToolcraftModelImportLimits } from "../schema/types";
import { normalizeToolcraftModelPackagePath } from "./model-package-path";
import {
  ToolcraftModelPackageError,
  type ToolcraftModelPackageZipPreflight,
  type ToolcraftModelPackageZipPreflightEntry,
} from "./model-package-types";

const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const END_OF_CENTRAL_DIRECTORY_BYTES = 22;
const MAX_ZIP_COMMENT_BYTES = 65_535;
const UTF8_FILE_NAME_FLAG = 0x0800;
const DATA_DESCRIPTOR_FLAG = 0x0008;
const ENCRYPTED_FLAGS = 0x0041;
const ZIP64_16 = 0xffff;
const ZIP64_32 = 0xffffffff;
const textDecoder = new TextDecoder("utf-8", { fatal: true });

type EndOfCentralDirectory = Readonly<{
  centralDirectoryOffset: number;
  centralDirectorySize: number;
  entryCount: number;
  offset: number;
}>;

function bundleError(code: string, message: string): never {
  throw new ToolcraftModelPackageError("bundle", code, message);
}

function limitError(code: string, message: string): never {
  throw new ToolcraftModelPackageError("resource-limit", code, message);
}

function checkedRange(
  offset: number,
  byteLength: number,
  maximum: number,
): boolean {
  return Number.isSafeInteger(offset) && Number.isSafeInteger(byteLength) &&
    offset >= 0 && byteLength >= 0 && offset <= maximum - byteLength;
}

function findEndOfCentralDirectory(
  bytes: Uint8Array,
  view: DataView,
): EndOfCentralDirectory {
  if (bytes.byteLength < END_OF_CENTRAL_DIRECTORY_BYTES) {
    return bundleError("archive-invalid", "The model archive is truncated.");
  }
  const minimumOffset = Math.max(
    0,
    bytes.byteLength - END_OF_CENTRAL_DIRECTORY_BYTES - MAX_ZIP_COMMENT_BYTES,
  );
  for (
    let offset = bytes.byteLength - END_OF_CENTRAL_DIRECTORY_BYTES;
    offset >= minimumOffset;
    offset -= 1
  ) {
    if (view.getUint32(offset, true) !== END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      continue;
    }
    const commentBytes = view.getUint16(offset + 20, true);
    if (offset + END_OF_CENTRAL_DIRECTORY_BYTES + commentBytes !== bytes.byteLength) {
      continue;
    }
    const disk = view.getUint16(offset + 4, true);
    const centralDirectoryDisk = view.getUint16(offset + 6, true);
    const diskEntries = view.getUint16(offset + 8, true);
    const entryCount = view.getUint16(offset + 10, true);
    const centralDirectorySize = view.getUint32(offset + 12, true);
    const centralDirectoryOffset = view.getUint32(offset + 16, true);
    if (
      disk !== 0 ||
      centralDirectoryDisk !== 0 ||
      diskEntries !== entryCount ||
      entryCount === ZIP64_16 ||
      centralDirectorySize === ZIP64_32 ||
      centralDirectoryOffset === ZIP64_32
    ) {
      return bundleError(
        "archive-layout-unsupported",
        "The model archive uses an unsupported split or ZIP64 layout.",
      );
    }
    if (
      !checkedRange(
        centralDirectoryOffset,
        centralDirectorySize,
        bytes.byteLength,
      ) ||
      centralDirectoryOffset + centralDirectorySize !== offset
    ) {
      return bundleError(
        "archive-invalid",
        "The model archive central directory is inconsistent.",
      );
    }
    return Object.freeze({
      centralDirectoryOffset,
      centralDirectorySize,
      entryCount,
      offset,
    });
  }
  return bundleError(
    "archive-invalid",
    "The model archive has no valid central directory.",
  );
}

function decodeEntryName(nameBytes: Uint8Array, flags: number): string {
  try {
    if ((flags & UTF8_FILE_NAME_FLAG) !== 0) {
      return textDecoder.decode(nameBytes);
    }
    if (nameBytes.some((byte) => byte > 0x7f)) {
      return bundleError(
        "archive-path-encoding-unsupported",
        "The model archive uses an ambiguous non-UTF-8 entry path.",
      );
    }
    let name = "";
    for (const byte of nameBytes) name += String.fromCharCode(byte);
    return name;
  } catch (error) {
    if (error instanceof ToolcraftModelPackageError) throw error;
    return bundleError(
      "archive-path-encoding-unsupported",
      "The model archive contains an unreadable entry path.",
    );
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength &&
    left.every((byte, index) => byte === right[index]);
}

function assertSupportedEntryType(
  path: string,
  versionMadeBy: number,
  externalAttributes: number,
): void {
  const platform = versionMadeBy >>> 8;
  const unixMode = externalAttributes >>> 16;
  const unixType = unixMode & 0xf000;
  const dosDirectory = (externalAttributes & 0x10) !== 0;
  if (
    path.endsWith("/") ||
    dosDirectory ||
    (platform === 3 && unixType !== 0 && unixType !== 0x8000)
  ) {
    bundleError(
      "archive-entry-type-unsupported",
      "The model archive contains a directory, link, or special entry.",
    );
  }
}

function assertEntryLimits(
  compressedBytes: number,
  uncompressedBytes: number,
  limits: Readonly<ToolcraftModelImportLimits>,
): void {
  if (uncompressedBytes > limits.maxArchiveEntryBytes) {
    limitError(
      "archive-entry-byte-limit-exceeded",
      "A model archive entry exceeds its uncompressed byte limit.",
    );
  }
  const ratio = uncompressedBytes === 0
    ? 0
    : uncompressedBytes / Math.max(compressedBytes, 1);
  if (ratio > limits.maxArchiveCompressionRatio) {
    limitError(
      "archive-compression-ratio-exceeded",
      "A model archive entry exceeds its compression-ratio limit.",
    );
  }
}

export function preflightToolcraftModelPackageZip(
  archive: Uint8Array,
  limits: Readonly<ToolcraftModelImportLimits>,
): ToolcraftModelPackageZipPreflight {
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  );
  const end = findEndOfCentralDirectory(archive, view);
  if (end.entryCount === 0) {
    return bundleError("archive-invalid", "The model archive is empty.");
  }
  if (end.entryCount > limits.maxArchiveEntries) {
    return limitError(
      "archive-entry-limit-exceeded",
      "The model archive exceeds its entry-count limit.",
    );
  }

  const entries: ToolcraftModelPackageZipPreflightEntry[] = [];
  const paths = new Set<string>();
  const localHeaderOffsets = new Set<number>();
  let cursor = end.centralDirectoryOffset;
  let totalCompressedBytes = 0;
  let totalUncompressedBytes = 0;
  for (let index = 0; index < end.entryCount; index += 1) {
    if (
      !checkedRange(cursor, 46, end.offset) ||
      view.getUint32(cursor, true) !== CENTRAL_DIRECTORY_SIGNATURE
    ) {
      return bundleError(
        "archive-invalid",
        "The model archive central directory contains an invalid entry.",
      );
    }
    const versionMadeBy = view.getUint16(cursor + 4, true);
    const flags = view.getUint16(cursor + 8, true);
    const compression = view.getUint16(cursor + 10, true);
    const crc32 = view.getUint32(cursor + 16, true);
    const compressedBytes = view.getUint32(cursor + 20, true);
    const uncompressedBytes = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const diskStart = view.getUint16(cursor + 34, true);
    const externalAttributes = view.getUint32(cursor + 38, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const entryBytes = 46 + nameLength + extraLength + commentLength;
    if (!checkedRange(cursor, entryBytes, end.offset) || nameLength === 0) {
      return bundleError("archive-invalid", "A model archive entry is truncated.");
    }
    if ((flags & ENCRYPTED_FLAGS) !== 0) {
      return bundleError(
        "archive-encryption-unsupported",
        "Encrypted model archive entries are not supported.",
      );
    }
    if (compression !== 0 && compression !== 8) {
      return bundleError(
        "archive-compression-unsupported",
        "The model archive uses an unsupported compression method.",
      );
    }
    if (
      diskStart !== 0 ||
      compressedBytes === ZIP64_32 ||
      uncompressedBytes === ZIP64_32 ||
      localHeaderOffset === ZIP64_32
    ) {
      return bundleError(
        "archive-layout-unsupported",
        "The model archive entry uses an unsupported split or ZIP64 layout.",
      );
    }
    if (compression === 0 && compressedBytes !== uncompressedBytes) {
      return bundleError(
        "archive-invalid",
        "A stored model archive entry has inconsistent byte lengths.",
      );
    }
    const centralName = archive.subarray(cursor + 46, cursor + 46 + nameLength);
    const rawPath = decodeEntryName(centralName, flags);
    assertSupportedEntryType(rawPath, versionMadeBy, externalAttributes);
    const path = normalizeToolcraftModelPackagePath(
      rawPath,
      limits.maxArchivePathLength,
    );
    if (paths.has(path)) {
      return bundleError(
        "archive-path-duplicate",
        "The model archive contains duplicate normalized entry paths.",
      );
    }
    paths.add(path);
    if (localHeaderOffsets.has(localHeaderOffset)) {
      return bundleError(
        "archive-invalid",
        "The model archive aliases one local entry from multiple records.",
      );
    }
    localHeaderOffsets.add(localHeaderOffset);
    assertEntryLimits(compressedBytes, uncompressedBytes, limits);
    if (
      totalUncompressedBytes >
        limits.maxArchiveUncompressedBytes - uncompressedBytes
    ) {
      return limitError(
        "archive-byte-limit-exceeded",
        "The model archive exceeds its aggregate uncompressed byte limit.",
      );
    }
    totalCompressedBytes += compressedBytes;
    totalUncompressedBytes += uncompressedBytes;

    if (
      !checkedRange(localHeaderOffset, 30, end.centralDirectoryOffset) ||
      view.getUint32(localHeaderOffset, true) !== LOCAL_FILE_HEADER_SIGNATURE
    ) {
      return bundleError(
        "archive-invalid",
        "A model archive local file header is invalid.",
      );
    }
    const localFlags = view.getUint16(localHeaderOffset + 6, true);
    const localCompression = view.getUint16(localHeaderOffset + 8, true);
    const localCrc32 = view.getUint32(localHeaderOffset + 14, true);
    const localCompressedBytes = view.getUint32(localHeaderOffset + 18, true);
    const localUncompressedBytes = view.getUint32(localHeaderOffset + 22, true);
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const localHeaderBytes = 30 + localNameLength + localExtraLength;
    if (
      localFlags !== flags ||
      localCompression !== compression ||
      localNameLength !== nameLength ||
      !checkedRange(
        localHeaderOffset,
        localHeaderBytes,
        end.centralDirectoryOffset,
      )
    ) {
      return bundleError(
        "archive-invalid",
        "A model archive local header conflicts with its central record.",
      );
    }
    const localName = archive.subarray(
      localHeaderOffset + 30,
      localHeaderOffset + 30 + localNameLength,
    );
    if (!equalBytes(centralName, localName)) {
      return bundleError(
        "archive-invalid",
        "A model archive entry has conflicting local and central paths.",
      );
    }
    if (
      (flags & DATA_DESCRIPTOR_FLAG) === 0 &&
      (localCrc32 !== crc32 ||
        localCompressedBytes !== compressedBytes ||
        localUncompressedBytes !== uncompressedBytes)
    ) {
      return bundleError(
        "archive-invalid",
        "A model archive local header has inconsistent metadata.",
      );
    }
    const dataOffset = localHeaderOffset + localHeaderBytes;
    if (!checkedRange(dataOffset, compressedBytes, end.centralDirectoryOffset)) {
      return bundleError(
        "archive-invalid",
        "A model archive entry data range is invalid.",
      );
    }
    entries.push(Object.freeze({
      compressedBytes,
      compression: compression as 0 | 8,
      crc32,
      dataOffset,
      localHeaderOffset,
      path,
      uncompressedBytes,
    }));
    cursor += entryBytes;
  }
  if (cursor !== end.centralDirectoryOffset + end.centralDirectorySize) {
    return bundleError(
      "archive-invalid",
      "The model archive central directory size is inconsistent.",
    );
  }
  const aggregateRatio = totalUncompressedBytes === 0
    ? 0
    : totalUncompressedBytes / Math.max(totalCompressedBytes, 1);
  if (aggregateRatio > limits.maxArchiveCompressionRatio) {
    return limitError(
      "archive-compression-ratio-exceeded",
      "The model archive exceeds its aggregate compression-ratio limit.",
    );
  }
  const localOrder = [...entries].sort(
    (left, right) => left.localHeaderOffset - right.localHeaderOffset,
  );
  for (let index = 0; index < localOrder.length - 1; index += 1) {
    const current = localOrder[index]!;
    const next = localOrder[index + 1]!;
    if (current.dataOffset + current.compressedBytes > next.localHeaderOffset) {
      return bundleError(
        "archive-invalid",
        "The model archive contains overlapping entry data.",
      );
    }
  }

  return Object.freeze({
    centralDirectoryOffset: end.centralDirectoryOffset,
    entries: Object.freeze(entries),
    totalCompressedBytes,
    totalUncompressedBytes,
  });
}
