import {
  defineToolcraft,
  defineToolcraftDiscreteFixtureAdapter,
  defineToolcraftFixtureAdapter,
  deriveToolcraftPerformancePaths,
  type ToolcraftEnvelopePerformanceConfig,
  type ToolcraftPerformanceScenario,
} from "@/toolcraft/runtime";
import { appIdentity } from "./app-identity";
import {
  PHYSICAL_FEEDBACK_MAX_BACKING_PIXELS,
  PHYSICAL_FEEDBACK_MAX_INTERACTIVE_PIXELS,
} from "./feedback-limits";

export const PHYSICAL_FEEDBACK_DEFAULT_PREVIEW_PIXELS = 256_000;

export type PhysicalFeedbackPreviewPixelFixture = Readonly<{
  backingHeight: number;
  backingWidth: number;
  canvasHeight: number;
  canvasWidth: number;
  renderScale: 2;
}>;

function createPreviewPixelFixture(value: number): PhysicalFeedbackPreviewPixelFixture {
  const wholeValue = Math.round(value);
  if (
    !Number.isSafeInteger(wholeValue) ||
    Math.abs(wholeValue - value) > 0.000_001 ||
    wholeValue <= 0
  ) {
    throw new Error(`Preview pixels must be a positive whole count, received ${value}.`);
  }
  for (let backingWidth = 8_192; backingWidth >= 2; backingWidth -= 2) {
    const backingHeight = wholeValue / backingWidth;
    if (
      Number.isSafeInteger(backingHeight) &&
      backingHeight >= 2 &&
      backingHeight <= 8_192 &&
      backingHeight % 2 === 0
    ) {
      return Object.freeze({
        backingHeight,
        backingWidth,
        canvasHeight: backingHeight / 2,
        canvasWidth: backingWidth / 2,
        renderScale: 2,
      });
    }
  }
  throw new Error(`Preview pixel count ${value} has no exact render-scale-2 canvas fixture.`);
}

const previewPixelFixture = defineToolcraftFixtureAdapter<PhysicalFeedbackPreviewPixelFixture>({
  apply: createPreviewPixelFixture,
  dimensionId: "preview-pixels",
  observe: ({ backingHeight, backingWidth }) => backingHeight * backingWidth,
});

const exportPixelFixture = defineToolcraftDiscreteFixtureAdapter({
  dimensionId: "export-pixels",
  domain: {
    attestation:
      "The three resolution options combine with the fixed Infinity scene bounds to exhaust the reachable exported pixel counts.",
    inputs: ["export-long-edge"],
    kind: "derived",
  },
  entries: [
    { appliedValue: "2k", value: 2_795_520 },
    { appliedValue: "4k", value: 11_186_176 },
    { appliedValue: "8k", value: 44_736_512 },
  ],
});

const exportLongEdgeFixture = defineToolcraftDiscreteFixtureAdapter({
  dimensionId: "export-long-edge",
  domain: {
    kind: "schema-options",
    optionValues: ["2k", "4k", "8k"],
    target: "export.image.resolution",
  },
  entries: [
    { appliedValue: "2k", value: 2_048 },
    { appliedValue: "4k", value: 4_096 },
    { appliedValue: "8k", value: 8_192 },
  ],
});

const replayStepFixture = defineToolcraftDiscreteFixtureAdapter({
  dimensionId: "replay-steps",
  domain: {
    attestation:
      "The deterministic development fixture enumerates exact dispatch counts 1 through 25, drives the editable timeline below its three-second loop boundary, and observes the committed renderer replay-step attribute.",
    kind: "runtime-state",
    path: "renderer.replaySteps",
  },
  entries: Array.from({ length: 25 }, (_, index) => ({
    appliedValue: index + 1,
    value: index + 1,
  })),
});

export const physicalFeedbackFixtureAdapters = {
  dimensions: {
    "export-long-edge": exportLongEdgeFixture,
    "export-pixels": exportPixelFixture,
    "preview-pixels": previewPixelFixture,
    "replay-steps": replayStepFixture,
  },
};

export const physicalFeedbackWorkloadEnvelope = {
  dimensions: [
    {
      defaultValue: 256_000,
      id: "preview-pixels",
      interactiveMax: PHYSICAL_FEEDBACK_MAX_INTERACTIVE_PIXELS,
      mapping: "direct",
      source: {
        kind: "runtime-state",
        path: "canvas.backingPixelsAtSelectedRenderScale",
      },
      unit: "pixels",
    },
    {
      batchMax: 8_192,
      customMappingReason:
        "The image resolution option maps to its exact numeric long edge.",
      defaultValue: 4_096,
      id: "export-long-edge",
      mapping: "custom",
      source: {
        kind: "schema-target",
        target: "export.image.resolution",
      },
      unit: "pixels",
    },
    {
      batchMax: PHYSICAL_FEEDBACK_MAX_BACKING_PIXELS,
      defaultValue: 11_186_176,
      id: "export-pixels",
      mapping: "direct",
      source: {
        inputs: ["export-long-edge"],
        kind: "derived",
      },
      unit: "pixels",
    },
    {
      defaultValue: 1,
      id: "replay-steps",
      interactiveMax: 25,
      batchMax: 25,
      customMappingReason:
        "The exhaustive fixture applies each exact whole dispatch count through the editable timeline and observes one reset plus floor(seconds times twelve), capped at twenty-five total steps.",
      mapping: "direct",
      source: {
        kind: "runtime-state",
        path: "renderer.replaySteps",
      },
      unit: "steps",
    },
  ],
} satisfies ToolcraftEnvelopePerformanceConfig["workloadEnvelope"];

const rendererPathSchema = defineToolcraft({
  base: {
    canvas: { enabled: true },
    identity: appIdentity,
    panels: { controls: { sections: [], title: "Controls" } },
  },
  modules: [],
});

export function derivePhysicalFeedbackPerformancePaths(
  performance: ToolcraftEnvelopePerformanceConfig,
) {
  return deriveToolcraftPerformancePaths(rendererPathSchema, performance);
}

function getScenarioLocator(
  path: Readonly<{ interaction: string; targets: readonly string[] }>,
): Readonly<Record<string, string>> {
  if (path.interaction === "control-drag") return { controlLabel: "Impulse" };
  if (path.interaction === "control-change") {
    if (path.targets.includes("export.includeBackground")) {
      return {
        uiSelector:
          '[data-toolcraft-control-target="export.includeBackground"]',
      };
    }
    return path.targets.some((target) => target.startsWith("simulation.enabled:"))
      ? { controlLabel: "Field" }
      : {
          uiSelector: '[data-toolcraft-control-target="canvas.renderScale"]',
        };
  }
  if (
    path.interaction === "timeline-playback" ||
    path.interaction === "timeline-scrub"
  ) {
    return { uiSelector: '[aria-label="Playback position"]' };
  }
  return {};
}

export function createPhysicalFeedbackPerformanceScenarios(
  performance: ToolcraftEnvelopePerformanceConfig,
): ToolcraftPerformanceScenario[] {
  return derivePhysicalFeedbackPerformancePaths(performance).map(
    (path): ToolcraftPerformanceScenario => {
      const common = {
        automated: true,
        automatedTestName: `perf: vgpu ${path.id}`,
        browser: true,
        browserTestName: `browser perf: vgpu ${path.id}`,
        coversTargets: path.targets,
        expectedObservable: `The ${path.interaction} path retains full WebGPU output quality.`,
        fixture: "physical feedback provider fixture",
        id: `vgpu-${path.id}`,
        pathId: path.id,
        ...(path.targets.length === 1 ? { target: path.targets[0] } : {}),
      };
      if (path.interaction === "export") {
        return {
          ...common,
          actionValue: "export.png",
          completionEvidence: "download",
          controlLabel: "Export PNG",
          interaction: "export",
        };
      }
      return {
        ...common,
        ...getScenarioLocator(path),
        interaction: path.interaction,
      };
    },
  );
}
