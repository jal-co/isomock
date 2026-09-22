import type { ToolcraftModelImportLimits } from "../schema/types";

const MEBIBYTE = 1024 * 1024;

export const TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS = Object.freeze({
  maxArchiveCompressionRatio: 100,
  maxArchiveEntries: 4_096,
  maxArchiveEntryBytes: 32 * MEBIBYTE,
  maxArchivePathLength: 1_024,
  maxArchiveUncompressedBytes: 64 * MEBIBYTE,
  maxBundleFiles: 32,
  maxDecodedBytes: 128 * MEBIBYTE,
  maxEstimatedWorkerBytes: 256 * MEBIBYTE,
  maxNodes: 10_000,
  maxPrimitives: 10_000,
  maxSourceBytes: 32 * MEBIBYTE,
  maxTextureBytes: 32 * MEBIBYTE,
  maxTextureCount: 256,
  maxTextureDimension: 8_192,
  maxTexturePixels: 33_554_432,
  maxTriangles: 1_000_000,
  maxVertices: 1_000_000,
} satisfies ToolcraftModelImportLimits);

export const TOOLCRAFT_MODEL_IMPORT_LIMIT_NAMES = Object.freeze(
  Object.keys(
    TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS,
  ) as (keyof ToolcraftModelImportLimits)[],
);

export const TOOLCRAFT_DEFAULT_MODEL_IMPORT_LIMITS:
  Readonly<ToolcraftModelImportLimits> = TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS;

export function isValidToolcraftModelImportLimitValue(
  name: keyof ToolcraftModelImportLimits,
  value: unknown,
): value is number {
  return name === "maxArchiveCompressionRatio"
    ? typeof value === "number" && Number.isFinite(value) && value >= 1
    : typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
