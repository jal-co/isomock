import {
  defineToolcraft,
  doesToolcraftApplicabilityMatch,
} from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";

import {
  getToolcraftControlSectionHeuristicErrors,
  getToolcraftControlSectionInvariantErrors,
} from "./acceptance/control-layout";
import {
  createContractSectionInventoryFixture,
  defineContractSchemaFixture,
  validateContractAcceptanceDiagnostics,
} from "./app-acceptance.contract-fixtures";
import { getBlockingToolcraftAcceptanceMessages } from "./acceptance/validation-pipeline";

function makeSliderControls(count: number, includeSemanticGroup: boolean) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const control = {
        applicability: { mode: "always" as const },
        defaultValue: 0,
        label: `Value ${index + 1}`,
        max: 1,
        min: 0,
        orderRole: "detail" as const,
        target: `dense.value${index + 1}`,
        type: "slider" as const,
        variant: "continuous" as const,
      };

      return [
        `value${index + 1}`,
        includeSemanticGroup
          ? { ...control, semanticGroup: "dense-entity" }
          : control,
      ];
    }),
  );
}

function makeDenseSchema(count: number, includeSemanticGroup = true) {
  return defineToolcraft({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              controls: makeSliderControls(count, includeSemanticGroup),
              id: "dense-entity",
              title: "Dense Entity",
            },
          ],
          title: "Controls",
        },
      },
    },
    modules: [],
  });
}

describe("starter acceptance section density guidance", () => {
  it("does not treat mutually exclusive declarations as simultaneous visual density", () => {
    const schema = defineContractSchemaFixture({
      base: {
        identity: { id: "branch-fixture", title: "Branch fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            title: "Controls",
            sections: [
              {
                id: "envelope",
                title: "Envelope",
                controls: {
                  mode: {
                    applicability: { mode: "always" },
                    defaultValue: "a",
                    type: "select",
                    label: "Mode",
                    target: "envelope.mode",
                    options: [
                      { label: "A", value: "a" },
                      { label: "B", value: "b" },
                    ],
                  },
                  ...Object.fromEntries(
                    ["a", "b"].flatMap((mode) =>
                      Object.entries(makeSliderControls(6, false)).map(
                        ([id, control]) => [
                          `${mode}-${id}`,
                          {
                            ...control,
                            target: `envelope.${mode}.${id}`,
                            applicability: {
                              mode: "conditional" as const,
                              all: [{ target: "envelope.mode", equals: mode }],
                            },
                          },
                        ],
                      ),
                    ),
                  ),
                },
              },
            ],
          },
        },
      },
      modules: [],
    });
    const controls = Object.values(
      schema.panels.controls!.sections.find(({ id }) => id === "envelope")!
        .controls,
    );
    for (const mode of ["a", "b"]) {
      expect(
        controls.filter(({ applicability }) =>
          doesToolcraftApplicabilityMatch(applicability, () => mode),
        ),
      ).toHaveLength(7);
    }
    expect(getToolcraftControlSectionInvariantErrors(schema)).toEqual([]);
    expect(getToolcraftControlSectionHeuristicErrors(schema)).toEqual([
      expect.stringContaining("13 declared controls"),
    ]);
    expect(getToolcraftControlSectionHeuristicErrors(schema)[0]).toContain(
      "declaration count alone does not prove visual density",
    );
  });

  it.each([7, 8, 10, 11, 12, 25])(
    "does not impose a count-based invariant at %s controls",
    (count) => {
      expect(
        getToolcraftControlSectionInvariantErrors(
          makeDenseSchema(count, false),
        ),
      ).toEqual([]);
    },
  );

  it.each([9, 10, 11, 25])(
    "keeps the density review non-blocking at %s declarations",
    (count) => {
      const schema = makeDenseSchema(count, false);
      const sectionInventory = createContractSectionInventoryFixture(schema, [
        {
          entity: "Dense Entity",
          entityId: "dense-entity",
          finiteSelectors: [],
          groupingReason:
            "These parameters tune one coherent surface with one reset boundary.",
          id: "dense-entity",
        },
      ]);
      const diagnostics = validateContractAcceptanceDiagnostics({
        schema,
        sectionInventory,
      }).filter(({ ruleId }) =>
        [
          "controls-layout-heuristics",
          "controls-section-inventory-required",
          "controls-component-layout-invariants",
        ].includes(ruleId),
      );

      expect(getBlockingToolcraftAcceptanceMessages(diagnostics)).toEqual([]);
      const density = diagnostics.filter(({ message }) =>
        message.includes("declared controls"),
      );
      expect(density).toHaveLength(count >= 10 ? 1 : 0);
      if (count >= 10) {
        expect(density[0]).toMatchObject({
          message: expect.stringContaining(`${count} declared controls`),
          ruleId: "controls-layout-heuristics",
          severity: "warning",
        });
        expect(density[0]?.message).toContain("simultaneously visible");
        expect(density[0]?.message).toContain("not a section limit");
      }
    },
  );
});
