import { describe, expect, it } from "vitest";

import {
  createContractSectionInventoryFixture,
  defineContractSchemaFixture,
  validateContractAcceptance,
  validateContractAcceptanceDiagnostics,
} from "./app-acceptance.contract-fixtures";
import { makeControlAcceptance } from "./app-acceptance.test-utils";

describe("starter acceptance section cohesion contract", () => {
  it("recommends reviewing a broad section without mandating a split", () => {
    const schemaWithOvergrownFlowSection = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "flow",
                controls: {
                  mode: {
                    applicability: { mode: "always" as const },
                    defaultValue: "columns",
                    label: "Mode",
                    options: [
                      { label: "Columns", value: "columns" },
                      { label: "Burst", value: "burst" },
                    ],
                    orderRole: "mode",
                    semanticGroup: "motion",
                    target: "flow.mode",
                    type: "select",
                  },
                  speed: {
                    applicability: { mode: "always" as const },
                    defaultValue: 1,
                    label: "Speed",
                    max: 3,
                    min: 0,
                    orderRole: "strength",
                    semanticGroup: "motion",
                    target: "flow.speed",
                    type: "slider",
                    variant: "continuous",
                  },
                  duration: {
                    applicability: { mode: "always" as const },
                    defaultValue: 8,
                    label: "Duration",
                    max: 20,
                    min: 1,
                    orderRole: "detail",
                    semanticGroup: "motion",
                    target: "flow.duration",
                    type: "slider",
                    variant: "continuous",
                  },
                  width: {
                    applicability: { mode: "always" as const },
                    defaultValue: 80,
                    label: "Width",
                    max: 200,
                    min: 20,
                    orderRole: "spatial",
                    semanticGroup: "geometry",
                    target: "flow.width",
                    type: "slider",
                    variant: "continuous",
                  },
                  curve: {
                    applicability: { mode: "always" as const },
                    defaultValue: 0.5,
                    label: "Curve",
                    max: 1,
                    min: 0,
                    orderRole: "spatial",
                    semanticGroup: "geometry",
                    target: "flow.curve",
                    type: "slider",
                    variant: "continuous",
                  },
                  fill: {
                    applicability: { mode: "always" as const },
                    defaultValue: 60,
                    label: "Fill",
                    max: 100,
                    min: 0,
                    orderRole: "strength",
                    semanticGroup: "appearance",
                    target: "flow.fill",
                    type: "slider",
                    unit: "%",
                    variant: "continuous",
                  },
                  wordCount: {
                    applicability: { mode: "always" as const },
                    defaultValue: 24,
                    label: "Words",
                    max: 100,
                    min: 1,
                    orderRole: "detail",
                    semanticGroup: "content",
                    target: "flow.wordCount",
                    type: "slider",
                    variant: "continuous",
                  },
                  text: {
                    applicability: { mode: "always" as const },
                    commitMode: "content",
                    defaultValue: "Creative app",
                    label: "Text",
                    orderRole: "input",
                    semanticGroup: "content",
                    target: "flow.text",
                    textValueKind: "single-line",
                    type: "text",
                  },
                  color: {
                    applicability: { mode: "always" as const },
                    defaultValue: "#DEF135",
                    label: "Color",
                    orderRole: "color",
                    semanticGroup: "appearance",
                    target: "flow.color",
                    type: "color",
                  },
                  exportQuality: {
                    applicability: { mode: "always" as const },
                    defaultValue: "high",
                    label: "Quality",
                    options: [
                      { label: "High", value: "high" },
                      { label: "Low", value: "low" },
                    ],
                    orderRole: "detail",
                    semanticGroup: "export",
                    target: "flow.exportQuality",
                    type: "select",
                  },
                },
                title: "Flow",
              },
            ],
            title: "Master Controls",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    const diagnostics = validateContractAcceptanceDiagnostics({
      schema: schemaWithOvergrownFlowSection,
      acceptance: [
        makeControlAcceptance("flow.mode", "select"),
        makeControlAcceptance("flow.speed", "slider"),
        makeControlAcceptance("flow.duration", "slider"),
        makeControlAcceptance("flow.width", "slider"),
        makeControlAcceptance("flow.curve", "slider"),
        makeControlAcceptance("flow.fill", "slider"),
        makeControlAcceptance("flow.wordCount", "slider"),
        makeControlAcceptance("flow.text", "text"),
        makeControlAcceptance("flow.color", "color"),
        makeControlAcceptance("flow.exportQuality", "select"),
      ],
      transferMode: {
        animationIntent: {
          behaviorCoverage: [
            "no-user-facing-transport",
            "no-play-pause",
            "no-scrub",
            "no-duration-control",
            "no-loop-control",
            "no-export-at-time",
          ],
          mode: "autonomous",
          reason:
            "The flow speed is a decorative self-running effect and does not expose product time transport.",
        },
        mode: "new-toolcraft-app",
        referenceInputs: [],
      },
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            "Flow has 10 declared controls",
          ),
          ruleId: "controls-layout-heuristics",
          severity: "warning",
        }),
      ]),
    );
  });

  it("accepts a small cohesive broad section when controls share one product meaning", () => {
    const schemaWithSmallFlowSection = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "flow",
                controls: {
                  speed: {
                    applicability: { mode: "always" as const },
                    defaultValue: 1,
                    label: "Speed",
                    max: 3,
                    min: 0,
                    orderRole: "strength",
                    target: "flow.speed",
                    type: "slider",
                    variant: "continuous",
                  },
                  drift: {
                    applicability: { mode: "always" as const },
                    defaultValue: 0.4,
                    label: "Drift",
                    max: 1,
                    min: 0,
                    orderRole: "detail",
                    target: "flow.drift",
                    type: "slider",
                    variant: "continuous",
                  },
                  phase: {
                    applicability: { mode: "always" as const },
                    defaultValue: 0.25,
                    label: "Phase",
                    max: 1,
                    min: 0,
                    orderRole: "detail",
                    target: "flow.phase",
                    type: "slider",
                    variant: "continuous",
                  },
                },
                title: "Flow",
              },
            ],
            title: "Master Controls",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    expect(
      validateContractAcceptance({
        schema: schemaWithSmallFlowSection,
        acceptance: [
          makeControlAcceptance("flow.speed", "slider"),
          makeControlAcceptance("flow.drift", "slider"),
          makeControlAcceptance("flow.phase", "slider"),
        ],
        sectionInventory: createContractSectionInventoryFixture(
          schemaWithSmallFlowSection,
          [
            {
              entity: "Flow",
              entityId: "flow",
              finiteSelectors: [],
              groupingReason:
                "Flow controls edit one decorative motion entity.",
              id: "flow",
            },
          ],
        ),
        transferMode: {
          animationIntent: {
            behaviorCoverage: [
              "no-user-facing-transport",
              "no-play-pause",
              "no-scrub",
              "no-duration-control",
              "no-loop-control",
              "no-export-at-time",
            ],
            mode: "autonomous",
            reason:
              "The flow speed is a decorative self-running effect and does not expose product time transport.",
          },
          mode: "new-toolcraft-app",
          referenceInputs: [],
        },
      }),
    ).toEqual([]);
  });

  it("rejects splitting one product entity into an object section and a color section", () => {
    const schemaWithSplitEntityColor = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "squares-right",
                controls: {
                  connections: {
                    applicability: { mode: "always" as const },
                    defaultValue: "10",
                    label: "Connections",
                    orderRole: "primary",
                    target: "squares.right.connections",
                    textValueKind: "single-line",
                    type: "text",
                  },
                  hoverRadius: {
                    applicability: { mode: "always" as const },
                    defaultValue: 200,
                    label: "Hover radius",
                    max: 400,
                    min: 0,
                    orderRole: "detail",
                    target: "squares.right.hoverRadius",
                    type: "slider",
                    unit: "px",
                    variant: "continuous",
                  },
                },
                title: "Square 1 (Right)",
              },
              {
                id: "test-section-4",
                controls: {
                  color: {
                    applicability: { mode: "always" as const },
                    defaultValue: "#DEF135",
                    label: "Color",
                    orderRole: "color",
                    target: "squares.right.color",
                    type: "color",
                  },
                },
                title: "Color",
              },
            ],
            title: "Pattern",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    expect(
      validateContractAcceptance({
        schema: schemaWithSplitEntityColor,
        acceptance: [
          makeControlAcceptance("squares.right.connections", "text"),
          makeControlAcceptance("squares.right.hoverRadius", "slider"),
          makeControlAcceptance("squares.right.color", "color"),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'Controls for target family "squares.right" are split across sections: Square 1 (Right), Appearance. Assign one shared entityId when the sections edit one logical entity; the entity cohesion validator decides whether that split is allowed.',
      ]),
    );
  });

  it("accepts color grouped inside the same semantic product entity section", () => {
    const schemaWithGroupedEntityColor = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "squares-right",
                controls: {
                  connections: {
                    applicability: { mode: "always" as const },
                    defaultValue: "10",
                    label: "Connections",
                    orderRole: "primary",
                    target: "squares.right.connections",
                    textValueKind: "single-line",
                    type: "text",
                  },
                  color: {
                    applicability: { mode: "always" as const },
                    defaultValue: "#DEF135",
                    label: "Color",
                    orderRole: "color",
                    target: "squares.right.color",
                    type: "color",
                  },
                  hoverRadius: {
                    applicability: { mode: "always" as const },
                    defaultValue: 200,
                    label: "Hover radius",
                    max: 400,
                    min: 0,
                    orderRole: "detail",
                    target: "squares.right.hoverRadius",
                    type: "slider",
                    unit: "px",
                    variant: "continuous",
                  },
                },
                title: "Square 1 (Right)",
              },
            ],
            title: "Pattern",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    expect(
      validateContractAcceptance({
        schema: schemaWithGroupedEntityColor,
        acceptance: [
          makeControlAcceptance("squares.right.connections", "text"),
          makeControlAcceptance("squares.right.color", "color"),
          makeControlAcceptance("squares.right.hoverRadius", "slider"),
        ],
        sectionInventory: createContractSectionInventoryFixture(
          schemaWithGroupedEntityColor,
          [
            {
              entity: "Right square",
              entityId: "right-square",
              finiteSelectors: [],
              groupingReason:
                "Geometry and color edit one rendered square entity.",
              id: "squares-right",
            },
          ],
        ),
      }),
    ).toEqual([]);
  });
});
