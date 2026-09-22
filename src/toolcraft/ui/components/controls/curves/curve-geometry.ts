import {
  clampCurveValue as clamp,
  createCurveEvaluator,
  normalizeCurvePoints,
  type CurveInterpolation,
  type CurvePoint,
} from "../../../lib/curve";

export { clamp, normalizeCurvePoints };
export type { CurveInterpolation };

export const curveViewBoxSize = 268;
export const curveInset = 18;
export const curveGraphSize = 232;
export const curveGraphMax = curveInset + curveGraphSize;
export const curveGridStops = [0.25, 0.5, 0.75] as const;
export const curveHitThreshold = 10;
export const defaultCurveInterpolation = "smooth" satisfies CurveInterpolation;

export function mapPointToSvg(point: CurvePoint): [number, number] {
  return [curveInset + point.x * curveGraphSize, curveGraphMax - point.y * curveGraphSize];
}

export function pointFromSvgEvent(
  event: Pick<PointerEvent, "clientX" | "clientY">,
  svg: SVGSVGElement | null,
): CurvePoint {
  const rect = svg?.getBoundingClientRect();
  if (!rect) {
    return { x: 0, y: 0 };
  }

  const viewBox = svg?.viewBox.baseVal;
  const viewBoxX =
    (viewBox?.x ?? 0) + ((event.clientX - rect.left) / rect.width) * (viewBox?.width ?? rect.width);
  const viewBoxY =
    (viewBox?.y ?? 0) +
    ((event.clientY - rect.top) / rect.height) * (viewBox?.height ?? rect.height);

  return {
    x: clamp((viewBoxX - curveInset) / curveGraphSize),
    y: clamp(1 - (viewBoxY - curveInset) / curveGraphSize),
  };
}

export function constrainCurvePoint(
  points: readonly CurvePoint[],
  index: number,
  point: CurvePoint,
): CurvePoint {
  if (index === 0 || index === points.length - 1) {
    return { x: points[index]?.x ?? point.x, y: point.y };
  }

  const previousPoint = points[index - 1];
  const nextPoint = points[index + 1];
  const gap = Math.min(0.01, ((nextPoint?.x ?? 1) - (previousPoint?.x ?? 0)) / 3);
  const minX = (previousPoint?.x ?? 0) + gap;
  const maxX = (nextPoint?.x ?? 1) - gap;

  return { x: Math.min(maxX, Math.max(minX, point.x)), y: point.y };
}

export function replaceCurvePoint(
  points: readonly CurvePoint[],
  index: number,
  point: CurvePoint,
): CurvePoint[] {
  return normalizeCurvePoints(
    points.map((item, itemIndex) => (itemIndex === index ? point : item)),
  );
}

export function insertCurvePoint(
  points: readonly CurvePoint[],
  point: CurvePoint,
): { index: number; points: CurvePoint[] } {
  const normalizedPoints = normalizeCurvePoints(points);
  const nextPoints = normalizeCurvePoints([...normalizedPoints, point]);
  const index = nextPoints.findIndex((item) => item.x === clamp(point.x));
  return { index, points: nextPoints };
}

export function removeCurvePoint(points: readonly CurvePoint[], index: number): CurvePoint[] {
  return normalizeCurvePoints(points.filter((_, itemIndex) => itemIndex !== index));
}

export function isPointNearCurve(
  points: readonly CurvePoint[],
  point: CurvePoint,
  threshold = curveHitThreshold,
  interpolation: CurveInterpolation = defaultCurveInterpolation,
): boolean {
  const curvePoint = getCurvePointAtX(points, point.x, interpolation);
  const distance = Math.abs(curvePoint.y - point.y) * curveGraphSize;

  return distance <= threshold;
}

export function getCurvePointAtX(
  points: readonly CurvePoint[],
  x: number,
  interpolation: CurveInterpolation = defaultCurveInterpolation,
): CurvePoint {
  return { x: clamp(x), y: createCurveEvaluator(points, interpolation)(x) };
}

export function getCurvePath(
  points: readonly CurvePoint[],
  interpolation: CurveInterpolation = defaultCurveInterpolation,
): string {
  const normalized = normalizeCurvePoints(points);
  if (!normalized.length) return "";
  const evaluate = createCurveEvaluator(normalized, interpolation);
  const stops = [...new Set([0, ...normalized.map((point) => point.x), 1])];
  const vertices = [mapPointToSvg({ x: 0, y: evaluate(0) })];
  for (let index = 1; index < stops.length; index++) {
    const start = stops[index - 1],
      end = stops[index];
    // Sample each segment, retaining exact knots even for steep, narrow features.
    const count = Math.max(24, Math.ceil((end - start) * 512));
    for (let step = 1; step <= count; step++) {
      const x = step === count ? end : start + ((end - start) * step) / count;
      vertices.push(mapPointToSvg({ x, y: evaluate(x) }));
    }
  }
  return vertices.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
}
