import { describe, expect, it } from "vitest";

import {
  contractSchemaFixture,
  createContractSectionInventoryFixture,
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";

describe("starter acceptance slider rule contract", () => {
  it("accepts stepped continuous sliders without forcing the discrete visual variant", () => {
    const schemaWithAmbiguousSlider = defineContractSchemaFixture({
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
                controls: {
                  grain: {
                    applicability: { mode: "always" as const },
                    defaultValue: 0.08,
                    label: "Grain",
                    max: 0.35,
                    min: 0,
                    step: 0.01,
                    target: "shader.grain",
                    type: "slider",
                    variant: "continuous",
                  },
                },
                id: "volume",
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

    expect(
      validateContractAcceptance({
        schema: schemaWithAmbiguousSlider,
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
          schemaWithAmbiguousSlider,
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

  it("uses typed discrete intent instead of English slider wording", () => {
    const schemaWithMissingDiscreteSliders = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-2",
                controls: {
                  maskGap: {
                    applicability: { mode: "always" as const },
                    defaultValue: 5,
                    label: "Separación",
                    max: 12,
                    min: 0,
                    orderRole: "detail",
                    step: 1,
                    sliderValueKind: "discrete" as const,
                    target: "ascii.maskGap",
                    type: "slider",
                    unit: "cols",
                  },
                  verticalJitter: {
                    applicability: { mode: "always" as const },
                    defaultValue: 1,
                    label: "Desplazamiento",
                    max: 4,
                    min: 0,
                    orderRole: "detail",
                    step: 1,
                    sliderValueKind: "discrete",
                    target: "ascii.verticalJitter",
                    type: "slider",
                    unit: "rows",
                  },
                },
                title: "Mask",
              },
            ],
            title: "ASCII",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    expect(
      validateContractAcceptance({
        schema: schemaWithMissingDiscreteSliders,
        acceptance: [
          {
            automated: true,
            automatedTestName: "mask gap changes rendered output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: mask gap slider changes rendered output",
            },
            componentType: "slider",
            evidence: "rendered-pixels",
            expectedObservable:
              "Changing Mask gap changes row reveal boundaries.",
            fixture: "ASCII fixture",
            id: "ascii.maskGap",
            kind: "control",
            target: "ascii.maskGap",
            userAction: "Drag the Mask gap slider.",
          },
          {
            automated: true,
            automatedTestName: "vertical jitter changes rendered output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName:
                "browser: vertical jitter slider changes rendered output",
            },
            componentType: "slider",
            evidence: "rendered-pixels",
            expectedObservable:
              "Changing Vertical jitter changes row displacement.",
            fixture: "ASCII fixture",
            id: "ascii.verticalJitter",
            kind: "control",
            target: "ascii.verticalJitter",
            userAction: "Drag the Vertical jitter slider.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'Mask / maskGap (ascii.maskGap) has 13 semantic integer positions and must use variant "discrete" so Toolcraft renders tick markers.',
        'Mask / verticalJitter (ascii.verticalJitter) has 5 semantic integer positions and must use variant "discrete" so Toolcraft renders tick markers.',
      ]),
    );
  });

  it("requires flip-depth integer sliders to use the visual discrete variant", () => {
    const schemaWithFlipDepthSlider = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-3",
                controls: {
                  speed: {
                    applicability: { mode: "always" as const },
                    defaultValue: 1.1,
                    label: "Speed",
                    max: 2.5,
                    min: 0.5,
                    step: 0.1,
                    target: "animation.speed",
                    type: "slider",
                    variant: "continuous",
                  },
                  depth: {
                    applicability: { mode: "always" as const },
                    defaultValue: 12,
                    label: "Flip depth",
                    max: 28,
                    min: 4,
                    sliderValueKind: "discrete",
                    step: 1,
                    target: "animation.depth",
                    type: "slider",
                    variant: "continuous",
                  },
                },
                title: "Motion",
              },
            ],
            title: "Board",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    expect(
      validateContractAcceptance({
        schema: schemaWithFlipDepthSlider,
        acceptance: [
          {
            automated: true,
            automatedTestName: "speed changes animation timing",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: speed slider changes animation timing",
            },
            componentType: "slider",
            evidence: "rendered-pixels",
            expectedObservable: "Changing Speed changes the animation cadence.",
            fixture: "board speed fixture",
            id: "animation.speed",
            kind: "control",
            target: "animation.speed",
            userAction: "Drag the Speed slider.",
          },
          {
            automated: true,
            automatedTestName: "flip depth changes intermediate characters",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName:
                "browser: flip depth slider changes intermediate characters",
            },
            componentType: "slider",
            evidence: "rendered-pixels",
            expectedObservable:
              "Changing Flip depth changes the number of intermediate character steps.",
            fixture: "board flip depth fixture",
            id: "animation.depth",
            kind: "control",
            target: "animation.depth",
            userAction: "Drag the Flip depth slider.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'Motion / depth (animation.depth) has 25 semantic integer positions and must use variant "discrete" so Toolcraft renders tick markers.',
      ]),
    );
  });

  it("accepts large or precision stepped sliders as visually continuous", () => {
    const schemaWithContinuousSteppedSliders = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "timing",
                controls: {
                  revealSpeed: {
                    applicability: { mode: "always" as const },
                    defaultValue: 118,
                    label: "Reveal speed",
                    max: 150,
                    min: 0,
                    orderRole: "primary",
                    step: 1,
                    target: "ascii.speed",
                    type: "slider",
                    unit: "cols/s",
                  },
                  flipDuration: {
                    applicability: { mode: "always" as const },
                    defaultValue: 0.6,
                    label: "Flip duration",
                    max: 5,
                    min: 0,
                    orderRole: "strength",
                    step: 0.1,
                    target: "ascii.flipDurationSec",
                    type: "slider",
                    unit: "s",
                  },
                },
                title: "Timing",
              },
            ],
            title: "ASCII",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    expect(
      validateContractAcceptance({
        schema: schemaWithContinuousSteppedSliders,
        acceptance: [
          {
            automated: true,
            automatedTestName: "reveal speed changes rendered output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: reveal speed slider changes rendered output",
            },
            componentType: "slider",
            evidence: "rendered-pixels",
            expectedObservable: "Changing Reveal speed changes reveal density.",
            fixture: "ASCII fixture",
            id: "ascii.speed",
            kind: "control",
            target: "ascii.speed",
            userAction: "Drag the Reveal speed slider.",
          },
          {
            automated: true,
            automatedTestName: "flip duration changes rendered output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: flip duration slider changes rendered output",
            },
            componentType: "slider",
            evidence: "rendered-pixels",
            expectedObservable:
              "Changing Flip duration changes animation timing.",
            fixture: "ASCII fixture",
            id: "ascii.flipDurationSec",
            kind: "control",
            target: "ascii.flipDurationSec",
            userAction: "Drag the Flip duration slider.",
          },
        ],
        sectionInventory: createContractSectionInventoryFixture(
          schemaWithContinuousSteppedSliders,
          [
            {
              entity: "Timing",
              entityId: "timing",
              finiteSelectors: [],
              groupingReason:
                "Speed and duration control one animation timing model.",
              id: "timing",
            },
          ],
        ),
      }),
    ).toEqual([]);
  });
});
