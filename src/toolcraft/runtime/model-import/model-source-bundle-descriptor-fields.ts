import type { ToolcraftModelFormat } from "../schema/types";
import { getToolcraftProductionModelFormatManifestEntry } from "./formats/production-model-format-manifest";
import type {
  ToolcraftModelArchiveSource,
  ToolcraftModelPackageEntryDescriptor,
  ToolcraftModelSourceBundle,
  ToolcraftModelSourceFile,
} from "./model-import-types";
import { failModelSourceBundle } from "./model-source-bundle-error";
import { createModelSourceResourceRef } from "./model-source-digest";

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const DRIVE_PATH_PATTERN = /^[a-z]:/iu;
const BOUNDED_TEXT_CODE_UNITS = 1_048_576;
const MAX_SHORT_TEXT_CODE_UNITS = 1_024;

export type ModelSourceBundleDescriptorBudget = {
  textCodeUnits: number;
};
export type ModelSourceBundleDescriptorRecord = Record<string, unknown>;

export function createModelSourceBundleDescriptorBudget():
ModelSourceBundleDescriptorBudget {
  return { textCodeUnits: BOUNDED_TEXT_CODE_UNITS };
}

export function descriptorInvalid(message: string): never {
  return failModelSourceBundle(
    "bundle",
    "source-bundle-descriptor-invalid",
    message,
  );
}

export function descriptorLimitExceeded(message: string): never {
  return failModelSourceBundle(
    "resource-limit",
    "source-bundle-descriptor-limit-exceeded",
    message,
  );
}

export function readDescriptorRecord(
  value: unknown,
  fields: readonly string[],
  label: string,
): ModelSourceBundleDescriptorRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return descriptorInvalid(
      `Model source bundle descriptor ${label} must be an object.`,
    );
  }
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return descriptorInvalid(
      `Model source bundle descriptor ${label} cannot be inspected.`,
    );
  }
  if (
    keys.length !== fields.length ||
    keys.some((key) => typeof key !== "string" || !fields.includes(key))
  ) {
    return descriptorInvalid(
      `Model source bundle descriptor ${label} has missing or unsupported fields.`,
    );
  }
  return value as ModelSourceBundleDescriptorRecord;
}

export function readDescriptorData(
  record: ModelSourceBundleDescriptorRecord,
  field: string,
  label: string,
): unknown {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(record, field);
  } catch {
    return descriptorInvalid(
      `Model source bundle descriptor ${label} cannot be inspected.`,
    );
  }
  if (!descriptor || !("value" in descriptor)) {
    return descriptorInvalid(
      `Model source bundle descriptor ${label} must be data.`,
    );
  }
  return descriptor.value;
}

export function readDescriptorBoundedString(
  value: unknown,
  label: string,
  budget: ModelSourceBundleDescriptorBudget,
  maximum = BOUNDED_TEXT_CODE_UNITS,
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value.includes("\0") ||
    value.length > budget.textCodeUnits
  ) {
    return descriptorInvalid(
      `Model source bundle descriptor ${label} is invalid.`,
    );
  }
  budget.textCodeUnits -= value.length;
  return value;
}

export function readDescriptorDigest(
  value: unknown,
  label: string,
  budget: ModelSourceBundleDescriptorBudget,
): string {
  const result = readDescriptorBoundedString(value, label, budget, 71);
  return DIGEST_PATTERN.test(result)
    ? result
    : descriptorInvalid(
        `Model source bundle descriptor ${label} is not a SHA-256 digest.`,
      );
}

export function readDescriptorInteger(
  value: unknown,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    return descriptorInvalid(
      `Model source bundle descriptor ${label} must be a non-negative safe integer.`,
    );
  }
  return value as number;
}

export function readDescriptorPath(
  value: unknown,
  label: string,
  budget: ModelSourceBundleDescriptorBudget,
): string {
  const path = readDescriptorBoundedString(value, label, budget);
  const segments = path.split("/");
  if (
    path !== path.normalize("NFC") ||
    path.startsWith("/") ||
    path.includes("\\") ||
    DRIVE_PATH_PATTERN.test(path) ||
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    return descriptorInvalid(
      `Model source bundle descriptor ${label} is not normalized.`,
    );
  }
  return path;
}

export function readDescriptorAdapter(
  value: unknown,
  budget: ModelSourceBundleDescriptorBudget,
): ToolcraftModelSourceBundle["adapter"] {
  const candidate = readDescriptorRecord(
    value,
    ["adapterVersion", "format", "rootExtension"],
    "adapter",
  );
  const adapterVersion = readDescriptorBoundedString(
    readDescriptorData(candidate, "adapterVersion", "adapter version"),
    "adapter version",
    budget,
    MAX_SHORT_TEXT_CODE_UNITS,
  );
  const format = readDescriptorBoundedString(
    readDescriptorData(candidate, "format", "format"),
    "format",
    budget,
    4,
  );
  const rootExtension = readDescriptorBoundedString(
    readDescriptorData(candidate, "rootExtension", "root extension"),
    "root extension",
    budget,
    32,
  );
  const manifestEntry = getToolcraftProductionModelFormatManifestEntry(format);
  if (
    adapterVersion.trim() !== adapterVersion ||
    rootExtension !== rootExtension.toLowerCase() ||
    !/^\.[a-z0-9][a-z0-9.+_-]*$/u.test(rootExtension) ||
    manifestEntry === undefined ||
    manifestEntry.adapterVersion !== adapterVersion ||
    !manifestEntry.extensions.includes(rootExtension)
  ) {
    return descriptorInvalid(
      "Model source bundle descriptor adapter identity is invalid.",
    );
  }
  return Object.freeze({
    adapterVersion,
    format: format as ToolcraftModelFormat,
    rootExtension,
  });
}

export function readDescriptorSourceFile(
  value: unknown,
  budget: ModelSourceBundleDescriptorBudget,
): ToolcraftModelSourceFile {
  const candidate = readDescriptorRecord(value, [
    "byteLength",
    "contentDigest",
    "displayName",
    "mimeType",
    "path",
    "resourceRef",
  ], "source file");
  const byteLength = readDescriptorInteger(
    readDescriptorData(candidate, "byteLength", "source byte length"),
    "source byte length",
  );
  const contentDigest = readDescriptorDigest(
    readDescriptorData(candidate, "contentDigest", "source content digest"),
    "source content digest",
    budget,
  );
  const displayName = readDescriptorBoundedString(
    readDescriptorData(candidate, "displayName", "source display name"),
    "source display name",
    budget,
  );
  const mimeType = readDescriptorBoundedString(
    readDescriptorData(candidate, "mimeType", "source MIME type"),
    "source MIME type",
    budget,
    MAX_SHORT_TEXT_CODE_UNITS,
  );
  const path = readDescriptorPath(
    readDescriptorData(candidate, "path", "source path"),
    "source path",
    budget,
  );
  const resourceRef = readDescriptorBoundedString(
    readDescriptorData(candidate, "resourceRef", "source resource ref"),
    "source resource ref",
    budget,
    256,
  );
  const pathName = path.slice(path.lastIndexOf("/") + 1);
  if (
    displayName === "." ||
    displayName === ".." ||
    displayName.includes("/") ||
    displayName.includes("\\") ||
    displayName.normalize("NFC") !== pathName ||
    mimeType.trim() !== mimeType ||
    resourceRef !== createModelSourceResourceRef(contentDigest, mimeType)
  ) {
    return descriptorInvalid(
      "Model source bundle descriptor source identity is invalid.",
    );
  }
  return Object.freeze({
    byteLength,
    contentDigest,
    displayName,
    mimeType,
    path,
    resourceRef,
  });
}

export function readDescriptorArchiveSource(
  value: unknown,
  budget: ModelSourceBundleDescriptorBudget,
): ToolcraftModelArchiveSource {
  const candidate = readDescriptorRecord(value, [
    "byteLength",
    "contentDigest",
    "displayName",
    "mimeType",
    "resourceRef",
  ], "archive source");
  const byteLength = readDescriptorInteger(
    readDescriptorData(candidate, "byteLength", "archive byte length"),
    "archive byte length",
  );
  const contentDigest = readDescriptorDigest(
    readDescriptorData(candidate, "contentDigest", "archive content digest"),
    "archive content digest",
    budget,
  );
  const displayName = readDescriptorBoundedString(
    readDescriptorData(candidate, "displayName", "archive display name"),
    "archive display name",
    budget,
    MAX_SHORT_TEXT_CODE_UNITS,
  );
  const mimeType = readDescriptorBoundedString(
    readDescriptorData(candidate, "mimeType", "archive MIME type"),
    "archive MIME type",
    budget,
    MAX_SHORT_TEXT_CODE_UNITS,
  );
  const resourceRef = readDescriptorBoundedString(
    readDescriptorData(candidate, "resourceRef", "archive resource ref"),
    "archive resource ref",
    budget,
    256,
  );
  if (
    byteLength <= 0 ||
    displayName === "." ||
    displayName === ".." ||
    displayName.includes("/") ||
    displayName.includes("\\") ||
    displayName.normalize("NFC") !== displayName ||
    mimeType !== "application/zip" ||
    resourceRef !== createModelSourceResourceRef(contentDigest, mimeType)
  ) {
    return descriptorInvalid(
      "Model source bundle descriptor archive identity is invalid.",
    );
  }
  return Object.freeze({
    byteLength,
    contentDigest,
    displayName,
    mimeType,
    resourceRef,
  });
}

export function readDescriptorPackageEntry(
  value: unknown,
  budget: ModelSourceBundleDescriptorBudget,
): ToolcraftModelPackageEntryDescriptor {
  const candidate = readDescriptorRecord(value, [
    "byteLength",
    "contentDigest",
    "mimeType",
    "path",
  ], "package entry");
  return Object.freeze({
    byteLength: readDescriptorInteger(
      readDescriptorData(candidate, "byteLength", "package entry byte length"),
      "package entry byte length",
    ),
    contentDigest: readDescriptorDigest(
      readDescriptorData(candidate, "contentDigest", "package entry digest"),
      "package entry digest",
      budget,
    ),
    mimeType: readDescriptorBoundedString(
      readDescriptorData(candidate, "mimeType", "package entry MIME type"),
      "package entry MIME type",
      budget,
      MAX_SHORT_TEXT_CODE_UNITS,
    ),
    path: readDescriptorPath(
      readDescriptorData(candidate, "path", "package entry path"),
      "package entry path",
      budget,
    ),
  });
}
