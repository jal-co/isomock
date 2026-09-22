import { getToolcraftMaskSupport } from "./numerics";
import { TOOLCRAFT_MAX_MASKS, type EvaluatedToolcraftMasks, type EvaluatedToolcraftSoftEllipse, type ToolcraftMaskPoint } from "../contracts";

function smoothstep(lower: number, upper: number, value: number): number {
  if (lower === upper) return value <= lower ? 0 : 1;
  const t = Math.min(1, Math.max(0, (value - lower) / (upper - lower)));
  return t * t * (3 - 2 * t);
}

export function getToolcraftSoftEllipseCoverage(mask: EvaluatedToolcraftSoftEllipse, point: ToolcraftMaskPoint): number {
  if (!mask.enabled) return 0;
  const angle = mask.rotationDegrees * Math.PI / 180;
  const dx = point.x - mask.center.x;
  const dy = point.y - mask.center.y;
  const support = getToolcraftMaskSupport(mask);
  if (Math.abs(dx) > support || Math.abs(dy) > support) return 0;
  const x = Math.cos(angle) * dx + Math.sin(angle) * dy;
  const y = -Math.sin(angle) * dx + Math.cos(angle) * dy;
  const radius = Math.hypot(x / mask.radiusX, y / mask.radiusY);
  if (mask.edge.metric === "normalized-radius") {
    return mask.opacity * (mask.edge.width <= 1e-5 ? (radius <= 1 ? 1 : 0) : 1 - smoothstep(1 - mask.edge.width, 1 + mask.edge.width, radius));
  }
  // Cancel radius from the original gradient ratio, then normalize radii by their
  // major radius. This dimensionless denominator is >= 1, so no CSS-unit epsilon
  // can widen feather at large sizes or aspect ratios.
  const majorRadius = Math.max(mask.radiusX, mask.radiusY);
  const gradient = radius < 1e-4 ? 1 : Math.hypot(
    (x / mask.radiusX) / radius / (mask.radiusX / majorRadius),
    (y / mask.radiusY) / radius / (mask.radiusY / majorRadius),
  );
  const distance = radius < 1e-4 ? -Math.min(mask.radiusX, mask.radiusY) : (radius - 1) * majorRadius / gradient;
  return mask.opacity * (1 - smoothstep(-mask.edge.width, mask.edge.width, distance));
}

export function getToolcraftMasksCoverage(masks: EvaluatedToolcraftMasks, point: ToolcraftMaskPoint): number {
  if (masks.items.length > TOOLCRAFT_MAX_MASKS) throw new Error("Soft ellipse masks exceed the supported maximum of 16.");
  const active = masks.items.filter(item => item.enabled);
  if (!masks.enabled || active.length === 0) return 1;
  return 1 - active.reduce((outside, item) => outside * (1 - getToolcraftSoftEllipseCoverage(item, point)), 1);
}
