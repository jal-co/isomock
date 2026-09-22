import { describe, expect, it } from "vitest";

import {
  getToolcraftControlOrderTargets,
  inferToolcraftControlOrderRole,
} from "./acceptance/control-order";
import {
  contractSchemaFixture,
  createContractSectionInventoryFixture,
  defineContractSchemaFixture,
  validateContractAcceptance,
  validateContractAcceptanceDiagnostics,
} from "./app-acceptance.contract-fixtures";

describe("starter acceptance control order contract", () => {
  it("requires mode selectors to appear before dependent controls", () => {
    const schemaWithLateModeSelector = {
      ...contractSchemaFixture,
      panels: {
        ...contractSchemaFixture.panels,
        controls: {
          sections: [
            {
              controls: {
                depth: {
                  applicability: {
                    mode: "always" as const,
                    origin: "explicit" as const,
                  },
                  defaultValue: 0.64,
                  label: "Depth",
                  max: 1,
                  min: 0,
                  orderRole: "strength" as const,
                  target: "shader.depth",
                  type: "slider" as const,
                  variant: "continuous" as const,
                },
                mode: {
                  applicability: {
                    mode: "always" as const,
                    origin: "explicit" as const,
                  },
                  defaultValue: "liquid",
                  label: "Mode",
                  options: [
                    { label: "Silk", value: "silk" },
                    { label: "Liquid", value: "liquid" },
                    { label: "Crystal", value: "crystal" },
                  ],
                  orderRole: "mode" as const,
                  target: "shader.mode",
                  type: "segmented" as const,
                },
              },
              id: "volume",
              title: "Volume",
            },
          ],
          title: "Shader",
        },
      },
    };

    expect(
      validateContractAcceptanceDiagnostics({
        schema: schemaWithLateModeSelector,
        acceptance: [
          {
            automated: true,
            automatedTestName: "depth changes rendered output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: depth slider changes rendered output",
            },
            componentType: "slider",
            evidence: "rendered-pixels",
            expectedObservable: "Changing Depth changes shader contrast.",
            fixture: "depth fixture",
            id: "shader.depth",
            kind: "control",
            target: "shader.depth",
            userAction: "Drag the Depth slider.",
          },
          {
            automated: true,
            automatedTestName: "mode changes rendered output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: mode selector changes rendered output",
            },
            componentType: "segmented",
            evidence: "rendered-pixels",
            expectedObservable: "Changing Mode switches shader pattern.",
            fixture: "mode fixture",
            id: "shader.mode",
            kind: "control",
            optionCoverage: "each-visible-item",
            target: "shader.mode",
            userAction: "Select each Mode option.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            'Volume / mode (shader.mode) has orderRole "mode" after depth (shader.depth) with orderRole "strength". Move mode/input/primary controls before dependent strength/detail/advanced controls or split them into an earlier section.',
          ruleId: "controls-layout-heuristics",
          severity: "warning",
        }),
      ]),
    );
  });

  it("accepts explicit order roles when selectors lead dependent controls", () => {
    const schemaWithOrderedControls = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: {
          enabled: true,
          sizing: { mode: "editable-output" },
        },
        panels: {
          controls: {
            sections: [
              {
                id: "volume",
                controls: {
                  blend: {
                    applicability: { mode: "always" as const },
                    defaultValue: "liquid",
                    label: "Blend",
                    options: [
                      { label: "Silk", value: "silk" },
                      { label: "Liquid", value: "liquid" },
                      { label: "Crystal", value: "crystal" },
                    ],
                    orderRole: "mode" as const,
                    target: "shader.blend",
                    type: "segmented",
                  },
                  depth: {
                    applicability: { mode: "always" as const },
                    defaultValue: 0.64,
                    label: "Depth",
                    max: 1,
                    min: 0,
                    orderRole: "strength" as const,
                    target: "shader.depth",
                    type: "slider",
                    variant: "continuous",
                  },
                },
                title: "Volume",
              },
            ],
            title: "Shader",
          },
        },
        toolbar: {
          history: true,
          radar: true,
          zoom: true,
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    expect(getToolcraftControlOrderTargets(schemaWithOrderedControls)).toEqual([
      "shader.blend",
      "shader.depth",
    ]);
    expect(
      validateContractAcceptance({
        schema: schemaWithOrderedControls,
        acceptance: [
          {
            automated: true,
            automatedTestName: "blend changes rendered output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: blend selector changes rendered output",
            },
            componentType: "segmented",
            evidence: "rendered-pixels",
            expectedObservable: "Changing Blend switches shader pattern.",
            fixture: "blend fixture",
            id: "shader.blend",
            kind: "control",
            optionCoverage: "each-visible-item",
            target: "shader.blend",
            userAction: "Select each Blend option.",
          },
          {
            automated: true,
            automatedTestName: "depth changes rendered output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: depth slider changes rendered output",
            },
            componentType: "slider",
            evidence: "rendered-pixels",
            expectedObservable: "Changing Depth changes shader contrast.",
            fixture: "depth fixture",
            id: "shader.depth",
            kind: "control",
            target: "shader.depth",
            userAction: "Drag the Depth slider.",
          },
        ],
        sectionInventory: createContractSectionInventoryFixture(
          schemaWithOrderedControls,
          [
            {
              entity: "Volume",
              entityId: "volume",
              finiteSelectors: [
                {
                  reason:
                    "Blend changes the shader output without changing peer relevance.",
                  role: "parameter",
                  target: "shader.blend",
                },
              ],
              groupingReason:
                "Blend and depth define one rendered shader volume.",
              id: "volume",
            },
          ],
        ),
      }),
    ).toEqual([]);
  });

  it("uses typed orderRole instead of inferring product meaning from copy", () => {
    expect(
      inferToolcraftControlOrderRole({
        applicability: { mode: "always" },
        defaultValue: "liquid",
        label: "Mode",
        options: [{ label: "Liquid", value: "liquid" }],
        target: "producto.eleccion",
        type: "select" as const,
      }),
    ).toBe("primary");
    expect(
      inferToolcraftControlOrderRole({
        applicability: { mode: "always" },
        defaultValue: "liquid",
        label: "Eleccion",
        options: [{ label: "Liquido", value: "liquid" }],
        orderRole: "mode",
        target: "producto.eleccion",
        type: "select" as const,
      }),
    ).toBe("mode");
  });
});
