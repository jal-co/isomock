import type { ToolcraftModelBounds } from "../../model-import/canonical/model-document";

export type ToolcraftModelViewport = Readonly<{
  height: number;
  width: number;
}>;

export type ToolcraftModelDisplayFit = Readonly<{
  matrix: readonly [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
  ];
  padding: number;
  scale: number;
  sourceBounds: ToolcraftModelBounds;
  sourceCenter: readonly [number, number, number];
  viewport: ToolcraftModelViewport;
}>;

const DEFAULT_DISPLAY_FIT_PADDING = 0.9;

function assertFinitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Model display fit ${name} must be a finite positive number.`);
  }
}

function snapshotBounds(bounds: ToolcraftModelBounds): ToolcraftModelBounds {
  const min = [...bounds.min] as [number, number, number];
  const max = [...bounds.max] as [number, number, number];

  for (let axis = 0; axis < 3; axis += 1) {
    if (!Number.isFinite(min[axis]) || !Number.isFinite(max[axis])) {
      throw new Error("Model display fit bounds must be finite.");
    }
    if (max[axis] < min[axis]) {
      throw new Error("Model display fit bounds must not be inverted.");
    }
  }

  return Object.freeze({
    max: Object.freeze(max),
    min: Object.freeze(min),
  });
}

export function createToolcraftModelDisplayFit(
  sourceBounds: ToolcraftModelBounds,
  viewport: ToolcraftModelViewport,
  padding = DEFAULT_DISPLAY_FIT_PADDING,
): ToolcraftModelDisplayFit {
  assertFinitePositive(viewport.width, "viewport width");
  assertFinitePositive(viewport.height, "viewport height");
  assertFinitePositive(padding, "padding");
  if (padding > 1) {
    throw new Error("Model display fit padding must not exceed 1.");
  }

  const bounds = snapshotBounds(sourceBounds);
  const center = Object.freeze([
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ] as [number, number, number]);
  const width = bounds.max[0] - bounds.min[0];
  const height = bounds.max[1] - bounds.min[1];
  const depth = bounds.max[2] - bounds.min[2];
  const aspect = viewport.width / viewport.height;
  const limitingExtent = Math.max(width / aspect, height, depth);
  const scale = limitingExtent > 0 ? (2 * padding) / limitingExtent : 1;
  const matrix = Object.freeze([
    scale, 0, 0, 0,
    0, scale, 0, 0,
    0, 0, scale, 0,
    -center[0] * scale,
    -center[1] * scale,
    -center[2] * scale,
    1,
  ] as [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
  ]);

  return Object.freeze({
    matrix,
    padding,
    scale,
    sourceBounds: bounds,
    sourceCenter: center,
    viewport: Object.freeze({
      height: viewport.height,
      width: viewport.width,
    }),
  });
}

export function applyToolcraftModelDisplayFitToPoint(
  fit: ToolcraftModelDisplayFit,
  point: readonly [number, number, number],
): readonly [number, number, number] {
  return Object.freeze([
    point[0] * fit.matrix[0] + fit.matrix[12],
    point[1] * fit.matrix[5] + fit.matrix[13],
    point[2] * fit.matrix[10] + fit.matrix[14],
  ]);
}
