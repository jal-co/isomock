import { describe, expect, it } from "vitest";

import { getSliderVariantClassificationErrors } from "./acceptance/control-component-rules";
import {
  contractSchemaFixture,
  createContractSectionInventoryFixture,
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";

describe("starter acceptance slider marker contract", () => {
  it("requires discrete slider markerCount to match the step count", () => {
    const schemaWithDiscreteSlider = {
      ...contractSchemaFixture,
      panels: {
        ...contractSchemaFixture.panels,
        controls: {
          sections: [
            {
              controls: {
                grain: {
                  applicability: {
                    mode: "always" as const,
                    origin: "explicit" as const,
                  },
                  defaultValue: 0.08,
                  label: "Grain",
                  markerCount: 6,
                  max: 1,
                  min: 0,
                  sliderValueKind: "discrete" as const,
                  step: 0.1,
                  target: "shader.grain",
                  type: "slider" as const,
                  variant: "discrete" as const,
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
      validateContractAcceptance({
        schema: schemaWithDiscreteSlider,
        acceptance: [
          {
            automated: true,
            automatedTestName: "grain changes rendered output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: grain slider changes rendered output",
            },
            componentType: "slider",
            evidence: "rendered-pixels",
            expectedObservable: "Changing Grain changes pixel variance.",
            fixture: "grain fixture",
            id: "shader.grain",
            kind: "control",
            target: "shader.grain",
            userAction: "Drag the Grain slider.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "Volume / grain (shader.grain) discrete slider must render one marker per step; expected markerCount 11, received 6.",
      ]),
    );
  });

  it("rejects visual discrete sliders with too many positions", () => {
    expect(
      getSliderVariantClassificationErrors({
        control: {
          applicability: { mode: "always" },
          defaultValue: 118,
          label: "Reveal speed",
          max: 150,
          min: 0,
          orderRole: "primary",
          sliderValueKind: "discrete",
          step: 1,
          target: "ascii.speed",
          type: "slider" as const,
          unit: "cols/s",
          variant: "discrete" as const,
        },
        controlId: "revealSpeed",
        label: "Timing / revealSpeed (ascii.speed)",
      }),
    ).toEqual([
      'Timing / revealSpeed (ascii.speed) declares variant "discrete" with 151 positions, which would overload tick markers. Keep it stepped continuous or use a different control.',
    ]);
  });

  it("uses the shared 32-position acceptance boundary", () => {
    const base = {
      applicability: { mode: "always" as const },
      defaultValue: 16,
      min: 0,
      sliderValueKind: "discrete" as const,
      step: 1,
      target: "shape.count",
      type: "slider" as const,
    };

    expect(
      getSliderVariantClassificationErrors({
        control: { ...base, max: 31, variant: "discrete" },
        controlId: "count",
        label: "Shape / count (shape.count)",
      }),
    ).toEqual([]);
    const overloadedErrors = getSliderVariantClassificationErrors({
      control: { ...base, max: 32, variant: "discrete" },
      controlId: "count",
      label: "Shape / count (shape.count)",
    });

    expect(overloadedErrors).toEqual([
      'Shape / count (shape.count) declares variant "discrete" with 33 positions, which would overload tick markers. Keep it stepped continuous or use a different control.',
    ]);
  });

  it("accepts continuous stepped sliders without visual markers", () => {
    const schemaWithNormalizedSlider = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        persistence: { storage: "none" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                controls: {
                  grain: {
                    applicability: { mode: "always" },
                    defaultValue: 0.08,
                    label: "Grain",
                    max: 1,
                    min: 0,
                    step: 0.1,
                    target: "shader.grain",
                    type: "slider" as const,
                  },
                },
                id: "volume",
                title: "Volume",
              },
            ],
            title: "Shader",
          },
        },
      },
      modules: [],
    });

    expect(
      validateContractAcceptance({
        schema: schemaWithNormalizedSlider,
        acceptance: [
          {
            automated: true,
            automatedTestName: "grain changes rendered output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: grain slider changes rendered output",
            },
            componentType: "slider",
            evidence: "rendered-pixels",
            expectedObservable: "Changing Grain changes pixel variance.",
            fixture: "grain fixture",
            id: "shader.grain",
            kind: "control",
            target: "shader.grain",
            userAction: "Drag the Grain slider.",
          },
        ],
        sectionInventory: createContractSectionInventoryFixture(
          schemaWithNormalizedSlider,
          [
            {
              entity: "Volume",
              entityId: "volume",
              finiteSelectors: [],
              groupingReason: "Grain controls the rendered shader volume.",
              id: "volume",
            },
          ],
        ),
      }),
    ).toEqual([]);
  });
});
