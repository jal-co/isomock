import type { ToolcraftModelDocument } from "../canonical/model-document";
import { bytesToHex, sha256 } from "../canonical/sha256";

const encoder = new TextEncoder();

function float32Bytes(values: Float32Array): Uint8Array {
  const bytes = new Uint8Array(values.length * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) {
    view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, values[index]!, true);
  }
  return bytes;
}

function uint32Bytes(values: Uint32Array): Uint8Array {
  const bytes = new Uint8Array(values.length * Uint32Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) {
    view.setUint32(index * Uint32Array.BYTES_PER_ELEMENT, values[index]!, true);
  }
  return bytes;
}

function digestParts(parts: readonly Uint8Array[]): string {
  let byteLength = 0;
  for (const part of parts) byteLength += 8 + part.byteLength;
  const joined = new Uint8Array(byteLength);
  const lengths = new DataView(joined.buffer);
  let offset = 0;
  for (const part of parts) {
    lengths.setBigUint64(offset, BigInt(part.byteLength), true);
    offset += 8;
    joined.set(part, offset);
    offset += part.byteLength;
  }
  return `sha256:${bytesToHex(sha256(joined))}`;
}

function canonicalJsonValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalJsonValue(entry));
  }
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return Array.from(value as unknown as ArrayLike<number>, (entry) =>
      canonicalJsonValue(entry)
    );
  }
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      if (
        entry === undefined ||
        typeof entry === "function" ||
        typeof entry === "symbol"
      ) {
        continue;
      }
      result[key] = canonicalJsonValue(entry);
    }
    return result;
  }
  return null;
}

export function digestToolcraftTopologyDocument(
  document: ToolcraftModelDocument,
): string {
  const metadata = {
    bounds: document.bounds,
    nodes: document.nodes,
    primitives: document.primitives.map((primitive) => ({
      bounds: primitive.bounds,
      id: primitive.id,
      indexLength: primitive.indices?.length ?? -1,
      normalLength: primitive.normals?.length ?? -1,
      positionLength: primitive.positions?.length ?? -1,
    })),
    provenance: {
      operations: document.provenance.operations,
      sourceFormat: document.provenance.sourceFormat,
    },
    rootNodeIds: document.rootNodeIds,
  };
  const parts: Uint8Array[] = [encoder.encode(JSON.stringify(metadata))];
  for (const primitive of document.primitives) {
    parts.push(
      primitive.positions instanceof Float32Array
        ? float32Bytes(primitive.positions)
        : encoder.encode("invalid-positions"),
      primitive.indices instanceof Uint32Array
        ? uint32Bytes(primitive.indices)
        : encoder.encode("invalid-indices"),
      primitive.normals instanceof Float32Array
        ? float32Bytes(primitive.normals)
        : encoder.encode("missing-or-invalid-normals"),
    );
  }
  return digestParts(parts);
}

export function digestToolcraftRepairPlanPayload(payload: unknown): string {
  return digestParts([
    encoder.encode(JSON.stringify(canonicalJsonValue(payload))),
  ]);
}
