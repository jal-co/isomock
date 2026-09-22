/** Pure normalized curve math shared by control diagrams and product renderers. */
export type CurvePoint = { x: number; y: number };
export type CurveInterpolation = "monotone" | "smooth";
export type CurveEvaluator = (x: number) => number;

export function clampCurveValue(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Coincident inputs have one output: the last authored point wins. */
export function normalizeCurvePoints(points: readonly CurvePoint[]): CurvePoint[] {
  const byX = new Map<number, CurvePoint>();
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new RangeError("Curve points must have finite coordinates.");
    }
    const x = clampCurveValue(point.x);
    byX.set(x, { x, y: clampCurveValue(point.y) });
  }
  return [...byX.values()].sort((a, b) => a.x - b.x);
}

/** Compile once per value change, then reuse for every preview/export sample. */
export function createCurveEvaluator(
  input: readonly CurvePoint[],
  interpolation: CurveInterpolation,
): CurveEvaluator {
  const points = normalizeCurvePoints(input);
  const tangents =
    interpolation === "monotone" ? getMonotoneTangents(points) : getSmoothTangents(points);
  return (inputX) => {
    if (Number.isNaN(inputX)) throw new RangeError("Curve input must not be NaN.");
    const x = clampCurveValue(inputX);
    const first = points[0];
    if (!first) return 0;
    if (x <= first.x) return first.y;
    const last = points[points.length - 1];
    if (x >= last.x) return last.y;
    let index = 1;
    while (x > points[index].x) index++;
    const left = points[index - 1],
      right = points[index];
    const dx = right.x - left.x;
    const t = (x - left.x) / dx,
      t2 = t * t,
      t3 = t2 * t;
    return clampCurveValue(
      (2 * t3 - 3 * t2 + 1) * left.y +
        (t3 - 2 * t2 + t) * dx * tangents[index - 1] +
        (-2 * t3 + 3 * t2) * right.y +
        (t3 - t2) * dx * tangents[index],
    );
  };
}

function getSmoothTangents(points: readonly CurvePoint[]): number[] {
  if (points.length < 2) return points.map(() => 0);
  if (points.length === 2) {
    const slope = getSlope(points[0], 0, points);
    return [slope, slope];
  }
  const tangents = points.map((_, index) => {
    if (index === 0 || index === points.length - 1) return 0;
    const previous = points[index - 1],
      next = points[index + 1];
    return (next.y - previous.y) / Math.max(Number.EPSILON, next.x - previous.x);
  });
  // Zero endpoint curvature, with each interior tangent following its neighbors.
  tangents[0] = (3 * getSlope(points[0], 0, points) - tangents[1]) / 2;
  const last = points.length - 1;
  tangents[last] = (3 * getSlope(points[last - 1], last - 1, points) - tangents[last - 1]) / 2;
  return tangents;
}

function getMonotoneTangents(points: readonly CurvePoint[]): number[] {
  if (points.length <= 1) {
    return points.map(() => 0);
  }

  if (points.length === 2) {
    const slope = getSlope(points[0], 0, points);

    return [slope, slope];
  }

  const intervals = points
    .slice(0, -1)
    .map((point, index) => Math.max(Number.EPSILON, (points[index + 1]?.x ?? point.x) - point.x));
  const slopes = points.slice(0, -1).map((point, index) => getSlope(point, index, points));

  return points.map((_, index) => {
    if (index === 0) {
      return getEndpointTangent({
        adjacentInterval: intervals[1] ?? intervals[0] ?? 1,
        interval: intervals[0] ?? 1,
        adjacentSlope: slopes[1] ?? slopes[0] ?? 0,
        slope: slopes[0] ?? 0,
      });
    }

    if (index === points.length - 1) {
      return getEndpointTangent({
        adjacentInterval: intervals[index - 2] ?? intervals[index - 1] ?? 1,
        interval: intervals[index - 1] ?? 1,
        adjacentSlope: slopes[index - 2] ?? slopes[index - 1] ?? 0,
        slope: slopes[index - 1] ?? 0,
      });
    }

    const leftSlope = slopes[index - 1] ?? 0;
    const rightSlope = slopes[index] ?? 0;

    if (leftSlope * rightSlope <= 0) {
      return 0;
    }

    const leftInterval = intervals[index - 1] ?? 1;
    const rightInterval = intervals[index] ?? 1;
    const leftWeight = 2 * rightInterval + leftInterval;
    const rightWeight = rightInterval + 2 * leftInterval;

    return (leftWeight + rightWeight) / (leftWeight / leftSlope + rightWeight / rightSlope);
  });
}

function getEndpointTangent({
  adjacentInterval,
  adjacentSlope,
  interval,
  slope,
}: {
  adjacentInterval: number;
  adjacentSlope: number;
  interval: number;
  slope: number;
}): number {
  const tangent =
    ((2 * interval + adjacentInterval) * slope - interval * adjacentSlope) /
    (interval + adjacentInterval);

  if (Math.sign(tangent) !== Math.sign(slope)) {
    return 0;
  }

  if (Math.sign(slope) !== Math.sign(adjacentSlope) && Math.abs(tangent) > Math.abs(3 * slope)) {
    return 3 * slope;
  }

  return tangent;
}

function getSlope(point: CurvePoint, index: number, points: readonly CurvePoint[]): number {
  const nextPoint = points[index + 1];
  const deltaX = Math.max(Number.EPSILON, nextPoint.x - point.x);

  return (nextPoint.y - point.y) / deltaX;
}
