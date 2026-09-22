import { describe, expect, it } from "vitest";

import {
  createContractSectionInventoryFixture,
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";

describe("starter acceptance valid custom control contract", () => {
  it("accepts custom controls with explicit custom control coverage", () => {
    const schema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "glyphs",
                controls: {
                  glyphRamp: {
                    applicability: { mode: "always" as const },
                    defaultValue: [],
                    label: "Glyph ramp",
                    orderRole: "input",
                    target: "glyph.ramp",
                    type: "glyphRamp",
                  } as never,
                },
                title: "Glyphs",
              },
            ],
            title: "Controls",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    expect(
      validateContractAcceptance({
        schema: schema,
        acceptance: [
          {
            automated: true,
            automatedTestName: "glyph ramp changes output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: glyph ramp changes output",
            },
            builtInFitCheck: {
              capabilities: [
                "collection",
                "commands",
                "custom-interaction",
                "custom-value-model",
                "reorder",
                "selection",
              ],
              checkedBuiltIns: [
                "actions",
                "collectionActions",
                "fileDrop",
                "imagePicker",
                "select",
                "sourceCollection",
              ],
              closestBuiltIn: "fileDrop",
              productObservable:
                "Ordering uploaded glyphs changes the rendered glyph ramp output.",
              whyInsufficient:
                "FileDrop imports source files, but it does not provide density ordering, per-glyph preview, reorder, and remove behavior in one runtime value.",
            },
            componentType: "glyphRamp",
            customControlCoverage: [
              "built-in-gap",
              "kit-primitives",
              "minimal-ui",
              "product-output",
              "runtime-state",
            ],
            evidence: "product-output",
            expectedObservable:
              "Choosing and ordering glyphs changes the rendered product output.",
            fixture: "glyph ramp fixture",
            id: "glyph.ramp",
            kind: "control",
            target: "glyph.ramp",
            userAction: "Upload, reorder, and remove glyphs.",
          },
        ],
        sectionInventory: createContractSectionInventoryFixture(schema, [
          {
            entity: "Glyphs",
            entityId: "glyphs",
            finiteSelectors: [],
            groupingReason: "Glyph controls edit one rendered glyph ramp.",
            id: "glyphs",
          },
        ]),
      }),
    ).toEqual([]);
  });
});
