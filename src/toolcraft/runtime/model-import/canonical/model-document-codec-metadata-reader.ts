import type { ToolcraftModelBounds } from "./model-document";
import { throwModelDocumentCodecError } from "./model-document-codec-error";
import { isDenseArray, isRecord } from "./model-document-validation-helpers";

export type ModelDocumentArraySliceMetadata = Readonly<{
  count: number;
  offset: number;
}>;

export function metadataShape(path: string, message: string): never {
  throwModelDocumentCodecError("invalid-metadata-shape", path, message);
}

export function readString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    metadataShape(path, `${path} must be a string.`);
  }
  return value;
}

export function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    metadataShape(path, `${path} must be a boolean.`);
  }
  return value;
}

export function readNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    metadataShape(path, `${path} must be a finite number.`);
  }
  return value;
}

export function readStringLiteral<const Values extends readonly string[]>(
  value: unknown,
  path: string,
  allowed: Values,
): Values[number] {
  const text = readString(value, path);
  for (const candidate of allowed) {
    if (text === candidate) return candidate;
  }
  metadataShape(path, `${path} has an unsupported value.`);
}

export function readNumberLiteral<const Values extends readonly number[]>(
  value: unknown,
  path: string,
  allowed: Values,
): Values[number] {
  const number = readNumber(value, path);
  for (const candidate of allowed) {
    if (number === candidate) return candidate;
  }
  metadataShape(path, `${path} has an unsupported value.`);
}

export function readStringArray(
  value: unknown,
  path: string,
): readonly string[] {
  if (!isDenseArray(value)) {
    metadataShape(path, `${path} must be a dense array.`);
  }
  return value.map((entry, index) => readString(entry, `${path}[${index}]`));
}

export function readStringLiteralArray<
  const Values extends readonly string[],
>(
  value: unknown,
  path: string,
  allowed: Values,
): readonly Values[number][] {
  if (!isDenseArray(value)) {
    metadataShape(path, `${path} must be a dense array.`);
  }
  return value.map((entry, index) =>
    readStringLiteral(entry, `${path}[${index}]`, allowed)
  );
}

export function readNumberArray(
  value: unknown,
  path: string,
): readonly number[] {
  if (!isDenseArray(value)) {
    metadataShape(path, `${path} must be a dense array.`);
  }
  return value.map((entry, index) => readNumber(entry, `${path}[${index}]`));
}

export function readFixedNumberArray(
  value: unknown,
  path: string,
  length: number,
): readonly number[] {
  if (!Array.isArray(value) || value.length !== length) {
    metadataShape(path, `${path} must contain exactly ${length} values.`);
  }
  return readNumberArray(value, path);
}

export function readBounds(
  value: unknown,
  path: string,
): ToolcraftModelBounds {
  if (!isRecord(value)) {
    metadataShape(path, `${path} must be an object.`);
  }
  const max = readFixedNumberArray(value.max, `${path}.max`, 3);
  const min = readFixedNumberArray(value.min, `${path}.min`, 3);
  return {
    max: [max[0]!, max[1]!, max[2]!],
    min: [min[0]!, min[1]!, min[2]!],
  };
}

export function readSafeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throwModelDocumentCodecError(
      "unsafe-metadata-integer",
      path,
      `${path} must be a nonnegative safe integer.`,
    );
  }
  return value;
}

export function readSlice(
  value: unknown,
  path: string,
): ModelDocumentArraySliceMetadata {
  if (!isRecord(value)) {
    metadataShape(path, `${path} must be an array slice object.`);
  }
  return {
    count: readSafeInteger(value.count, `${path}.count`),
    offset: readSafeInteger(value.offset, `${path}.offset`),
  };
}
