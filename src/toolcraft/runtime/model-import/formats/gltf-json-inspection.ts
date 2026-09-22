import {
  checkedGltfScale,
  checkedGltfTotal,
  gltfDecodeFailure,
} from "./gltf-decode-safety";

export type GltfJsonRecord = Record<string, unknown>;

export type GltfAccessorInfo = Readonly<{
  byteLength: number;
  componentType: number;
  count: number;
  normalized: boolean;
  record: GltfJsonRecord;
  type: string;
}>;

export type GltfBufferViewInfo = Readonly<{
  byteLength: number;
  byteOffset: number;
  byteStride?: number;
  meshoptCompressed: boolean;
  readBytes: () => Uint8Array;
}>;

export const GLTF_COMPONENT_BYTES: Readonly<Record<number, number>> = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
  5130: 8,
  5131: 2,
};

const ELEMENT_COMPONENTS: Readonly<Record<string, number>> = {
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
};

export function gltfJsonRecord(
  value: unknown,
  code: string,
  label: string,
): GltfJsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return gltfDecodeFailure("format", code, `${label} must be an object.`);
  }
  return value as GltfJsonRecord;
}

export function gltfJsonArray(
  value: unknown,
  code: string,
  label: string,
): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    return gltfDecodeFailure("format", code, `${label} must be an array.`);
  }
  return value;
}

export function gltfJsonInteger(
  value: unknown,
  code: string,
  label: string,
  minimum = 0,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    return gltfDecodeFailure(
      "format",
      code,
      `${label} must be a safe integer of at least ${minimum}.`,
    );
  }
  return value as number;
}

export function gltfJsonOptionalInteger(
  value: unknown,
  code: string,
  label: string,
): number {
  return value === undefined ? 0 : gltfJsonInteger(value, code, label);
}

export function gltfJsonIndexed<T>(
  values: readonly T[],
  value: unknown,
  code: string,
  label: string,
): T {
  const index = gltfJsonInteger(value, code, label);
  if (index >= values.length) {
    return gltfDecodeFailure("format", code, `${label} is out of range.`);
  }
  return values[index]!;
}

export function assertGltfByteRange(
  offset: number,
  byteLength: number,
  containerLength: number,
  code: string,
  label: string,
): void {
  if (byteLength < 0 || offset > containerLength - byteLength) {
    gltfDecodeFailure("format", code, `${label} exceeds its declared buffer.`);
  }
}

export function getGltfElementByteLength(
  componentType: number,
  type: string,
): number | undefined {
  const componentBytes = GLTF_COMPONENT_BYTES[componentType];
  const components = ELEMENT_COMPONENTS[type];
  if (!componentBytes || !components) return undefined;

  if (type === "MAT2" || type === "MAT3" || type === "MAT4") {
    const columns = Number(type.at(-1));
    const columnBytes = checkedGltfScale(
      columns,
      componentBytes,
      "decoded-byte-limit-exceeded",
    );
    const alignedColumnBytes = checkedGltfTotal(
      columnBytes,
      (4 - (columnBytes % 4)) % 4,
      Number.MAX_SAFE_INTEGER,
      "decoded-byte-limit-exceeded",
      "glTF matrix element",
    );
    return checkedGltfScale(
      columns,
      alignedColumnBytes,
      "decoded-byte-limit-exceeded",
    );
  }
  return checkedGltfScale(
    componentBytes,
    components,
    "decoded-byte-limit-exceeded",
  );
}
