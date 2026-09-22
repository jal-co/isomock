import { failModelSourceBundle } from "./model-source-bundle-error";

export type ModelSourceFileSnapshot = Readonly<{
  displayName: string;
  extension: string;
  hasPathEvidence: boolean;
  mimeType: string;
  path: string;
  rawPath: string;
  read: () => Promise<unknown>;
  size: number;
}>;

const DRIVE_PATH_PATTERN = /^[a-z]:/iu;
const ENCODED_OCTET_PATTERN = /%[0-9a-f]{2}/iu;

// This metadata-only admission guard is intentionally independent of logical
// geometry bundle limits, so ignored appearance files are never read or charged.
export const TOOLCRAFT_MODEL_RAW_BATCH_FILE_CEILING = 4_096;
export const TOOLCRAFT_MODEL_RAW_BATCH_PATH_CODE_UNIT_CEILING = 1_048_576;

function sourcePathFailure(code: string): never {
  return failModelSourceBundle(
    "bundle",
    code,
    "The selected source contains unsafe or invalid browser path evidence.",
  );
}

function assertSafeSourceName(name: unknown): asserts name is string {
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0")
  ) {
    sourcePathFailure("unsafe-source-path");
  }
}

function checkedPathMetadataTotal(current: number, additional: number): number {
  if (
    !Number.isSafeInteger(additional) ||
    additional < 0 ||
    current > TOOLCRAFT_MODEL_RAW_BATCH_PATH_CODE_UNIT_CEILING - additional
  ) {
    return failModelSourceBundle(
      "resource-limit",
      "raw-batch-path-metadata-limit-exceeded",
      "The selected batch contains too much browser path metadata.",
    );
  }
  return current + additional;
}

export function assertModelSourceRawBatchAdmission(
  files: readonly File[],
): void {
  if (files.length > TOOLCRAFT_MODEL_RAW_BATCH_FILE_CEILING) {
    failModelSourceBundle(
      "resource-limit",
      "raw-batch-file-limit-exceeded",
      "The selected batch contains too many browser file records.",
    );
  }
}

function normalizeProvenSourcePath(path: string, fileName: string): string {
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("\0") ||
    DRIVE_PATH_PATTERN.test(path)
  ) {
    return sourcePathFailure("unsafe-source-path");
  }
  const rawSegments = path.split("/");
  if (
    rawSegments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    return sourcePathFailure("unsafe-source-path");
  }
  const normalizedSegments = rawSegments.map((segment) =>
    segment.normalize("NFC"),
  );
  if (normalizedSegments.at(-1) !== fileName.normalize("NFC")) {
    return sourcePathFailure("invalid-source-path-evidence");
  }
  return normalizedSegments.join("/");
}

export function sourceExtension(path: string): string {
  const displayName = path.slice(path.lastIndexOf("/") + 1);
  const dotIndex = displayName.lastIndexOf(".");
  return dotIndex < 0 ? "" : displayName.slice(dotIndex).toLowerCase();
}

export function snapshotModelSourceFiles(
  files: readonly File[],
): readonly ModelSourceFileSnapshot[] {
  if (!Array.isArray(files) || files.length === 0) {
    return failModelSourceBundle(
      "bundle",
      "empty-model-bundle",
      "Select at least one model source file.",
    );
  }

  assertModelSourceRawBatchAdmission(files);
  const snapshots: ModelSourceFileSnapshot[] = [];
  let pathMetadataCodeUnits = 0;
  for (let index = 0; index < files.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(files, index)) {
      return failModelSourceBundle(
        "bundle",
        "invalid-source-file",
        `The source batch has a sparse entry at index ${index}.`,
      );
    }
    const file = files[index] as File | undefined;
    const displayName: unknown = file?.name;
    const size: unknown = file?.size;
    const mimeType: unknown = file?.type;
    const arrayBuffer: unknown = file?.arrayBuffer;
    const evidence: unknown = (
      file as (File & { webkitRelativePath?: unknown }) | undefined
    )?.webkitRelativePath;
    assertSafeSourceName(displayName);
    if (
      !Number.isSafeInteger(size) ||
      (size as number) < 0 ||
      typeof mimeType !== "string" ||
      typeof arrayBuffer !== "function" ||
      file === undefined
    ) {
      return failModelSourceBundle(
        "bundle",
        "invalid-source-file",
        "A selected source file has invalid browser metadata.",
      );
    }

    if (evidence !== undefined && typeof evidence !== "string") {
      return sourcePathFailure("invalid-source-path-evidence");
    }
    pathMetadataCodeUnits = checkedPathMetadataTotal(
      pathMetadataCodeUnits,
      displayName.length + (typeof evidence === "string" ? evidence.length : 0),
    );
    const hasPathEvidence = typeof evidence === "string" && evidence.length > 0;
    const path = hasPathEvidence
      ? normalizeProvenSourcePath(evidence, displayName)
      : displayName.normalize("NFC");
    snapshots.push(
      Object.freeze({
        displayName,
        extension: sourceExtension(path),
        hasPathEvidence,
        mimeType: mimeType || "application/octet-stream",
        path,
        rawPath: hasPathEvidence ? evidence : displayName,
        read: () => arrayBuffer.call(file) as Promise<unknown>,
        size: size as number,
      }),
    );
  }
  return Object.freeze(snapshots);
}

function decodeUriSegment(segment: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return undefined;
  }
  const normalized = decoded.normalize("NFC");
  if (
    normalized.length === 0 ||
    normalized === "." ||
    normalized === ".." ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    normalized.includes("\0") ||
    normalized.includes("?") ||
    normalized.includes("#") ||
    ENCODED_OCTET_PATTERN.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

export function tryNormalizeLocalModelSourceUri(
  uri: string,
): readonly string[] | undefined {
  if (
    uri.length === 0 ||
    uri.startsWith("/") ||
    uri.startsWith("//") ||
    uri.includes("\\") ||
    uri.includes("\0") ||
    uri.includes("?") ||
    uri.includes("#") ||
    /^[a-z][a-z0-9+.-]*:/iu.test(uri)
  ) return undefined;
  const segments: string[] = [];
  for (const segment of uri.split("/")) {
    const decoded = decodeUriSegment(segment);
    if (!decoded) return undefined;
    segments.push(decoded);
  }
  if (DRIVE_PATH_PATTERN.test(segments[0] ?? "")) return undefined;
  return Object.freeze(segments);
}

export function normalizeLocalBufferUri(uri: string): readonly string[] {
  const segments = tryNormalizeLocalModelSourceUri(uri);
  if (!segments) {
    return failModelSourceBundle(
      "bundle",
      "unsafe-buffer-uri",
      "A glTF geometry buffer URI must be an unambiguous relative path.",
    );
  }
  return segments;
}
