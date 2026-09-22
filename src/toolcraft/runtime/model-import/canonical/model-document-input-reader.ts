import {
  modelDocumentFailure,
  type ToolcraftModelDocumentValidationFailure,
  type ToolcraftModelDocumentValidationFailureCode,
} from "./model-document-validation-result";

const modelDocumentInputFailures = new WeakSet<object>();

export class ToolcraftModelDocumentInputFailure extends Error {
  readonly failure: ToolcraftModelDocumentValidationFailure;

  constructor(failure: ToolcraftModelDocumentValidationFailure) {
    super(failure.message);
    this.name = "ToolcraftModelDocumentInputFailure";
    this.failure = failure;
    modelDocumentInputFailures.add(this);
  }
}

export function isToolcraftModelDocumentInputFailure(
  value: unknown,
): value is ToolcraftModelDocumentInputFailure {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    modelDocumentInputFailures.has(value)
  );
}

export function throwInputFailure(
  code: ToolcraftModelDocumentValidationFailureCode,
  path: string,
  message: string,
): never {
  throw new ToolcraftModelDocumentInputFailure(
    modelDocumentFailure(code, path, message),
  );
}

export function guardInputAccess<T>(
  path: string,
  operation: () => T,
): T {
  try {
    return operation();
  } catch (error) {
    if (isToolcraftModelDocumentInputFailure(error)) {
      throw error;
    }

    throwInputFailure(
      "input-access-failed",
      path,
      `Canonical input could not be inspected safely at ${path}.`,
    );
  }
}

export function safeArrayIsArray(value: unknown, path: string): boolean {
  return guardInputAccess(path, () => Array.isArray(value));
}

type OwnDataProperty =
  | { found: false }
  | { found: true; value: unknown };

export function readOwnDataProperty(
  value: object,
  property: PropertyKey,
  path: string,
): OwnDataProperty {
  const descriptor = guardInputAccess(path, () =>
    Object.getOwnPropertyDescriptor(value, property),
  );

  if (descriptor === undefined) {
    return { found: false };
  }

  if (!("value" in descriptor)) {
    throwInputFailure(
      "accessor-property",
      path,
      `Canonical input accessor at ${path} is not allowed.`,
    );
  }

  return { found: true, value: descriptor.value };
}

export function readOwnDataValue(
  value: object,
  property: PropertyKey,
  path: string,
): unknown {
  const result = readOwnDataProperty(value, property, path);
  return result.found ? result.value : undefined;
}

type SnapshotArrayOptions = {
  beforeAllocate?: (length: number) => void;
  limitCode?: ToolcraftModelDocumentValidationFailureCode;
  limitMessage?: string;
  maxLength?: number;
};

export function snapshotInputArray(
  value: unknown,
  path: string,
  transform: (entry: unknown, index: number) => unknown,
  options: SnapshotArrayOptions = {},
): unknown {
  if (!safeArrayIsArray(value, path)) {
    return value;
  }

  const lengthValue = readOwnDataValue(value as object, "length", `${path}.length`);
  if (!Number.isSafeInteger(lengthValue) || (lengthValue as number) < 0) {
    throwInputFailure(
      "input-access-failed",
      `${path}.length`,
      `${path}.length is not a safe array length.`,
    );
  }

  const length = lengthValue as number;
  if (options.maxLength !== undefined && length > options.maxLength) {
    throwInputFailure(
      options.limitCode ?? "max-references-exceeded",
      path,
      options.limitMessage ?? `${path} exceeds its protected length limit.`,
    );
  }

  options.beforeAllocate?.(length);
  const snapshot = new Array<unknown>(length);
  for (let index = 0; index < length; index += 1) {
    const entry = readOwnDataProperty(value as object, index, `${path}[${index}]`);
    if (entry.found) {
      snapshot[index] = transform(entry.value, index);
    }
  }

  return snapshot;
}

export function canSnapshotObject(value: unknown, path: string): value is object {
  return (
    value !== null &&
    typeof value === "object" &&
    !safeArrayIsArray(value, path)
  );
}
