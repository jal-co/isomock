import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";

import { digestModelSourceBytes } from "./model-source-digest";
import {
  getToolcraftModelPackageMimeType,
  normalizeToolcraftModelPackagePath,
} from "./model-package-path";
import {
  ToolcraftModelPackageError,
  type ToolcraftExtractedModelPackageEntry,
  type ToolcraftModelPackageExtractionOptions,
  type ToolcraftModelPackageZipPreflightEntry,
} from "./model-package-types";
import { preflightToolcraftModelPackageZip } from "./model-package-zip-preflight";

const ARCHIVE_CHUNK_BYTES = 64 * 1024;
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 0
        ? value >>> 1
        : 0xedb88320 ^ (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function updateCrc32(crc32: number, bytes: Uint8Array): number {
  let value = crc32;
  for (const byte of bytes) {
    value = CRC32_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  }
  return value >>> 0;
}

function extractionError(code: string, message: string): ToolcraftModelPackageError {
  return new ToolcraftModelPackageError("bundle", code, message);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException("Model package extraction was cancelled.", "AbortError");
}

function compressedProgressAt(
  byteOffset: number,
  archiveByteLength: number,
  entries: readonly ToolcraftModelPackageZipPreflightEntry[],
  totalCompressedBytes: number,
): number {
  if (totalCompressedBytes === 0) {
    return byteOffset / archiveByteLength;
  }
  const consumed = entries.reduce((total, entry) =>
    total + Math.min(
      Math.max(byteOffset - entry.dataOffset, 0),
      entry.compressedBytes,
    ), 0);
  return consumed / totalCompressedBytes;
}

export function extractToolcraftModelPackageZip(
  archive: Uint8Array,
  options: ToolcraftModelPackageExtractionOptions,
): readonly ToolcraftExtractedModelPackageEntry[] {
  throwIfAborted(options.signal);
  const preflight = preflightToolcraftModelPackageZip(archive, options.limits);
  const expectedByPath = new Map(
    preflight.entries.map((entry) => [entry.path, entry]),
  );
  const extractedByPath = new Map<string, ToolcraftExtractedModelPackageEntry>();
  let actualAggregateBytes = 0;
  let failure: unknown;
  let lastProgress = -1;

  const fail = (error: unknown): void => {
    failure ??= error instanceof ToolcraftModelPackageError ||
      error instanceof DOMException
      ? error
      : extractionError(
          "archive-extraction-failed",
          "The model archive could not be extracted safely.",
        );
  };
  const unzip = new Unzip((file) => {
    if (failure) {
      file.terminate();
      return;
    }
    let path: string;
    try {
      throwIfAborted(options.signal);
      path = normalizeToolcraftModelPackagePath(
        file.name,
        options.limits.maxArchivePathLength,
      );
    } catch (error) {
      fail(error);
      file.terminate();
      return;
    }
    const expected = expectedByPath.get(path);
    if (
      !expected ||
      extractedByPath.has(path) ||
      file.compression !== expected.compression ||
      (file.size !== undefined && file.size !== expected.compressedBytes) ||
      (file.originalSize !== undefined &&
        file.originalSize !== expected.uncompressedBytes)
    ) {
      fail(extractionError(
        "archive-invalid",
        "The model archive extraction stream conflicts with its preflight.",
      ));
      file.terminate();
      return;
    }
    const output = new Uint8Array(expected.uncompressedBytes);
    let written = 0;
    let crc32 = 0xffffffff;
    file.ondata = (error, chunk, final) => {
      if (failure) return;
      try {
        throwIfAborted(options.signal);
        if (error) {
          throw extractionError(
            "archive-extraction-failed",
            "A model archive entry could not be decompressed.",
          );
        }
        if (
          written > expected.uncompressedBytes - chunk.byteLength ||
          actualAggregateBytes >
            options.limits.maxArchiveUncompressedBytes - chunk.byteLength
        ) {
          throw new ToolcraftModelPackageError(
            "resource-limit",
            "archive-byte-limit-exceeded",
            "The extracted model archive exceeds its byte limits.",
          );
        }
        written += chunk.byteLength;
        actualAggregateBytes += chunk.byteLength;
        const runningRatio = written === 0
          ? 0
          : written / Math.max(expected.compressedBytes, 1);
        if (runningRatio > options.limits.maxArchiveCompressionRatio) {
          throw new ToolcraftModelPackageError(
            "resource-limit",
            "archive-compression-ratio-exceeded",
            "The extracted model archive exceeds its compression-ratio limit.",
          );
        }
        output.set(chunk, written - chunk.byteLength);
        crc32 = updateCrc32(crc32, chunk);
        if (!final) return;
        if (
          written !== expected.uncompressedBytes ||
          (crc32 ^ 0xffffffff) >>> 0 !== expected.crc32
        ) {
          throw extractionError(
            "archive-entry-integrity-failed",
            "A model archive entry failed its size or CRC integrity check.",
          );
        }
        extractedByPath.set(path, Object.freeze({
          bytes: output.buffer,
          compressedBytes: expected.compressedBytes,
          contentDigest: digestModelSourceBytes(output),
          mimeType: getToolcraftModelPackageMimeType(path),
          path,
          uncompressedBytes: expected.uncompressedBytes,
        }));
      } catch (caught) {
        fail(caught);
        file.terminate();
      }
    };
    try {
      file.start();
    } catch (error) {
      fail(error);
      file.terminate();
    }
  });
  unzip.register(UnzipPassThrough);
  unzip.register(UnzipInflate);

  for (let offset = 0; offset < archive.byteLength; offset += ARCHIVE_CHUNK_BYTES) {
    throwIfAborted(options.signal);
    const end = Math.min(offset + ARCHIVE_CHUNK_BYTES, archive.byteLength);
    try {
      unzip.push(archive.subarray(offset, end), end === archive.byteLength);
    } catch (error) {
      fail(error);
    }
    if (failure) throw failure;
    const progress = Math.min(compressedProgressAt(
      end,
      archive.byteLength,
      preflight.entries,
      preflight.totalCompressedBytes,
    ), 0.999);
    if (progress > lastProgress) {
      lastProgress = progress;
      options.onProgress?.(progress);
    }
  }
  if (failure) throw failure;
  throwIfAborted(options.signal);
  if (
    extractedByPath.size !== preflight.entries.length ||
    actualAggregateBytes !== preflight.totalUncompressedBytes
  ) {
    throw extractionError(
      "archive-extraction-failed",
      "The model archive did not yield every preflighted entry.",
    );
  }
  return Object.freeze(
    preflight.entries.map((entry) => extractedByPath.get(entry.path)!),
  );
}
