import {
  defineToolcraft,
  imageExportModule,
  mediaSourceModule,
  svgExportModule,
  toolcraftMaskTargets,
  type ResolvedToolcraftAppSchema,
  type ToolcraftProductCapabilityId,
  videoExportModule,
} from "@/toolcraft/runtime";

import type {
  ToolcraftComponentAcceptance,
  ToolcraftLayerCoverage,
  ToolcraftProductReadiness,
} from "../types";

export function createRuntimeAcceptance(
  id: string,
  overrides: Partial<ToolcraftComponentAcceptance> = {},
): ToolcraftComponentAcceptance {
  return {
    automated: true,
    automatedTestName: `${id} automated proof`,
    browser: {
      budget: "standard",
      file: "e2e/app-controls.spec.ts",
      testName: `browser: ${id} proof`,
    },
    componentType: "runtime",
    evidence: "product-output",
    expectedObservable: `${id} changes visible product output.`,
    fixture: `${id} fixture`,
    id,
    kind: "runtime",
    userAction: `Exercise ${id}.`,
    ...overrides,
  };
}

export function createExportSchema(
  role: "export-image" | "export-svg" | "export-video",
) {
  const suffix = role.slice("export-".length);
  return defineToolcraft({
    base: {
      canvas: { enabled: true },
      identity: {
        id: `contract-${suffix}-export`,
        title: `Contract ${suffix} export`,
      },
      panels: { controls: { sections: [], title: "Controls" } },
    },
    modules: [
      role === "export-image"
        ? imageExportModule()
        : role === "export-svg"
          ? svgExportModule()
          : videoExportModule(),
    ],
  });
}

export function createPersistentMediaSchema() {
  return defineToolcraft({
    base: {
      canvas: { enabled: true },
      identity: { id: "contract-media", title: "Contract media" },
      panels: {
        controls: {
          sections: [
            {
              id: "test-section-2",
              controls: {
                source: {
                  applicability: { mode: "always" as const },
                  defaultValue: null,
                  label: "Source image",
                  target: "media.source",
                  type: "fileDrop",
                },
              },
              title: "Source",
            },
          ],
          title: "Controls",
        },
      },
      persistence: { storage: "localStorage" },
    },
    modules: [mediaSourceModule()],
  });
}

export function withPersistentMedia(
  schema: ResolvedToolcraftAppSchema,
): ResolvedToolcraftAppSchema {
  return Object.freeze({
    ...schema,
    persistence: Object.freeze({
      additionalValueTargets: Object.freeze([]),
      include: Object.freeze(["media"] as const),
      key: "toolcraft:contract-media:state:v2",
      storage: "localStorage" as const,
      version: 2,
    }),
  });
}

export function createMediaPersistenceAcceptance(): ToolcraftComponentAcceptance {
  return createRuntimeAcceptance("persistence.reload", {
    componentType: "persistence",
    evidence: "persistence-state",
    persistenceCoverage: "reload",
    persistenceSlices: ["media"],
  });
}

export function createArtifactAcceptance(
  kind: "image" | "svg" | "video",
): ToolcraftComponentAcceptance {
  return createRuntimeAcceptance(`artifact.${kind}`, {
    actionCoverage: [kind === "image" ? "export.png" : `export.${kind}`],
    componentType: "panelActions",
    evidence: "exported-bytes",
    exportArtifactCoverage: `all-required-${kind}-export-behavior`,
    kind: "control",
    target: "actions.output",
  });
}

export function createLayerAcceptance(
  layerCoverage: ToolcraftLayerCoverage,
): ToolcraftComponentAcceptance {
  return createRuntimeAcceptance(`layers.${layerCoverage}`, {
    componentType: "layers",
    layerCoverage,
  });
}

export const canvasProductReadiness: Extract<
  ToolcraftProductReadiness,
  { mode: "product" }
> = {
  exportIntent: {
    image: { mode: "toolcraft-default" },
    svg: { mode: "not-requested" },
    video: { mode: "not-requested" },
  },
  interactionOwnership: [
    {
      alternative: {
        reason:
          "A panel copy would duplicate the direct canvas drag operation.",
        surface: "panel",
      },
      capability: "direct-spatial-edit",
      evidence: {
        detail: "The product requires direct manipulation over visible output.",
        source: "user-request",
      },
      id: "canvas-position",
      reason:
        "The canvas preserves spatial correspondence during direct editing.",
      surface: "canvas",
      target: "shape.position",
    },
  ],
  mode: "product",
  productName: "Capability proof fixture",
  productSummary: "A fixture for direct canvas editing.",
  requestedBehavior: "Drag the shape directly on the canvas.",
  viewInteraction: {
    mode: "non-spatial",
    reason: "The fixture edits a two-dimensional shape.",
  },
};

export function createStrayCapabilityProofAcceptance(
  capabilityId: ToolcraftProductCapabilityId,
): ToolcraftComponentAcceptance {
  const id = `stray.${capabilityId}`;

  switch (capabilityId) {
    case "artifact.image-export":
      return createRuntimeAcceptance(id, {
        exportArtifactCoverage: "all-required-image-export-behavior",
      });
    case "artifact.svg-export":
      return createRuntimeAcceptance(id, {
        exportArtifactCoverage: "all-required-svg-export-behavior",
      });
    case "artifact.video-export":
      return createRuntimeAcceptance(id, {
        exportArtifactCoverage: "all-required-video-export-behavior",
      });
    case "canvas.editing":
      return createRuntimeAcceptance(id, {
        canvasHandle: {
          outputObservable: "Stray handle changes output.",
          testId: "stray-handle",
          writesTarget: "shape.position",
        },
        kind: "canvas-handle",
      });
    case "layers.management":
      return createRuntimeAcceptance(id, { layerCoverage: "selection" });
    case "foreground.soft-ellipses":
      return createRuntimeAcceptance(id, {
        kind: "control",
        componentType: "collectionActions",
        target: toolcraftMaskTargets.items,
        evidence: "rendered-pixels",
        controlPartCoverage: "all-visible-parts",
      });
    case "media.source":
      return createRuntimeAcceptance(id, {
        mediaLifecycleCoverage: ["upload"],
      });
    case "model.3d":
      return createRuntimeAcceptance(id, {
        modelImportCoverage: "all-required-model-import-behavior",
      });
    case "spatial.view":
      return createRuntimeAcceptance(id, {
        orientationGizmoCoverage: "all-required-orientation-gizmo-behavior",
      });
    case "timeline.keyframes":
      return createRuntimeAcceptance(id, { timelineCoverage: "keyframes" });
    case "timeline.playback":
      return createRuntimeAcceptance(id, { timelineCoverage: "playback" });
  }
}
