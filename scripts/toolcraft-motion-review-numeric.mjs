export const TOOLCRAFT_MOTION_RELATIVE_TOLERANCE = 1e-9;

function requireFinite(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be finite`);
  }
}

function saturatedSign(left, right) {
  return Math.sign(left) * Math.sign(right) < 0
    ? -Number.MAX_VALUE
    : Number.MAX_VALUE;
}

export function toolcraftMotionAbsoluteDifference(left, right) {
  requireFinite(left, "absolute difference left operand");
  requireFinite(right, "absolute difference right operand");
  const difference = Math.abs(left - right);
  return Number.isFinite(difference) ? difference : Number.MAX_VALUE;
}

export function toolcraftMotionSafeAdd(left, right) {
  requireFinite(left, "addition left operand");
  requireFinite(right, "addition right operand");
  const sum = left + right;
  if (Number.isFinite(sum)) return sum;
  return left < 0 && right < 0 ? -Number.MAX_VALUE : Number.MAX_VALUE;
}

export function toolcraftMotionSafeMultiply(left, right) {
  requireFinite(left, "multiplication left operand");
  requireFinite(right, "multiplication right operand");
  const product = left * right;
  return Number.isFinite(product) ? product : saturatedSign(left, right);
}

export function toolcraftMotionSafeMidpoint(left, right) {
  requireFinite(left, "midpoint left operand");
  requireFinite(right, "midpoint right operand");
  const sum = left + right;
  return Number.isFinite(sum) ? sum / 2 : left / 2 + right / 2;
}

export function toolcraftMotionNearlyEqual(left, right) {
  requireFinite(left, "relative equality left operand");
  requireFinite(right, "relative equality right operand");
  if (left === right) return true;
  const scale = Math.max(Math.abs(left), Math.abs(right));
  return toolcraftMotionAbsoluteDifference(left, right) <=
    TOOLCRAFT_MOTION_RELATIVE_TOLERANCE * scale;
}

export function toolcraftMotionMedian(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError("median values must be a nonempty array");
  }
  values.forEach((value) => requireFinite(value, "median value"));
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? toolcraftMotionSafeMidpoint(sorted[middle - 1], sorted[middle])
    : sorted[middle];
}

export function toolcraftMotionRobustThreshold(scores) {
  const center = toolcraftMotionMedian(scores);
  const deviations = scores.map((score) =>
    toolcraftMotionAbsoluteDifference(score, center));
  const spread = toolcraftMotionMedian(deviations);
  return toolcraftMotionSafeAdd(
    center,
    toolcraftMotionSafeMultiply(3, spread),
  );
}
