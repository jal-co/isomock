import type { ToolcraftModelImportLimits } from "../schema/types";
import {
  TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS,
  TOOLCRAFT_MODEL_IMPORT_LIMIT_NAMES,
  isValidToolcraftModelImportLimitValue,
} from "./model-import-limit-values";
import { failModelSourceBundle } from "./model-source-bundle-error";

export type ModelSourceBundleLimits = Pick<
  ToolcraftModelImportLimits,
  | "maxArchiveCompressionRatio"
  | "maxArchiveEntries"
  | "maxArchiveEntryBytes"
  | "maxArchivePathLength"
  | "maxArchiveUncompressedBytes"
  | "maxBundleFiles"
  | "maxDecodedBytes"
  | "maxEstimatedWorkerBytes"
  | "maxSourceBytes"
>;

const LIMIT_NAME_SET: ReadonlySet<string> = new Set(
  TOOLCRAFT_MODEL_IMPORT_LIMIT_NAMES,
);

function invalidLimit(message: string): never {
  return failModelSourceBundle(
    "resource-limit",
    "invalid-model-limit",
    message,
  );
}

export function snapshotModelSourceBundleLimits(
  requested: Partial<ToolcraftModelImportLimits> | undefined,
): ModelSourceBundleLimits {
  if (
    requested !== undefined &&
    (requested === null ||
      typeof requested !== "object" ||
      Array.isArray(requested))
  ) {
    return invalidLimit("Model import limits must be an object.");
  }

  const values: ToolcraftModelImportLimits = {
    ...TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS,
  };
  for (const key of Reflect.ownKeys(requested ?? {})) {
    if (typeof key !== "string" || !LIMIT_NAME_SET.has(key)) {
      return invalidLimit(
        `Model import limit "${String(key)}" is unsupported.`,
      );
    }
    const limitName = key as keyof ToolcraftModelImportLimits;
    const descriptor = Object.getOwnPropertyDescriptor(requested, key);
    if (!descriptor || !("value" in descriptor)) {
      return invalidLimit(`Model import limit ${key} must be a data property.`);
    }
    const value = descriptor.value as unknown;
    const ceiling = TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS[limitName];
    if (
      !isValidToolcraftModelImportLimitValue(limitName, value) ||
      value > ceiling
    ) {
      return invalidLimit(
        limitName === "maxArchiveCompressionRatio"
          ? `Model import limit ${key} must be finite, at least 1, and no greater than ${ceiling}.`
          : `Model import limit ${key} must be a positive safe integer no greater than ${ceiling}.`,
      );
    }
    values[limitName] = value;
  }

  return Object.freeze({
    maxArchiveCompressionRatio: values.maxArchiveCompressionRatio,
    maxArchiveEntries: values.maxArchiveEntries,
    maxArchiveEntryBytes: values.maxArchiveEntryBytes,
    maxArchivePathLength: values.maxArchivePathLength,
    maxArchiveUncompressedBytes: values.maxArchiveUncompressedBytes,
    maxBundleFiles: values.maxBundleFiles,
    maxDecodedBytes: values.maxDecodedBytes,
    maxEstimatedWorkerBytes: values.maxEstimatedWorkerBytes,
    maxSourceBytes: values.maxSourceBytes,
  });
}

export function checkedSourceByteTotal(
  current: number,
  additional: number,
  limit: number,
  code: "decoded-byte-limit-exceeded" | "source-byte-limit-exceeded",
): number {
  if (
    !Number.isSafeInteger(additional) ||
    additional < 0 ||
    current > limit - additional
  ) {
    return failModelSourceBundle(
      "resource-limit",
      code,
      code === "source-byte-limit-exceeded"
        ? `The selected source files exceed the ${limit}-byte source limit.`
        : `The model's decoded resources exceed the ${limit}-byte decoded limit.`,
    );
  }
  return current + additional;
}
