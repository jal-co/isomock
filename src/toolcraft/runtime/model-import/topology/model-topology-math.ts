import type { ToolcraftModelBounds } from "../canonical/model-document";

export type TriangleIndices = readonly [number, number, number];

export function safeAdd(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
    return Number.MAX_SAFE_INTEGER;
  }
  if (left > Number.MAX_SAFE_INTEGER - right) {
    return Number.MAX_SAFE_INTEGER;
  }
  return left + right;
}

export function safeMultiply(left: number, right: number): number {
  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    left < 0 ||
    right < 0
  ) {
    return Number.MAX_SAFE_INTEGER;
  }
  if (left !== 0 && right > Math.floor(Number.MAX_SAFE_INTEGER / left)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return left * right;
}

export function calculatePositionBounds(
  positions: Float32Array,
): ToolcraftModelBounds | undefined {
  if (positions.length < 3 || positions.length % 3 !== 0) return undefined;
  const min: [number, number, number] = [
    positions[0]!, positions[1]!, positions[2]!,
  ];
  const max: [number, number, number] = [...min];
  if (!min.every(Number.isFinite)) return undefined;

  for (let offset = 3; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[offset + axis]!;
      if (!Number.isFinite(value)) return undefined;
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  return { max, min };
}

export function boundsEqual(
  left: unknown,
  right: ToolcraftModelBounds | undefined,
): boolean {
  if (right === undefined || left === null || typeof left !== "object") {
    return false;
  }
  const candidate = left as Partial<ToolcraftModelBounds>;
  return Array.isArray(candidate.min) && Array.isArray(candidate.max) &&
    candidate.min.length === 3 && candidate.max.length === 3 &&
    candidate.min.every((value, axis) => value === right.min[axis]) &&
    candidate.max.every((value, axis) => value === right.max[axis]);
}

export function aggregateBounds(
  bounds: readonly ToolcraftModelBounds[],
): ToolcraftModelBounds | undefined {
  if (bounds.length === 0) return undefined;
  const min: [number, number, number] = [...bounds[0]!.min];
  const max: [number, number, number] = [...bounds[0]!.max];
  for (const item of bounds.slice(1)) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], item.min[axis]);
      max[axis] = Math.max(max[axis], item.max[axis]);
    }
  }
  return { max, min };
}

export function triangleAreaVector(
  positions: Float32Array,
  [a, b, c]: TriangleIndices,
): readonly [number, number, number] {
  const rawAx = positions[a * 3]!;
  const rawAy = positions[a * 3 + 1]!;
  const rawAz = positions[a * 3 + 2]!;
  const rawBx = positions[b * 3]!;
  const rawBy = positions[b * 3 + 1]!;
  const rawBz = positions[b * 3 + 2]!;
  const rawCx = positions[c * 3]!;
  const rawCy = positions[c * 3 + 1]!;
  const rawCz = positions[c * 3 + 2]!;
  const scale = Math.max(
    Math.abs(rawAx), Math.abs(rawAy), Math.abs(rawAz),
    Math.abs(rawBx), Math.abs(rawBy), Math.abs(rawBz),
    Math.abs(rawCx), Math.abs(rawCy), Math.abs(rawCz),
  );
  if (scale === 0 || !Number.isFinite(scale)) return [0, 0, 0];
  const ax = rawAx / scale;
  const ay = rawAy / scale;
  const az = rawAz / scale;
  const abx = rawBx / scale - ax;
  const aby = rawBy / scale - ay;
  const abz = rawBz / scale - az;
  const acx = rawCx / scale - ax;
  const acy = rawCy / scale - ay;
  const acz = rawCz / scale - az;
  return [
    (aby * acz - abz * acy) * scale * scale,
    (abz * acx - abx * acz) * scale * scale,
    (abx * acy - aby * acx) * scale * scale,
  ];
}

export function isZeroAreaVector(
  vector: readonly [number, number, number],
): boolean {
  return vector[0] === 0 && vector[1] === 0 && vector[2] === 0;
}

export function edgeKey(a: number, b: number, vertexCount: number): number {
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  const key = min * vertexCount + max;
  if (!Number.isSafeInteger(key) || vertexCount <= 0) {
    throw new Error("Topology edge key exceeds safe integer bounds.");
  }
  return key;
}

export function sameWindingKey([a, b, c]: TriangleIndices): string {
  const rotations = [`${a}:${b}:${c}`, `${b}:${c}:${a}`, `${c}:${a}:${b}`];
  rotations.sort();
  return rotations[0]!;
}

export function unorderedTriangleKey([a, b, c]: TriangleIndices): string {
  const sorted = [a, b, c].sort((left, right) => left - right);
  return `${sorted[0]}:${sorted[1]}:${sorted[2]}`;
}
