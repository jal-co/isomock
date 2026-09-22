import { describe, expect, it } from "vitest";

import {
  createContractSectionInventoryFixture,
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import { makeControlAcceptance } from "./app-acceptance.test-utils";

describe("starter acceptance control label groups", () => {
  it("rejects mixed label visibility inside one palette variation color group", () => {
    const schemaWithMixedPaletteBankLabels = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        persistence: { storage: "none" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                controls: {
                  accent1: {
                    applicability: { mode: "always" as const },
                    defaultValue: "#9CE6FF",
                    label: false,
                    target: "palette.accent1",
                    type: "color",
                  },
                  accent2: {
                    applicability: { mode: "always" as const },
                    defaultValue: "#FF7A90",
                    label: "Color 2",
                    target: "palette.accent2",
                    type: "color",
                  },
                  accent3: {
                    applicability: { mode: "always" as const },
                    defaultValue: "#FFD166",
                    label: false,
                    target: "palette.accent3",
                    type: "color",
                  },
                },
                id: "accent-shades",
                title: "Accent Shades",
              },
            ],
            title: "Controls",
          },
        },
      },
      modules: [],
    });

    expect(
      validateContractAcceptance({
        schema: schemaWithMixedPaletteBankLabels,
        acceptance: [
          makeControlAcceptance("palette.accent1", "color"),
          makeControlAcceptance("palette.accent2", "color"),
          makeControlAcceptance("palette.accent3", "color"),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "Accent Shades mixes labeled and unlabeled color items in one palette variation group. Decide label visibility for the whole group: omit all per-item labels when colors only add variety, or label every item only when each color has a distinct user-facing role.",
        'Accent Shades / accent2 uses visible label "Color 2" for one of multiple sibling colors. Set label: false when the colors form one shared bank, or use a distinct user-facing role such as Fill, Stroke, Background, Connector, or Object color.',
      ]),
    );
  });

  it("allows unlabeled palette variation colors and labeled distinct color roles", () => {
    const schemaWithUsefulColorLabels = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        persistence: { storage: "none" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                controls: {
                  accent1: {
                    applicability: { mode: "always" as const },
                    defaultValue: "#9CE6FF",
                    label: false,
                    semanticGroup: "accent-palette",
                    target: "palette.accent1",
                    type: "color",
                  },
                  accent2: {
                    applicability: { mode: "always" as const },
                    defaultValue: "#FF7A90",
                    label: false,
                    semanticGroup: "accent-palette",
                    target: "palette.accent2",
                    type: "color",
                  },
                  spread: {
                    applicability: { mode: "always" as const },
                    defaultValue: 34,
                    label: "Spread",
                    max: 100,
                    min: 0,
                    target: "palette.spread",
                    type: "slider",
                    unit: "%",
                  },
                },
                id: "accent-shades",
                title: "Accent Shades",
              },
              {
                controls: {
                  fill: {
                    applicability: { mode: "always" as const },
                    defaultValue: "#FFFFFF",
                    label: "Fill",
                    target: "object.fill",
                    type: "color",
                  },
                  stroke: {
                    applicability: { mode: "always" as const },
                    defaultValue: "#111111",
                    label: "Stroke",
                    target: "object.stroke",
                    type: "color",
                  },
                },
                id: "object-colors",
                title: "Object Colors",
              },
            ],
            title: "Controls",
          },
        },
      },
      modules: [],
    });

    expect(
      validateContractAcceptance({
        schema: schemaWithUsefulColorLabels,
        acceptance: [
          makeControlAcceptance("palette.accent1", "color"),
          makeControlAcceptance("palette.accent2", "color"),
          makeControlAcceptance("palette.spread", "slider"),
          makeControlAcceptance("object.fill", "color"),
          makeControlAcceptance("object.stroke", "color"),
        ],
        sectionInventory: createContractSectionInventoryFixture(
          schemaWithUsefulColorLabels,
          [
            {
              entity: "Accent shades",
              entityId: "accent-shades",
              finiteSelectors: [],
              groupingReason:
                "Accent colors and spread define one color variation bank.",
              id: "accent-shades",
            },
            {
              entity: "Object colors",
              entityId: "object-colors",
              finiteSelectors: [],
              groupingReason:
                "Fill and stroke define the rendered object colors.",
              id: "object-colors",
            },
          ],
        ),
      }),
    ).toEqual([]);
  });
});
