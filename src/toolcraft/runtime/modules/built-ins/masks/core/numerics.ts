import type { EvaluatedToolcraftSoftEllipse } from "../contracts";

// Float32 renderers may flush subnormal uniforms to zero. Leave arithmetic
// headroom for rounding and the squares used by GLSL length().
const minimumNormal = 2 ** -126;
const maximum = (2 - 2 ** -23) * 2 ** 127;
const margin = 16;

/** Conservative support in local pixels, derived from the ellipse and feather.
 * Beyond it coverage is exactly zero, so kernels can cull before division.
 * For distance falloff: gradient <= major/minor, hence d >= (g-1)*minor.
 */
export function getToolcraftMaskSupport(mask: EvaluatedToolcraftSoftEllipse): number {
  const minor = Math.min(mask.radiusX, mask.radiusY);
  const major = Math.max(mask.radiusX, mask.radiusY);
  const support = major * (1 + (mask.edge.metric === "ellipse-distance" ? mask.edge.width / minor : mask.edge.width));
  const scalars = [mask.center.x, mask.center.y, minor, major, mask.rotationDegrees, mask.opacity, mask.edge.width];
  // Inside the support square, rotation has norm <= sqrt(2)*support. These
  // conservative bounds cover division, length squares and distance numerator.
  const normalized = 2 * support / minor;
  const gradient = major / minor;
  const intermediates = [support, 2 * support, 2 * normalized * normalized,
    2 * gradient * gradient, (normalized + 1) * major, 2 * mask.edge.width];
  if (!scalars.every(value => Number.isFinite(Math.fround(value))) ||
      minor < minimumNormal * margin ||
      mask.edge.width < 0 ||
      (mask.edge.metric === "ellipse-distance" && mask.edge.width > 0 && mask.edge.width < minimumNormal * margin) ||
      intermediates.some(value => !Number.isFinite(value) || value > maximum / margin)) {
    throw new Error("Mask geometry cannot be represented by the shared Float32 rendering contract.");
  }
  return support;
}
