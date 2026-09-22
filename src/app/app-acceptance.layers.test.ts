import { exportRequestFixture } from "./app-acceptance.export-request-test-fixtures";
import { describe, expect, it } from "vitest";
import { layersModule } from "@/toolcraft/runtime";

import {
  contractAcceptanceFixture,
  contractSchemaFixture,
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import { playbackTimelineAcceptance } from "./app-acceptance.timeline-test-utils";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftProductReadiness,
} from "./acceptance/types";

const layersProductReadiness: ToolcraftProductReadiness = {
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
  productName: "Layers fixture",
  productSummary: "A fixture for runtime layer management.",
  requestedBehavior: "Manage structured content through Layers.",
  viewInteraction: {
    mode: "non-spatial",
    reason: "The layers fixture has no spatial view.",
  },
};

const layersPersistenceAcceptance: ToolcraftComponentAcceptance = {
  automated: true,
  automatedTestName: "layers state restores after reload",
  browser: {
    budget: "standard" as const,
    file: "e2e/app-controls.spec.ts",
    testName: "browser: layers state restores after reload",
  },
  componentType: "persistence",
  evidence: "persistence-state",
  expectedObservable: "Layer state restores after a real browser reload.",
  fixture: "layers persistence fixture",
  id: "persistence.reload",
  kind: "runtime",
  persistenceCoverage: "reload",
  persistenceSlices: ["layers"],
  userAction: "Edit layers, reload the page, and inspect restored state.",
};

describe("starter acceptance layers contract", () => {
  it("requires layer behavior coverage when a layers panel is enabled", () => {
    const layersSchema = defineContractSchemaFixture({
      base: {
        canvas: { enabled: true },
        identity: { id: "layers-fixture", title: "Layers fixture" },
        panels: { controls: { sections: [], title: "Controls" } },
      },
      modules: [layersModule()],
    });

    expect(
      validateContractAcceptance({
        schema: layersSchema,
        acceptance: [...contractAcceptanceFixture, layersPersistenceAcceptance],
        productReadiness: layersProductReadiness,
      }),
    ).toEqual(
      expect.arrayContaining([
        'panels.layers requires a runtime acceptance entry with layerCoverage "selection" proving layer selection behavior.',
        'panels.layers requires a runtime acceptance entry with layerCoverage "visibility" proving layer visibility behavior.',
        'panels.layers requires a runtime acceptance entry with layerCoverage "reorder" proving layer reorder behavior.',
        'panels.layers requires a runtime acceptance entry with layerCoverage "grouping" proving layer grouping behavior.',
      ]),
    );
  });

  it("rejects selectedLayer targets when the layers panel is disabled", () => {
    const schemaWithSelectedLayerControl = {
      ...contractSchemaFixture,
      panels: {
        ...contractSchemaFixture.panels,
        controls: {
          sections: [
            {
              controls: {
                opacity: {
                  applicability: {
                    mode: "always" as const,
                    origin: "explicit" as const,
                  },
                  defaultValue: 75,
                  label: "Opacity",
                  max: 100,
                  min: 0,
                  target: "selectedLayer.opacity",
                  type: "slider" as const,
                  variant: "continuous" as const,
                },
              },
              id: "layer",
              title: "Layer",
            },
          ],
          title: "Controls",
        },
      },
    };

    expect(
      validateContractAcceptance({
        schema: schemaWithSelectedLayerControl,
        acceptance: [
          playbackTimelineAcceptance,
          {
            automated: true,
            automatedTestName: "opacity changes rendered output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: opacity slider changes rendered output",
            },
            componentType: "slider",
            evidence: "rendered-pixels",
            expectedObservable: "Changing Opacity changes layer transparency.",
            fixture: "opacity fixture",
            id: "selectedLayer.opacity",
            kind: "control",
            target: "selectedLayer.opacity",
            userAction: "Drag the Opacity slider.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "Layer / opacity (selectedLayer.opacity) uses reserved selectedLayer.* target without panels.layers enabled. Use an app-specific target for single-layer apps or enable layers with layerCoverage.",
      ]),
    );
  });

  it("requires selectedLayer controls to prove currently selected layer behavior", () => {
    const layeredSchema = {
      ...contractSchemaFixture,
      panels: {
        ...contractSchemaFixture.panels,
        controls: {
          sections: [
            {
              controls: {
                opacity: {
                  applicability: {
                    mode: "always" as const,
                    origin: "explicit" as const,
                  },
                  defaultValue: 75,
                  label: "Opacity",
                  max: 100,
                  min: 0,
                  target: "selectedLayer.opacity",
                  type: "slider" as const,
                  variant: "continuous" as const,
                },
              },
              id: "layer",
              title: "Layer",
            },
          ],
          title: "Controls",
        },
        layers: true,
      },
    };

    expect(
      validateContractAcceptance({
        schema: layeredSchema,
        acceptance: [
          playbackTimelineAcceptance,
          {
            automated: true,
            automatedTestName: "layer selection changes selected runtime layer",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName:
                "browser: layers selection changes selected runtime layer",
            },
            componentType: "layers",
            evidence: "product-output",
            expectedObservable:
              "Selecting another layer changes which output layer is edited.",
            fixture: "layered output fixture",
            id: "layers.selection",
            kind: "runtime",
            layerCoverage: "selection",
            userAction: "Select another layer.",
          },
          {
            automated: true,
            automatedTestName: "layer visibility hides nested layer output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: layers visibility hides nested layer output",
            },
            componentType: "layers",
            evidence: "product-output",
            expectedObservable:
              "Toggling layer visibility removes that layer from output.",
            fixture: "layered output fixture",
            id: "layers.visibility",
            kind: "runtime",
            layerCoverage: "visibility",
            userAction: "Toggle a layer visibility button.",
          },
          {
            automated: true,
            automatedTestName: "layer reorder changes render order",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: layers reorder changes render order",
            },
            componentType: "layers",
            evidence: "product-output",
            expectedObservable:
              "Dragging a layer changes composited render order.",
            fixture: "overlapping layers fixture",
            id: "layers.reorder",
            kind: "runtime",
            layerCoverage: "reorder",
            userAction: "Drag a layer before another layer.",
          },
          {
            automated: true,
            automatedTestName: "layer grouping nests layer output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: layers grouping nests layer output",
            },
            componentType: "layers",
            evidence: "product-output",
            expectedObservable:
              "Dragging a layer into a group nests it and group visibility affects the nested output.",
            fixture: "grouped layers fixture",
            id: "layers.grouping",
            kind: "runtime",
            layerCoverage: "grouping",
            userAction: "Drag a layer into a group.",
          },
          {
            automated: true,
            automatedTestName: "opacity changes rendered output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: opacity slider changes rendered output",
            },
            componentType: "slider",
            evidence: "rendered-pixels",
            expectedObservable: "Changing Opacity changes layer transparency.",
            fixture: "opacity fixture",
            id: "selectedLayer.opacity",
            kind: "control",
            target: "selectedLayer.opacity",
            userAction: "Drag the Opacity slider.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'selectedLayer.opacity must declare selectionScopeCoverage "two-entity-isolation" proving edits stay on the selected entity.',
        'selectedLayer.opacity targets selectedLayer.* and must declare layerCoverage "selected-layer-controls" together with two-entity isolation.',
      ]),
    );
  });
});
