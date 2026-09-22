import { describe, expect, it } from "vitest";

import {
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import { makeControlAcceptance } from "./app-acceptance.test-utils";

describe("starter acceptance range slider rules", () => {
  it("rejects range slider defaults where lower and upper start equal", () => {
    const schema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-1",
                controls: {
                  opacityRange: {
                    applicability: { mode: "always" as const },
                    defaultValue: [0, 0],
                    label: "Opacity",
                    max: 100,
                    min: 0,
                    step: 1,
                    target: "field.opacityRange",
                    type: "rangeSlider",
                    unit: "%",
                  },
                },
                title: "Field",
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
            automatedTestName:
              "opacity range lower and upper change field output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName:
                "browser: opacity range lower and upper change field output",
            },
            componentType: "rangeSlider",
            controlPartCoverage: ["rangeSlider.lower", "rangeSlider.upper"],
            evidence: "product-output",
            expectedObservable:
              "Changing the lower and upper opacity handles changes field alpha output.",
            fixture: "field opacity range fixture",
            id: "field.opacityRange",
            kind: "control",
            target: "field.opacityRange",
            userAction: "Drag both Opacity handles.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "Field / opacityRange (field.opacityRange) rangeSlider defaultValue must start with different lower and upper values so the two-thumb control does not collapse into a single-value slider.",
      ]),
    );
  });

  it("rejects inline layout groups that include range sliders", () => {
    const schema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-2",
                controls: {
                  opacityRange: {
                    applicability: { mode: "always" as const },
                    defaultValue: [10, 80],
                    label: "Opacity",
                    max: 100,
                    min: 0,
                    step: 1,
                    target: "field.opacityRange",
                    type: "rangeSlider",
                    unit: "%",
                  },
                  speed: {
                    applicability: { mode: "always" as const },
                    defaultValue: 1,
                    label: "Speed",
                    max: 5,
                    min: 0,
                    step: 0.1,
                    target: "field.speed",
                    type: "slider",
                  },
                },
                layoutGroups: [
                  {
                    columns: 2,
                    controls: ["opacityRange", "speed"],
                    layout: "inline",
                  },
                ],
                title: "Field",
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
            automatedTestName:
              "opacity range lower and upper change field output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName:
                "browser: opacity range lower and upper change field output",
            },
            componentType: "rangeSlider",
            controlPartCoverage: ["rangeSlider.lower", "rangeSlider.upper"],
            evidence: "product-output",
            expectedObservable:
              "Changing the lower and upper opacity handles changes field alpha output.",
            fixture: "field opacity range fixture",
            id: "field.opacityRange",
            kind: "control",
            target: "field.opacityRange",
            userAction: "Drag both Opacity handles.",
          },
          {
            automated: true,
            automatedTestName: "speed changes field output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: speed changes field output",
            },
            componentType: "slider",
            evidence: "product-output",
            expectedObservable:
              "Changing Speed changes field animation output.",
            fixture: "field speed fixture",
            id: "field.speed",
            kind: "control",
            target: "field.speed",
            userAction: "Drag the Speed slider.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'Field layoutGroups inline row "opacityRange, speed" includes rangeSlider opacityRange. RangeSlider is a full-width two-thumb control and must not share a row with another slider or range slider.',
      ]),
    );
  });
});
