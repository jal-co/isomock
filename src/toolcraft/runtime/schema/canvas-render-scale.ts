import type {
  ResolvedToolcraftCanvasRenderScaleSchema,
  ToolcraftCanvasRenderScaleSchema,
} from "./types";

export const TOOLCRAFT_CANVAS_RENDER_SCALE = Object.freeze({
  defaultValue: 2,
  max: 2,
  min: 1,
  step: 0.25,
});

const minimumCanvasRenderScaleStep = 0.01;
const canvasRenderScaleStepTolerance = 1e-9;

function resolveCanvasRenderScaleStep(value: number | undefined): number {
  if (value === undefined) {
    return TOOLCRAFT_CANVAS_RENDER_SCALE.step;
  }

  const maximumCanvasRenderScaleStep =
    TOOLCRAFT_CANVAS_RENDER_SCALE.max - TOOLCRAFT_CANVAS_RENDER_SCALE.min;

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimumCanvasRenderScaleStep ||
    value > maximumCanvasRenderScaleStep
  ) {
    throw new Error(
      "Canvas render scale step must be a finite value between 0.01 and 1.",
    );
  }

  const stepCount = maximumCanvasRenderScaleStep / value;

  if (Math.abs(stepCount - Math.round(stepCount)) > canvasRenderScaleStepTolerance) {
    throw new Error("Canvas render scale step must divide the canonical range exactly.");
  }

  return value;
}

export function resolveToolcraftCanvasRenderScale(
  renderScale: ToolcraftCanvasRenderScaleSchema | undefined,
): ResolvedToolcraftCanvasRenderScaleSchema {
  if (!renderScale) {
    return {
      ...TOOLCRAFT_CANVAS_RENDER_SCALE,
      enabled: false,
    };
  }

  return {
    ...TOOLCRAFT_CANVAS_RENDER_SCALE,
    enabled: true,
    step:
      renderScale === true
        ? TOOLCRAFT_CANVAS_RENDER_SCALE.step
        : resolveCanvasRenderScaleStep(renderScale.step),
  };
}
