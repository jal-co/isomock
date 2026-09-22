import type { ToolcraftModelImportLimits } from "../schema/types";
import { TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS } from "./model-import-limit-values";
import type {
  ToolcraftModelPackageDiagnostic,
  ToolcraftModelPackageEntryDescriptor,
  ToolcraftModelPackageSource,
  ToolcraftModelSourceBundle,
  ToolcraftModelSourceFile,
} from "./model-import-types";
import {
  createModelSourceBundleDescriptorBudget,
  descriptorInvalid,
  descriptorLimitExceeded,
  readDescriptorAdapter,
  readDescriptorArchiveSource,
  readDescriptorBoundedString,
  readDescriptorData,
  readDescriptorDigest,
  readDescriptorInteger,
  readDescriptorPath,
  readDescriptorPackageEntry,
  readDescriptorRecord,
  readDescriptorSourceFile,
  type ModelSourceBundleDescriptorBudget,
  type ModelSourceBundleDescriptorRecord,
} from "./model-source-bundle-descriptor-fields";
import { failModelSourceBundle } from "./model-source-bundle-error";
import { digestModelSourceBundle } from "./model-source-digest";
import { sourceExtension } from "./model-source-path";
import { getToolcraftModelPackageMimeType } from "./model-package-path";

export type ToolcraftModelSourceBundleDescriptorLimits = Readonly<
  Pick<
    ToolcraftModelImportLimits,
    | "maxArchiveEntries"
    | "maxArchiveUncompressedBytes"
    | "maxBundleFiles"
    | "maxSourceBytes"
  >
>;

function packageEntries(
  value: unknown,
  limits: ToolcraftModelSourceBundleDescriptorLimits,
  budget: ModelSourceBundleDescriptorBudget,
): readonly ToolcraftModelPackageEntryDescriptor[] {
  if (!Array.isArray(value) || value.length === 0) {
    return descriptorInvalid(
      "Model source bundle ZIP manifest must be non-empty.",
    );
  }
  if (value.length > limits.maxArchiveEntries) {
    return descriptorLimitExceeded(
      "Model source bundle ZIP manifest exceeds its entry limit.",
    );
  }
  const entries: ToolcraftModelPackageEntryDescriptor[] = [];
  const paths = new Set<string>();
  let totalBytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      return descriptorInvalid("Model source bundle ZIP manifest is sparse.");
    }
    const entry = readDescriptorPackageEntry(value[index], budget);
    if (
      paths.has(entry.path) ||
      entry.mimeType !== getToolcraftModelPackageMimeType(entry.path)
    ) {
      return descriptorInvalid(
        "Model source bundle ZIP manifest entry identity is invalid.",
      );
    }
    if (totalBytes > limits.maxArchiveUncompressedBytes - entry.byteLength) {
      return descriptorLimitExceeded(
        "Model source bundle ZIP manifest exceeds its byte limit.",
      );
    }
    paths.add(entry.path);
    totalBytes += entry.byteLength;
    entries.push(entry);
  }
  entries.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  return Object.freeze(entries);
}

function packageSource(
  value: unknown,
  sourceFiles: readonly ToolcraftModelSourceFile[],
  limits: ToolcraftModelSourceBundleDescriptorLimits,
  budget: ModelSourceBundleDescriptorBudget,
): ToolcraftModelPackageSource {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return descriptorInvalid("Model source package origin must be an object.");
  }
  const kind = readDescriptorData(
    value as ModelSourceBundleDescriptorRecord,
    "kind",
    "package source kind",
  );
  if (kind === "selected-files") {
    readDescriptorRecord(value, ["kind"], "selected-files package source");
    return Object.freeze({ kind });
  }
  if (kind !== "zip") {
    return descriptorInvalid("Model source package kind is unsupported.");
  }
  const candidate = readDescriptorRecord(
    value,
    ["archive", "entries", "kind"],
    "ZIP package source",
  );
  const archive = readDescriptorArchiveSource(
    readDescriptorData(candidate, "archive", "archive source"),
    budget,
  );
  if (archive.byteLength > limits.maxSourceBytes) {
    return descriptorLimitExceeded(
      "Model source archive exceeds its persisted byte limit.",
    );
  }
  const entries = packageEntries(
    readDescriptorData(candidate, "entries", "ZIP manifest entries"),
    limits,
    budget,
  );
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
  for (const file of sourceFiles) {
    const entry = entryByPath.get(file.path);
    if (
      !entry ||
      entry.byteLength !== file.byteLength ||
      entry.contentDigest !== file.contentDigest ||
      entry.mimeType !== file.mimeType
    ) {
      return descriptorInvalid(
        "Model source logical files do not match the ZIP manifest.",
      );
    }
  }
  return Object.freeze({ archive, entries, kind });
}

function packageDiagnostics(
  value: unknown,
  limits: ToolcraftModelSourceBundleDescriptorLimits,
  budget: ModelSourceBundleDescriptorBudget,
): readonly ToolcraftModelPackageDiagnostic[] {
  if (!Array.isArray(value) || value.length > 1) {
    return descriptorInvalid("Model package diagnostics are invalid.");
  }
  if (value.length === 0) return Object.freeze([]);
  const candidate = readDescriptorRecord(
    value[0],
    ["affectedCount", "code", "explanation", "severity"],
    "package diagnostic",
  );
  const affectedCount = readDescriptorInteger(
    readDescriptorData(candidate, "affectedCount", "diagnostic affected count"),
    "diagnostic affected count",
  );
  const code = readDescriptorBoundedString(
    readDescriptorData(candidate, "code", "diagnostic code"),
    "diagnostic code",
    budget,
    80,
  );
  const explanation = readDescriptorBoundedString(
    readDescriptorData(candidate, "explanation", "diagnostic explanation"),
    "diagnostic explanation",
    budget,
    512,
  );
  const severity = readDescriptorBoundedString(
    readDescriptorData(candidate, "severity", "diagnostic severity"),
    "diagnostic severity",
    budget,
    16,
  );
  if (
    affectedCount <= 0 ||
    affectedCount >= limits.maxArchiveEntries ||
    code !== "ignored-model-root" ||
    severity !== "info"
  ) {
    return descriptorInvalid("Model package diagnostic identity is invalid.");
  }
  return Object.freeze([
    Object.freeze({
      affectedCount,
      code,
      explanation,
      severity,
    }),
  ]);
}

function sourceFiles(
  value: unknown,
  limits: ToolcraftModelSourceBundleDescriptorLimits,
  budget: ModelSourceBundleDescriptorBudget,
): readonly ToolcraftModelSourceFile[] {
  if (!Array.isArray(value) || value.length === 0) {
    return descriptorInvalid(
      "Model source bundle descriptor sourceFiles must be non-empty.",
    );
  }
  if (value.length > limits.maxBundleFiles) {
    return descriptorLimitExceeded(
      "Model source bundle descriptor exceeds its source file limit.",
    );
  }
  const files: ToolcraftModelSourceFile[] = [];
  const paths = new Set<string>();
  let aggregateByteLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      return descriptorInvalid(
        "Model source bundle descriptor sourceFiles is sparse.",
      );
    }
    const file = readDescriptorSourceFile(value[index], budget);
    if (paths.has(file.path)) {
      return descriptorInvalid(
        "Model source bundle descriptor source paths must be unique.",
      );
    }
    if (aggregateByteLength > limits.maxSourceBytes - file.byteLength) {
      return descriptorLimitExceeded(
        "Model source bundle descriptor exceeds its aggregate source byte limit.",
      );
    }
    paths.add(file.path);
    aggregateByteLength += file.byteLength;
    files.push(file);
  }
  return Object.freeze(files);
}

export function snapshotModelSourceBundleDescriptorLimits(
  requested: Partial<ToolcraftModelSourceBundleDescriptorLimits> | undefined,
): ToolcraftModelSourceBundleDescriptorLimits {
  if (
    requested !== undefined &&
    (typeof requested !== "object" ||
      requested === null ||
      Array.isArray(requested))
  ) {
    return descriptorInvalid(
      "Model source bundle descriptor limits must be an object.",
    );
  }
  const allowed = [
    "maxArchiveEntries",
    "maxArchiveUncompressedBytes",
    "maxBundleFiles",
    "maxSourceBytes",
  ];
  const result = {
    maxArchiveEntries: TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS.maxArchiveEntries,
    maxArchiveUncompressedBytes:
      TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS.maxArchiveUncompressedBytes,
    maxBundleFiles: TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS.maxBundleFiles,
    maxSourceBytes: TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS.maxSourceBytes,
  };
  for (const key of Reflect.ownKeys(requested ?? {})) {
    if (typeof key !== "string" || !allowed.includes(key)) {
      return descriptorInvalid(
        "Model source bundle descriptor limit is unsupported.",
      );
    }
    const value = readDescriptorData(
      requested as ModelSourceBundleDescriptorRecord,
      key,
      `limit ${key}`,
    );
    const ceiling =
      TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS[
        key as keyof ToolcraftModelSourceBundleDescriptorLimits
      ];
    if (
      !Number.isSafeInteger(value) ||
      (value as number) <= 0 ||
      (value as number) > ceiling
    ) {
      return descriptorInvalid(
        `Model source bundle descriptor limit ${key} is invalid.`,
      );
    }
    result[key as keyof typeof result] = value as number;
  }
  return Object.freeze(result);
}

export function validateToolcraftModelSourceBundleDescriptor(
  value: unknown,
  limits: ToolcraftModelSourceBundleDescriptorLimits,
): ToolcraftModelSourceBundle {
  const candidate = readDescriptorRecord(
    value,
    [
      "adapter",
      "aggregateByteLength",
      "aggregateDigest",
      "rootPath",
      "sourceFiles",
      "descriptorVersion",
      "diagnostics",
      "packageSource",
    ],
    "payload",
  );
  const budget = createModelSourceBundleDescriptorBudget();
  const descriptorVersion = readDescriptorInteger(
    readDescriptorData(candidate, "descriptorVersion", "descriptor version"),
    "descriptor version",
  );
  if (descriptorVersion !== 2) {
    return descriptorInvalid(
      "Model source bundle descriptor version is unsupported.",
    );
  }
  const adapter = readDescriptorAdapter(
    readDescriptorData(candidate, "adapter", "adapter"),
    budget,
  );
  const aggregateByteLength = readDescriptorInteger(
    readDescriptorData(
      candidate,
      "aggregateByteLength",
      "aggregate byte length",
    ),
    "aggregate byte length",
  );
  const aggregateDigest = readDescriptorDigest(
    readDescriptorData(candidate, "aggregateDigest", "aggregate digest"),
    "aggregate digest",
    budget,
  );
  const rootPath = readDescriptorPath(
    readDescriptorData(candidate, "rootPath", "root path"),
    "root path",
    budget,
  );
  const files = sourceFiles(
    readDescriptorData(candidate, "sourceFiles", "source files"),
    limits,
    budget,
  );
  const source = packageSource(
    readDescriptorData(candidate, "packageSource", "package source"),
    files,
    limits,
    budget,
  );
  const diagnostics = packageDiagnostics(
    readDescriptorData(candidate, "diagnostics", "package diagnostics"),
    limits,
    budget,
  );
  const actualByteLength = files.reduce(
    (total, file) => total + file.byteLength,
    0,
  );
  if (
    actualByteLength !== aggregateByteLength ||
    !files.some(({ path }) => path === rootPath) ||
    sourceExtension(rootPath) !== adapter.rootExtension
  ) {
    return descriptorInvalid(
      "Model source bundle descriptor aggregate or root is invalid.",
    );
  }
  const actualDigest = digestModelSourceBundle(adapter, rootPath, files);
  if (actualDigest !== aggregateDigest) {
    return failModelSourceBundle(
      "bundle",
      "source-bundle-digest-mismatch",
      "Model source bundle descriptor digest does not match its metadata.",
    );
  }
  return Object.freeze({
    adapter,
    aggregateByteLength,
    aggregateDigest,
    descriptorVersion,
    diagnostics,
    packageSource: source,
    rootPath,
    sourceFiles: files,
  });
}
