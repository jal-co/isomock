import { exportRequestFixture } from "./app-acceptance.export-request-test-fixtures";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftLayerCoverage,
  ToolcraftMediaLifecycleCoverage,
  ToolcraftProductReadiness,
} from "./acceptance/types";
import { createFileDropAcceptance } from "./app-acceptance.media-upload.fixtures";
import { createMediaPersistenceAcceptance } from "./acceptance/capability-proofs/test-proof-fixtures";

export const mediaProductReadiness: ToolcraftProductReadiness = {
  exportIntent: {
    image: {
      evidence: exportRequestFixture(
        "Remove image export; this fixture must not offer downloadable artifacts.",
      ),
      mode: "user-removed",
    },
    svg: { mode: "not-requested" },
    video: { mode: "not-requested" },
  },
  interactionOwnership: [],
  mode: "product",
  productName: "Media fixture",
  productSummary: "A non-spatial source-media fixture.",
  requestedBehavior: "Upload and edit source media.",
  viewInteraction: {
    mode: "non-spatial",
    reason: "The source-media fixture has no spatial view.",
  },
};

export function withMediaPersistence(
  acceptance: readonly ToolcraftComponentAcceptance[],
): readonly ToolcraftComponentAcceptance[] {
  return [
    ...acceptance,
    {
      ...createMediaPersistenceAcceptance(),
      persistenceSlices: ["canvas", "media", "panels", "values"],
    },
  ];
}

export const layeredMediaProductReadiness: ToolcraftProductReadiness = {
  exportIntent: {
    image: { mode: "toolcraft-default" },
    svg: { mode: "not-requested" },
    video: { mode: "not-requested" },
  },
  interactionOwnership: [
    {
      alternative: {
        reason:
          "Canvas media-management handles would duplicate the runtime Layers panel.",
        surface: "canvas",
      },
      capability: "structured-selection",
      evidence: {
        detail:
          "The product requires runtime Layers to own image selection and ordering.",
        source: "user-request",
      },
      id: "layers-media-management",
      reason:
        "Layers is the single surface for image selection, ordering, and transforms.",
      surface: "panel",
      target: "media.sources",
    },
    {
      alternative: {
        reason:
          "Canvas transform buttons would duplicate precise actions already owned by Layers.",
        surface: "canvas",
      },
      capability: "property-edit",
      evidence: {
        detail:
          "The product requires transforms to apply only to the layer selected in Layers.",
        source: "user-request",
      },
      id: "layers-selected-transform",
      reason:
        "The Layers property action remains bound to the explicitly selected image.",
      selectionScope: {
        mode: "selected-entity",
        selectionInteractionId: "layers-media-management",
      },
      surface: "panel",
      target: "selectedLayer.transform",
    },
  ],
  mode: "product",
  productName: "Layered media fixture",
  productSummary:
    "A layered image fixture that separates source admission from media management.",
  requestedBehavior:
    "Upload images through fileDrop and manage their order and transforms through Layers.",
  viewInteraction: {
    mode: "non-spatial",
    reason:
      "The layered image fixture has no editable three-dimensional scene.",
  },
};

function createLayerAcceptance({
  id,
  interactionId,
  layerCoverage,
  mediaLifecycleCoverage,
  target,
}: {
  id: string;
  interactionId?: string;
  layerCoverage: ToolcraftLayerCoverage;
  mediaLifecycleCoverage?: readonly ToolcraftMediaLifecycleCoverage[];
  target: string;
}): ToolcraftComponentAcceptance {
  return {
    automated: true,
    automatedTestName: `${id} changes layered media output`,
    browser: {
      budget: "standard",
      file: "e2e/app-controls.spec.ts",
      testName: `browser: ${id} changes layered media output`,
    },
    componentType:
      layerCoverage === "selected-layer-controls"
        ? "selected-layer-actions"
        : "layers-panel",
    evidence:
      layerCoverage === "selected-layer-controls"
        ? "media-lifecycle"
        : "product-output",
    expectedObservable: `${id} changes the selected layered media output.`,
    fixture: "layered media fixture",
    id,
    interactionId,
    kind: "runtime",
    layerCoverage,
    mediaLifecycleCoverage,
    selectionScopeCoverage:
      layerCoverage === "selected-layer-controls"
        ? "two-entity-isolation"
        : undefined,
    target,
    userAction: `Exercise ${id} through the runtime Layers panel.`,
  };
}

export function createLayeredMediaAcceptance({
  includeSelectedTransforms = true,
}: {
  includeSelectedTransforms?: boolean;
} = {}): readonly ToolcraftComponentAcceptance[] {
  return [
    createFileDropAcceptance({
      automatedTestName: "source images upload remove and reset",
      browserProofTestName: "browser: source images upload remove and reset",
      expectedObservable:
        "Upload adds source images while remove and Reset clear source media.",
      fixture: "source images fixture",
      id: "media.sources",
      mediaLifecycleCoverage: ["upload", "remove", "reset"],
      target: "media.sources",
      userAction: "Upload source images, remove one, then use Reset controls.",
    }),
    createLayerAcceptance({
      id: "layers.selection",
      interactionId: "layers-media-management",
      layerCoverage: "selection",
      target: "media.sources",
    }),
    createLayerAcceptance({
      id: "layers.visibility",
      layerCoverage: "visibility",
      target: "layers.visibility",
    }),
    createLayerAcceptance({
      id: "layers.reorder",
      layerCoverage: "reorder",
      target: "layers.order",
    }),
    createLayerAcceptance({
      id: "layers.grouping",
      layerCoverage: "grouping",
      target: "layers.groups",
    }),
    ...(includeSelectedTransforms
      ? [
          createLayerAcceptance({
            id: "layers.selected-transform",
            interactionId: "layers-selected-transform",
            layerCoverage: "selected-layer-controls",
            mediaLifecycleCoverage: ["rotate", "flip", "transform-output"],
            target: "selectedLayer.transform",
          }),
        ]
      : []),
  ];
}
