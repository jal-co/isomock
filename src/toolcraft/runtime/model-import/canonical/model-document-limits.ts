import type { ToolcraftModelImportLimits } from "../../schema/types";
import {
  TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS,
  isValidToolcraftModelImportLimitValue,
} from "../model-import-limit-values";

export type ToolcraftCanonicalModelLimits = Pick<
  ToolcraftModelImportLimits,
  | "maxDecodedBytes"
  | "maxEstimatedWorkerBytes"
  | "maxNodes"
  | "maxPrimitives"
  | "maxTriangles"
  | "maxTextureCount"
  | "maxTextureDimension"
  | "maxTexturePixels"
  | "maxVertices"
>;

const canonicalLimitNames = Object.freeze([
  "maxDecodedBytes",
  "maxEstimatedWorkerBytes",
  "maxNodes",
  "maxPrimitives",
  "maxTriangles",
  "maxTextureCount",
  "maxTextureDimension",
  "maxTexturePixels",
  "maxVertices",
] as const satisfies readonly (keyof ToolcraftCanonicalModelLimits)[]);
const importLimitNames = Object.keys(
  TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS,
) as (keyof ToolcraftModelImportLimits)[];
const importLimitNameSet: ReadonlySet<string> = new Set(importLimitNames);
const canonicalLimitErrors = new WeakSet<object>();

export class ToolcraftCanonicalModelLimitError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(message);
    this.name = "ToolcraftCanonicalModelLimitError";
    this.path = path;
    canonicalLimitErrors.add(this);
  }
}

export function isToolcraftCanonicalModelLimitError(
  value: unknown,
): value is ToolcraftCanonicalModelLimitError {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    canonicalLimitErrors.has(value)
  );
}

function limitFailure(path: string, message: string): never {
  throw new ToolcraftCanonicalModelLimitError(path, message);
}

function ownKeys(value: object): readonly PropertyKey[] {
  try {
    return Reflect.ownKeys(value);
  } catch {
    limitFailure(
      "limits",
      "Canonical model limit options could not be inspected safely.",
    );
  }
}

function isArray(value: unknown): boolean {
  try {
    return Array.isArray(value);
  } catch {
    limitFailure(
      "limits",
      "Canonical model limit options could not be inspected safely.",
    );
  }
}

function ownDescriptor(
  value: object,
  key: PropertyKey,
  path: string,
): PropertyDescriptor {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, key);
  } catch {
    limitFailure(path, `${path} could not be inspected safely.`);
  }
  if (descriptor === undefined || !("value" in descriptor)) {
    limitFailure(path, `${path} must be an own data property.`);
  }
  return descriptor;
}

function readStrictLimits(
  requested: Partial<ToolcraftModelImportLimits> | undefined,
): ReadonlyMap<keyof ToolcraftModelImportLimits, number> {
  if (requested === undefined) {
    return new Map();
  }
  if (
    requested === null ||
    typeof requested !== "object" ||
    isArray(requested)
  ) {
    limitFailure("limits", "Canonical model limit options must be an object.");
  }

  const values = new Map<keyof ToolcraftModelImportLimits, number>();
  for (const key of ownKeys(requested)) {
    const path = typeof key === "string" ? `limits.${key}` : "limits";
    if (typeof key !== "string" || !importLimitNameSet.has(key)) {
      limitFailure(path, `${path} is not a supported model import limit.`);
    }

    const limitName = key as keyof ToolcraftModelImportLimits;
    const value = ownDescriptor(requested, key, path).value as unknown;
    const ceiling = TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS[limitName];
    if (!isValidToolcraftModelImportLimitValue(limitName, value)) {
      limitFailure(
        path,
        limitName === "maxArchiveCompressionRatio"
          ? `${path} must be finite and at least 1.`
          : `${path} must be a finite positive safe integer.`,
      );
    }
    if (value > ceiling) {
      limitFailure(path, `${path} exceeds protected ceiling ${ceiling}.`);
    }
    values.set(limitName, value);
  }
  return values;
}

export function resolveToolcraftCanonicalModelLimits(
  requested?: Partial<ToolcraftModelImportLimits>,
): ToolcraftCanonicalModelLimits {
  const values = readStrictLimits(requested);
  const resolved = {} as Record<keyof ToolcraftCanonicalModelLimits, number>;
  for (const name of canonicalLimitNames) {
    resolved[name] =
      values.get(name) ?? TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS[name];
  }
  return resolved;
}
