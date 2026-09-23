import {
  registerToolcraftRendererPipeline,
  type ToolcraftRendererPipelinePassContract,
} from "@/toolcraft/runtime";

import { isomockTargets } from "./settings";

type IsomockPasses = {
  "export-render": ToolcraftRendererPipelinePassContract<void>;
  "preview-render": ToolcraftRendererPipelinePassContract<void>;
  "source-decode": ToolcraftRendererPipelinePassContract<
    ImageBitmap | null,
    ImageBitmap,
    readonly [string]
  >;
};

const cameraFrameBounds = {
  kind: "intrinsic",
  reason:
    "Output is the camera frame looking at the tilted screenshot; the artboard is that frame by definition.",
} as const;

const liveTargets = [
  isomockTargets.pose,
  isomockTargets.fieldOfView,
  isomockTargets.zoom,
  isomockTargets.offset,
  isomockTargets.focusPoint,
  isomockTargets.blur,
  isomockTargets.sharpBand,
  isomockTargets.grain,
  isomockTargets.edgeFade,
] as const;

export const isomockPipelineRegistration =
  registerToolcraftRendererPipeline<IsomockPasses>()({
    interactionInvalidation: [
      {
        interaction: "initial-render",
        invalidates: ["source-decode", "preview-render"],
        targets: ["canvas.initial-render"],
      },
      {
        interaction: "media-import",
        invalidates: ["source-decode", "preview-render"],
        targets: [isomockTargets.source],
      },
      {
        interaction: "control-drag",
        invalidates: ["preview-render"],
        mustNotInvalidate: ["source-decode"],
        retainedAccesses: ["source-decode"],
        targets: liveTargets,
      },
      {
        interaction: "control-change",
        invalidates: ["preview-render"],
        mustNotInvalidate: ["source-decode"],
        retainedAccesses: ["source-decode"],
        targets: [
          "canvas.infinity",
          "canvas.aspectRatio",
          "canvas.size.width",
          "canvas.size.height",
          "canvas.renderScale",
          isomockTargets.includeBackground,
          isomockTargets.background,
        ],
      },
      {
        interaction: "viewport-drag",
        invalidates: [],
        mustNotInvalidate: ["source-decode", "preview-render"],
        targets: ["canvas.viewport.offset"],
      },
      {
        interaction: "viewport-zoom",
        invalidates: [],
        mustNotInvalidate: ["source-decode", "preview-render"],
        targets: ["canvas.viewport.zoom"],
      },
      {
        interaction: "export",
        invalidates: ["export-render"],
        mustNotInvalidate: ["source-decode"],
        retainedAccesses: ["source-decode"],
        targets: ["actions.output"],
      },
    ],
    passes: [
      {
        cacheKey: ["source.resourceRef", "source.presentationUrl"],
        cost: { dimensions: [], frequency: "once", relationship: "constant" },
        id: "source-decode",
        inputs: ["source.resourceRef", "source.presentationUrl"],
        invalidatedBy: ["source.resourceRef"],
        kind: "decode",
        lifecycle: { cache: "retained-resource", resourceScope: "source" },
        output: "source",
        quality: "full",
        runsOn: "main",
        sceneBounds: {
          kind: "intrinsic",
          reason:
            "Decoding keeps the uploaded screenshot's own complete pixel domain.",
        },
      },
      {
        cost: {
          dimensions: ["preview-pixels"],
          frequency: "interaction",
          relationship: "linear",
        },
        gpu: {
          resources: "sampled-textures",
          stage: "render",
          state: "stateless",
          surfaces: ["preview"],
        },
        id: "preview-render",
        inputs: [
          "source-decode",
          ...liveTargets,
          "canvas.backing.width",
          "canvas.backing.height",
        ],
        invalidatedBy: [
          "source-decode",
          ...liveTargets,
          "canvas.backing.width",
          "canvas.backing.height",
        ],
        kind: "composite",
        lifecycle: { cache: "none", resourceScope: "call" },
        output: "preview",
        quality: "retina",
        runsOn: "gpu",
        sceneBounds: cameraFrameBounds,
      },
      {
        cost: {
          dimensions: ["export-pixels"],
          frequency: "batch",
          relationship: "linear",
        },
        gpu: {
          resources: "sampled-textures",
          stage: "render",
          state: "stateless",
          surfaces: ["export"],
        },
        id: "export-render",
        inputs: ["source-decode", ...liveTargets, "export.image.resolution"],
        invalidatedBy: [
          "source-decode",
          ...liveTargets,
          "export.image.resolution",
        ],
        kind: "export",
        lifecycle: { cache: "none", resourceScope: "call" },
        output: "export",
        quality: "export",
        runsOn: "gpu",
      },
    ],
    runtimeId: "isomock-tilt-focus-v1",
  });

export const sourceDecodePass =
  isomockPipelineRegistration.getPass("source-decode");
export const previewRenderPass =
  isomockPipelineRegistration.getPass("preview-render");
export const exportRenderPass =
  isomockPipelineRegistration.getPass("export-render");
