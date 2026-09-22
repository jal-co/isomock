import type { ToolcraftModelImportLimits } from "../schema/types";
import type { ToolcraftSourceAssetFeedback } from "../source-assets/source-asset-types";

export type ToolcraftModelPackageEntryMetadata = Readonly<{
  compressedBytes: number;
  contentDigest: string;
  mimeType: string;
  path: string;
  uncompressedBytes: number;
}>;

export type ToolcraftExtractedModelPackageEntry =
  ToolcraftModelPackageEntryMetadata & Readonly<{ bytes: ArrayBuffer }>;

export type ToolcraftModelPackageZipPreflightEntry = Readonly<{
  compressedBytes: number;
  compression: 0 | 8;
  crc32: number;
  dataOffset: number;
  localHeaderOffset: number;
  path: string;
  uncompressedBytes: number;
}>;

export type ToolcraftModelPackageZipPreflight = Readonly<{
  centralDirectoryOffset: number;
  entries: readonly ToolcraftModelPackageZipPreflightEntry[];
  totalCompressedBytes: number;
  totalUncompressedBytes: number;
}>;

export type ToolcraftModelPackageExtractionOptions = Readonly<{
  limits: Readonly<ToolcraftModelImportLimits>;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}>;

export class ToolcraftModelPackageError extends Error {
  readonly category: Extract<
    ToolcraftSourceAssetFeedback["category"],
    "bundle" | "resource-limit"
  >;
  readonly code: string;

  constructor(
    category: ToolcraftModelPackageError["category"],
    code: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolcraftModelPackageError";
    this.category = category;
    this.code = code;
  }
}
