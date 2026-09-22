import {
  guardInputAccess,
  throwInputFailure,
} from "./model-document-input-reader";

export type CanonicalTypedArrayKind =
  | "Float32Array"
  | "Uint32Array"
  | "Uint8Array";

type CanonicalTypedArrayByKind<Kind extends CanonicalTypedArrayKind> =
  Kind extends "Float32Array"
    ? Float32Array
    : Kind extends "Uint32Array"
      ? Uint32Array
      : Uint8Array;

export type CanonicalTypedArrayInspection<
  Kind extends CanonicalTypedArrayKind,
> = {
  buffer: ArrayBufferLike;
  byteOffset: number;
  kind: Kind;
  length: number;
  shared: boolean;
  source: object;
};

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const tagGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  Symbol.toStringTag,
)?.get;
const lengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "length",
)?.get;
const bufferGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "buffer",
)?.get;
const byteOffsetGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteOffset",
)?.get;
const typedArraySet = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "set",
)?.value as ((source: ArrayLike<number>, offset?: number) => void) | undefined;
const sharedBufferByteLengthGetter =
  typeof SharedArrayBuffer === "undefined"
    ? undefined
    : Object.getOwnPropertyDescriptor(
        SharedArrayBuffer.prototype,
        "byteLength",
      )?.get;

type IntrinsicResult =
  | { ok: false }
  | { ok: true; value: unknown };

function applyGetter(getter: (() => unknown) | undefined, value: unknown): IntrinsicResult {
  if (getter === undefined) {
    return { ok: false };
  }
  try {
    return { ok: true, value: Reflect.apply(getter, value, []) };
  } catch {
    return { ok: false };
  }
}

function isSharedBuffer(value: unknown): boolean {
  return applyGetter(sharedBufferByteLengthGetter, value).ok;
}

export function inspectCanonicalTypedArray<Kind extends CanonicalTypedArrayKind>(
  value: unknown,
  expectedKind: Kind,
): CanonicalTypedArrayInspection<Kind> | null {
  const tag = applyGetter(tagGetter, value);
  if (!tag.ok || tag.value !== expectedKind) {
    return null;
  }

  const length = applyGetter(lengthGetter, value);
  const buffer = applyGetter(bufferGetter, value);
  const byteOffset = applyGetter(byteOffsetGetter, value);
  if (
    !length.ok ||
    !Number.isSafeInteger(length.value) ||
    (length.value as number) < 0 ||
    !buffer.ok ||
    !byteOffset.ok ||
    !Number.isSafeInteger(byteOffset.value) ||
    (byteOffset.value as number) < 0
  ) {
    return null;
  }

  return {
    buffer: buffer.value as ArrayBufferLike,
    byteOffset: byteOffset.value as number,
    kind: expectedKind,
    length: length.value as number,
    shared: isSharedBuffer(buffer.value),
    source: value as object,
  };
}

export function copyCanonicalTypedArray<Kind extends CanonicalTypedArrayKind>(
  inspection: CanonicalTypedArrayInspection<Kind>,
): CanonicalTypedArrayByKind<Kind> {
  if (typedArraySet === undefined) {
    throw new Error("Typed-array copy intrinsic is unavailable.");
  }

  const copy = (
    inspection.kind === "Float32Array"
      ? new Float32Array(inspection.length)
      : inspection.kind === "Uint32Array"
        ? new Uint32Array(inspection.length)
        : new Uint8Array(inspection.length)
  ) as CanonicalTypedArrayByKind<Kind>;
  Reflect.apply(typedArraySet, copy, [inspection.source]);
  return copy;
}

export function createOwnedModelTypedArrayCopy<
  Kind extends "Float32Array" | "Uint32Array",
>(
  value: unknown,
  path: string,
  kind: Kind,
  beforeAllocate?: (byteLength: number) => void,
): { array: CanonicalTypedArrayByKind<Kind>; length: number } | null {
  const inspection = inspectCanonicalTypedArray(value, kind);
  if (inspection === null) {
    return null;
  }
  if (inspection.shared) {
    throwInputFailure(
      "shared-array-buffer-geometry",
      path,
      `${path} must not use SharedArrayBuffer-backed geometry.`,
    );
  }

  beforeAllocate?.(inspection.length * 4);
  const array = guardInputAccess(path, () =>
    copyCanonicalTypedArray(inspection),
  );
  return { array, length: inspection.length };
}
