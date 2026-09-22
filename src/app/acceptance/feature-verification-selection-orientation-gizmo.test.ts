import { spatialViewModule } from "@/toolcraft/runtime";
import { defineToolcraftCustomControlType } from "@/toolcraft/runtime";
import { defineToolcraft } from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";
import { createToolcraftFeatureVerificationSelection } from "./feature-verification-selection";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlSectionInventoryEntry,
} from "./types";
const schema = defineToolcraft({
  base: {
    identity: {
      id: "acceptance-fixture",
      title: "Acceptance fixture",
    },
    canvas: { enabled: true },
    panels: {
      controls: {
        sections: [
          {
            controls: {
              mode: {
                applicability: { mode: "always" },
                defaultValue: "orbit",
                options: [
                  { label: "Orbit", value: "orbit" },
                  { label: "Fixed", value: "fixed" },
                ],
                target: "model.mode",
                type: "segmented" as const,
              },
              orientation: {
                applicability: {
                  all: [{ equals: "orbit", target: "model.mode" }],
                  mode: "conditional",
                },
                defaultValue: {
                  position: [0, 0, 5],
                  up: [0, 1, 0],
                },
                keyframeable: false,
                label: false,
                target: "view.orbit",
                type: "orientationGizmo",
              },
            },
            id: "model",
            title: "Model",
          },
        ],
        title: "Controls",
      },
    },
  },
  modules: [spatialViewModule()],
});
const sectionInventory = [
  {
    entity: "Model",
    entityId: "model",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason: "Model mode gates the available canvas orientation gizmo.",
        role: "branch",
        target: "model.mode",
      },
    ],
    groupingReason: "Mode and orientation define the editable model view.",
    id: "model",
    targets: ["model.mode", "view.orbit"],
    title: "Model",
  },
] as const satisfies readonly ToolcraftControlSectionInventoryEntry[];
const commonAcceptance = {
  automated: true,
  automatedTestName: "model view unit",
  evidence: "product-output" as const,
  expectedObservable: "The selected model view changes rendered output.",
  fixture: "visible 3D model",
  userAction: "Change the model view.",
};
const acceptance: readonly ToolcraftComponentAcceptance[] = [
  {
    ...commonAcceptance,
    browser: {
      budget: "standard",
      file: "e2e/product-model.spec.ts",
      testName: "browser: model mode",
    },
    componentType: "segmented",
    id: "model.mode",
    kind: "control",
    target: "model.mode",
  },
  {
    ...commonAcceptance,
    browser: {
      budget: "standard",
      file: "e2e/product-model.spec.ts",
      testName: "browser: orientation gizmo",
    },
    canvasHandle: {
      outputObservable: "The model follows the shared orbit pose.",
      testId: "toolcraft-orientation-gizmo",
      writesTarget: "view.orbit",
    },
    componentType: "orientationGizmo",
    id: "model.orientation",
    kind: "canvas-handle",
    orientationGizmoCoverage: "all-required-orientation-gizmo-behavior",
  },
];
describe("Toolcraft feature verification orientation gizmo closure", () => {
  it("includes the conditional gizmo browser proof for its branch selector", () => {
    expect(
      createToolcraftFeatureVerificationSelection({
        acceptance,
        request: {
          acceptanceIds: ["model.mode"],
          mode: "ids",
          version: 1,
        },
        schema,
        sectionInventory,
      }),
    ).toEqual({
      acceptanceIds: ["model.mode", "model.orientation"],
      scenarios: [
        {
          acceptanceIds: ["model.mode"],
          budget: "standard",
          file: "e2e/product-model.spec.ts",
          testName: "browser: model mode",
        },
        {
          acceptanceIds: ["model.orientation"],
          budget: "standard",
          file: "e2e/product-model.spec.ts",
          testName: "browser: orientation gizmo",
        },
      ],
      version: 2,
    });
  });
  it("uses the canonical mapped target for the next fixed-point step", () => {
    const transitiveSchema = defineToolcraft({
      base: {
        identity: {
          id: "acceptance-fixture",
          title: "Acceptance fixture",
        },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                controls: {
                  mode: {
                    applicability: { mode: "always" },
                    defaultValue: "orbit",
                    options: [
                      { label: "Orbit", value: "orbit" },
                      { label: "Fixed", value: "fixed" },
                    ],
                    target: "model.mode",
                    type: "segmented" as const,
                  },
                  orbitMode: {
                    applicability: { mode: "always" },
                    defaultValue: "free",
                    options: [
                      { label: "Free", value: "free" },
                      { label: "Axis", value: "axis" },
                    ],
                    target: "view.orbit",
                    type: "segmented" as const,
                  },
                  exposure: {
                    applicability: { mode: "always" },
                    defaultValue: 1,
                    target: "view.exposure",
                    type: defineToolcraftCustomControlType("numberField"),
                  },
                },
                id: "model",
                title: "Model",
              },
            ],
            title: "Controls",
          },
        },
      },
      modules: [],
    });
    const transitiveInventory = [
      {
        entity: "Model",
        entityId: "model",
        finiteSelectors: [
          {
            affectedTargets: ["view.orbit"],
            reason: "Model mode changes the available orbit mode.",
            role: "branch",
            target: "model.mode",
          },
          {
            affectedTargets: ["view.exposure"],
            reason: "Orbit mode changes the view exposure behavior.",
            role: "branch",
            target: "view.orbit",
          },
        ],
        groupingReason: "Model mode, orbit mode, and exposure define the view.",
        id: "model",
        targets: ["model.mode", "view.orbit", "view.exposure"],
        title: "Model",
      },
    ] as const satisfies readonly ToolcraftControlSectionInventoryEntry[];
    const exposureAcceptance: ToolcraftComponentAcceptance = {
      ...commonAcceptance,
      browser: {
        budget: "standard",
        file: "e2e/product-model.spec.ts",
        testName: "browser: exposure",
      },
      componentType: "numberField",
      id: "model.exposure",
      kind: "control",
      target: "view.exposure",
    };
    const selection = createToolcraftFeatureVerificationSelection({
      acceptance: [...acceptance, exposureAcceptance],
      request: {
        acceptanceIds: ["model.mode"],
        mode: "ids",
        version: 1,
      },
      schema: transitiveSchema,
      sectionInventory: transitiveInventory,
    });
    expect(selection.acceptanceIds).toEqual([
      "model.exposure",
      "model.mode",
      "model.orientation",
    ]);
  });
});
