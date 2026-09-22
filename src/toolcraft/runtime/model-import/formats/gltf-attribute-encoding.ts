import type { GltfAccessorInfo } from "./gltf-json-inspection";
import { gltfDecodeFailure } from "./gltf-decode-safety";

function isRequired(
  extensions: ReadonlySet<string>,
  extensionName: string,
): boolean {
  return extensions.has(extensionName);
}

function isSupportedFloatEncoding(
  accessor: GltfAccessorInfo,
  requiredExtensions: ReadonlySet<string>,
): boolean {
  if (accessor.normalized) return false;
  if (accessor.componentType === 5126) return true;
  if (accessor.componentType === 5131) {
    return isRequired(requiredExtensions, "KHR_accessor_float16");
  }
  if (accessor.componentType === 5130) {
    return isRequired(requiredExtensions, "KHR_accessor_float64");
  }
  return false;
}

export function validateGltfPositionEncoding(
  accessor: GltfAccessorInfo,
  requiredExtensions: ReadonlySet<string>,
): void {
  const quantized =
    isRequired(requiredExtensions, "KHR_mesh_quantization") &&
    [5120, 5121, 5122, 5123].includes(accessor.componentType);
  if (
    accessor.type !== "VEC3" ||
    (!isSupportedFloatEncoding(accessor, requiredExtensions) && !quantized)
  ) {
    return gltfDecodeFailure(
      "geometry",
      "invalid-position-accessor",
      "POSITION must be VEC3 FLOAT, required float16/float64, or an allowed KHR_mesh_quantization integer encoding.",
    );
  }
}

export function validateGltfNormalEncoding(
  accessor: GltfAccessorInfo,
  positionCount: number,
  requiredExtensions: ReadonlySet<string>,
): void {
  const quantized =
    isRequired(requiredExtensions, "KHR_mesh_quantization") &&
    accessor.normalized &&
    [5120, 5122].includes(accessor.componentType);
  if (
    accessor.type !== "VEC3" ||
    accessor.count !== positionCount ||
    (!isSupportedFloatEncoding(accessor, requiredExtensions) && !quantized)
  ) {
    return gltfDecodeFailure(
      "geometry",
      "invalid-normal-accessor",
      "NORMAL must match POSITION count and use VEC3 FLOAT or normalized signed BYTE/SHORT with required KHR_mesh_quantization.",
    );
  }
}
