import type { ToolcraftModelBounds } from "../canonical/model-document";
import { calculatePositionBounds } from "./model-topology-math";

export function regenerateAreaWeightedNormals(
  positions: Float32Array,
  indices: Uint32Array,
): Float32Array | undefined {
  const normals = new Float64Array(positions.length);
  let coordinateScale = 0;
  for (const value of positions) coordinateScale = Math.max(coordinateScale, Math.abs(value));
  if (coordinateScale === 0 || !Number.isFinite(coordinateScale)) return undefined;

  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset]!;
    const b = indices[offset + 1]!;
    const c = indices[offset + 2]!;
    const ax = positions[a * 3]! / coordinateScale;
    const ay = positions[a * 3 + 1]! / coordinateScale;
    const az = positions[a * 3 + 2]! / coordinateScale;
    const abx = positions[b * 3]! / coordinateScale - ax;
    const aby = positions[b * 3 + 1]! / coordinateScale - ay;
    const abz = positions[b * 3 + 2]! / coordinateScale - az;
    const acx = positions[c * 3]! / coordinateScale - ax;
    const acy = positions[c * 3 + 1]! / coordinateScale - ay;
    const acz = positions[c * 3 + 2]! / coordinateScale - az;
    const cross = [
      aby * acz - abz * acy,
      abz * acx - abx * acz,
      abx * acy - aby * acx,
    ] as const;
    for (const vertex of [a, b, c]) {
      normals[vertex * 3] += cross[0];
      normals[vertex * 3 + 1] += cross[1];
      normals[vertex * 3 + 2] += cross[2];
    }
  }

  const result = new Float32Array(positions.length);
  for (let offset = 0; offset < normals.length; offset += 3) {
    const x = normals[offset]!;
    const y = normals[offset + 1]!;
    const z = normals[offset + 2]!;
    const length = Math.hypot(x, y, z);
    if (length === 0 || !Number.isFinite(length)) return undefined;
    result[offset] = x / length;
    result[offset + 1] = y / length;
    result[offset + 2] = z / length;
  }
  return result;
}

export function calculateRequiredBounds(
  positions: Float32Array,
): ToolcraftModelBounds {
  const bounds = calculatePositionBounds(positions);
  if (bounds === undefined) {
    throw new Error("Repair produced positions without finite XYZ bounds.");
  }
  return bounds;
}
