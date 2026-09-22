import type {
  ToolcraftExportFrame,
  ToolcraftProductExportRenderer,
} from "@/toolcraft/runtime";

import {
  createPhysicalFeedbackResource,
  executePhysicalFeedbackPasses,
  type PhysicalFeedbackSimulationInput,
} from "./pipeline";
import { getPhysicalFeedbackImpulse } from "./feedback-values";

export type PhysicalFeedbackExportPipelineFailureCode =
  | "physical-feedback-export-context-required"
  | "physical-feedback-export-pipeline-required"
  | "physical-feedback-export-staging-context-required";

export class PhysicalFeedbackExportPipelineError extends Error {
  readonly code: PhysicalFeedbackExportPipelineFailureCode;

  constructor(code: PhysicalFeedbackExportPipelineFailureCode, message: string) {
    super(message);
    this.name = "PhysicalFeedbackExportPipelineError";
    this.code = code;
  }
}

type PhysicalFeedbackExportStagingSurface = Readonly<{
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}>;

type PhysicalFeedbackExportStagingSurfaceFactory = (
  width: number,
  height: number,
) => PhysicalFeedbackExportStagingSurface;

export type PhysicalFeedbackExportDestinationContext = Readonly<{
  drawImage: (
    source: CanvasImageSource,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
  restore: () => void;
  save: () => void;
}>;

function createPhysicalFeedbackExportStagingSurface(
  width: number,
  height: number,
): PhysicalFeedbackExportStagingSurface {
  if (typeof document === "undefined") {
    throw new PhysicalFeedbackExportPipelineError(
      "physical-feedback-export-staging-context-required",
      "Physical feedback export requires a browser staging canvas.",
    );
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new PhysicalFeedbackExportPipelineError(
      "physical-feedback-export-staging-context-required",
      "Physical feedback export requires a Canvas2D staging context.",
    );
  }
  return Object.freeze({ canvas, context });
}

function releasePhysicalFeedbackExportStagingCanvas(
  canvas: HTMLCanvasElement,
): void {
  try {
    canvas.width = 1;
  } finally {
    canvas.height = 1;
  }
}

export async function presentPhysicalFeedbackExportFrame({
  createStagingSurface = createPhysicalFeedbackExportStagingSurface,
  destinationContext,
  frame,
  pixelHeight,
  pixelWidth,
  present,
}: Readonly<{
  createStagingSurface?: PhysicalFeedbackExportStagingSurfaceFactory;
  destinationContext: PhysicalFeedbackExportDestinationContext;
  frame: ToolcraftExportFrame;
  pixelHeight: number;
  pixelWidth: number;
  present: (context: CanvasRenderingContext2D) => PromiseLike<void> | void;
}>): Promise<void> {
  const staging = createStagingSurface(pixelWidth, pixelHeight);
  try {
    destinationContext.save();
    try {
      await present(staging.context);
      destinationContext.drawImage(
        staging.canvas,
        frame.x,
        frame.y,
        frame.width,
        frame.height,
      );
    } finally {
      destinationContext.restore();
    }
  } finally {
    releasePhysicalFeedbackExportStagingCanvas(staging.canvas);
  }
}

export const physicalFeedbackExportRenderer: ToolcraftProductExportRenderer = {
  baseFileName: "physical-feedback",
  async renderFrame({
    context,
    frame,
    pixelRatio,
    rendererPipeline,
    state,
    timeSeconds,
  }) {
    if (!context) {
      throw new PhysicalFeedbackExportPipelineError(
        "physical-feedback-export-context-required",
        "Physical feedback export requires the runtime Canvas2D destination context.",
      );
    }
    if (state.values["simulation.enabled"] === false) return;
    if (!rendererPipeline) {
      throw new PhysicalFeedbackExportPipelineError(
        "physical-feedback-export-pipeline-required",
        "Physical feedback export requires its registered renderer pipeline.",
      );
    }
    const renderedTime =
      timeSeconds === state.timeline.durationSeconds ? 0 : timeSeconds;
    const simulationInput: PhysicalFeedbackSimulationInput = {
      height: Math.max(1, Math.round(frame.height * pixelRatio)),
      impulse: getPhysicalFeedbackImpulse(state.values["simulation.impulse"]),
      time: Math.floor(renderedTime * 12) / 12,
      width: Math.max(1, Math.round(frame.width * pixelRatio)),
    };
    await executePhysicalFeedbackPasses({
      createResource: async (pipelineContext, operationQueue) =>
        pipelineContext.getOrCreateResource(
          ["feedback"],
          () => createPhysicalFeedbackResource(operationQueue),
          (owned) => owned.dispose(),
        ),
      destination: (resource, simulation) =>
        presentPhysicalFeedbackExportFrame({
          destinationContext: context,
          frame,
          pixelHeight: simulation.height,
          pixelWidth: simulation.width,
          present: (stagingContext) =>
            resource.presentExport({
              context: stagingContext,
              simulation,
            }),
        }),
      rendererPipeline,
      simulationInput,
      surface: "export",
    });
  },
};
