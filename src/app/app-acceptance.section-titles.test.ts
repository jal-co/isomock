import type { ResolvedToolcraftAppSchema } from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";

import { getToolcraftSectionTitleWordCount } from "./acceptance/section-title-rules";
import {
  createContractSectionInventoryFixture,
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import { makeControlAcceptance } from "./app-acceptance.test-utils";
import {
  defineExportModuleSchemaFixture,
  forgeResolvedExportSections,
} from "./app-acceptance.export-test-utils";

function validateTitle(title: string): string[] {
  const schema = defineContractSchemaFixture({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      persistence: { storage: "none" },
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                trendline: {
                  applicability: { mode: "always" as const },
                  defaultValue: true,
                  label: "Trendline",
                  target: "revenue.trendline",
                  type: "switch",
                },
              },
              id: "incremental-revenue",
              title,
            },
          ],
          title: "Revenue",
        },
      },
    },
    modules: [],
  });

  return validateContractAcceptance({
    acceptance: [makeControlAcceptance("revenue.trendline", "switch")],
    schema,
    sectionInventory: createContractSectionInventoryFixture(schema, [
      {
        entity: "Revenue trendline",
        entityId: "incremental-revenue",
        finiteSelectors: [
          {
            reason:
              "Trendline visibility changes one accepted output parameter.",
            role: "parameter",
            target: "revenue.trendline",
          },
        ],
        groupingReason:
          "The switch controls the incremental revenue trendline.",
        id: "incremental-revenue",
      },
    ]),
  });
}

describe("starter acceptance section title contract", () => {
  it("accepts concise section titles through the four-word boundary", () => {
    expect(validateTitle("Incremental Revenue")).toEqual([]);
    expect(validateTitle("North America Revenue Growth")).toEqual([]);
  });

  it("accepts localized words containing Unicode combining marks", () => {
    expect(getToolcraftSectionTitleWordCount("e\u0301clair")).toBe(1);
    expect(getToolcraftSectionTitleWordCount("हिन्दी भाषा")).toBe(2);
    expect(validateTitle("e\u0301clair")).toEqual([]);
    expect(validateTitle("हिन्दी भाषा")).toEqual([]);
  });

  it("rejects a five-word title within the code-point budget", () => {
    expect(validateTitle("one two three four five")).toEqual([
      'Section title "one two three four five" is too long (5 words, 23 characters; maximum 4 words and 32 characters). Keep only the product entity in the visible title, normally 1–3 words, and move non-obvious context into section.description.',
    ]);
  });

  it("accepts 32 code points and rejects 33 code points in one word", () => {
    const titleAtLimit = "a".repeat(32);
    const titleAboveLimit = "a".repeat(33);

    expect(validateTitle(titleAtLimit)).toEqual([]);
    expect(validateTitle(titleAboveLimit)).toEqual([
      `Section title "${titleAboveLimit}" is too long (1 word, 33 characters; maximum 4 words and 32 characters). Keep only the product entity in the visible title, normally 1–3 words, and move non-obvious context into section.description.`,
    ]);
  });

  it("preserves the exact reported overlong title diagnostic", () => {
    expect(validateTitle("Tab 3 points · Incremental Revenue")).toEqual(
      expect.arrayContaining([
        'Section title "Tab 3 points · Incremental Revenue" is too long (5 words, 34 characters; maximum 4 words and 32 characters). Keep only the product entity in the visible title, normally 1–3 words, and move non-obvious context into section.description.',
      ]),
    );
  });

  it("exempts normalized sticky panelActions-only section titles", () => {
    const schema = forgeResolvedExportSections(
      defineExportModuleSchemaFixture({ image: true }),
      (sections) =>
        sections.map((section) =>
          Object.values(section.controls).every(
            ({ type }) => type === "panelActions",
          )
            ? {
                ...section,
                title: "Technical Product Artifact Delivery Actions",
              }
            : section,
        ),
    );

    expect(validateContractAcceptance({ schema })).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'Section title "Technical Product Artifact Delivery Actions" is too long',
        ),
      ]),
    );
  });

  it("rejects generic and control-type section titles", () => {
    const schemaWithWeakSectionTitles = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-1",
                controls: {
                  amount: {
                    applicability: { mode: "always" as const },
                    defaultValue: 0.5,
                    label: "Amount",
                    max: 1,
                    min: 0,
                    orderRole: "strength",
                    target: "shader.amount",
                    type: "slider",
                    variant: "continuous",
                  },
                },
                title: "Settings",
              },
              {
                id: "test-section-2",
                controls: {
                  grain: {
                    applicability: { mode: "always" as const },
                    defaultValue: 0.1,
                    label: "Grain",
                    max: 1,
                    min: 0,
                    orderRole: "detail",
                    target: "shader.grain",
                    type: "slider",
                    variant: "continuous",
                  },
                },
                title: "Sliders",
              },
            ],
            title: "Shader",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    expect(
      validateContractAcceptance({
        schema: schemaWithWeakSectionTitles,
        acceptance: [
          makeControlAcceptance("shader.amount", "slider"),
          makeControlAcceptance("shader.grain", "slider"),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "Settings is too generic for a controls section. Name the product entity, workflow stage, or behavior it edits instead of using a bucket title.",
        "Sliders names a UI control type instead of the product entity. Group controls by product meaning, not by Slider, Color, Input, Button, or similar component type.",
      ]),
    );
  });

  it("rejects visible controls sections without titles", () => {
    const schema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-3",
                controls: {
                  amount: {
                    applicability: { mode: "always" as const },
                    defaultValue: 0.5,
                    label: "Amount",
                    max: 1,
                    min: 0,
                    orderRole: "strength",
                    target: "shader.amount",
                    type: "slider",
                    variant: "continuous",
                  },
                },
                title: "Shader",
              },
            ],
            title: "Shader",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });
    const schemaWithMissingTitle: ResolvedToolcraftAppSchema = {
      ...schema,
      panels: {
        ...schema.panels,
        controls: schema.panels.controls
          ? {
              ...schema.panels.controls,
              sections: schema.panels.controls.sections.map((section) =>
                section.title === "Shader"
                  ? { ...section, title: undefined }
                  : section,
              ),
            }
          : schema.panels.controls,
      },
    };

    expect(
      validateContractAcceptance({
        schema: schemaWithMissingTitle,
        acceptance: [makeControlAcceptance("shader.amount", "slider")],
      }),
    ).toEqual(
      expect.arrayContaining([
        `untitled section ${(schema.panels.controls?.sections.findIndex(section => section.title === "Shader") ?? -1) + 1} is missing a controls section title. Every visible controls-panel section must name the product entity, workflow stage, or behavior it edits.`,
      ]),
    );
  });

  it("rejects duplicate section titles", () => {
    const schemaWithDuplicateSections = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-4",
                controls: {
                  count: {
                    applicability: { mode: "always" as const },
                    defaultValue: 10,
                    label: "Count",
                    max: 50,
                    min: 1,
                    orderRole: "detail",
                    target: "shape.primary.count",
                    type: "slider",
                    variant: "continuous",
                  },
                },
                title: "Shape",
              },
              {
                id: "test-section-5",
                controls: {
                  radius: {
                    applicability: { mode: "always" as const },
                    defaultValue: 8,
                    label: "Radius",
                    max: 40,
                    min: 0,
                    orderRole: "spatial",
                    target: "shape.secondary.radius",
                    type: "slider",
                    variant: "continuous",
                  },
                },
                title: "Shape",
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
        schema: schemaWithDuplicateSections,
        acceptance: [
          makeControlAcceptance("shape.primary.count", "slider"),
          makeControlAcceptance("shape.secondary.radius", "slider"),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'Controls panel repeats the section title "Shape" 2 times. Section titles must be unique and describe distinct product entities or workflow stages.',
      ]),
    );
  });
});
