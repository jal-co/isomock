import { describe, expect, it } from "vitest";

import {
  createContractSectionInventoryFixture,
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import { makeControlAcceptance } from "./app-acceptance.test-utils";

describe("starter acceptance control label contract", () => {
  it("rejects splitting FontPicker-owned typography into sibling controls", () => {
    const schemaWithSplitTypographyBlock = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-1",
                controls: {
                  font: {
                    applicability: { mode: "always" as const },
                    defaultValue: {
                      color: "#FFFFFF",
                      fontId: "inter",
                      fontSize: 16,
                      fontWeight: "400",
                      letterSpacing: "normal",
                      lineHeight: "normal",
                      opacity: 100,
                      textCase: "original",
                    },
                    label: "Font",
                    orderRole: "primary",
                    target: "text.font",
                    type: "fontPicker",
                  },
                  textCase: {
                    applicability: { mode: "always" as const },
                    defaultValue: "uppercase",
                    label: "Case",
                    options: [
                      { label: "As typed", value: "original" },
                      { label: "Uppercase", value: "uppercase" },
                    ],
                    orderRole: "primary",
                    target: "text.case",
                    type: "select",
                  },
                  textColor: {
                    applicability: { mode: "always" as const },
                    defaultValue: { hex: "#DEF135", opacity: 100 },
                    label: "Color",
                    orderRole: "color",
                    target: "text.color",
                    type: "colorOpacity",
                  },
                },
                title: "Text",
              },
            ],
            title: "Controls",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    const fontAcceptance = makeControlAcceptance("text.font", "fontPicker");
    fontAcceptance.controlPartCoverage = [
      "fontPicker.fontId",
      "fontPicker.fontWeight",
      "fontPicker.fontSize",
      "fontPicker.letterSpacing",
      "fontPicker.lineHeight",
      "fontPicker.textCase",
      "fontPicker.color",
      "fontPicker.opacity",
    ];

    const colorAcceptance = makeControlAcceptance("text.color", "colorOpacity");
    colorAcceptance.controlPartCoverage = [
      "colorOpacity.hex",
      "colorOpacity.opacity",
    ];

    expect(
      validateContractAcceptance({
        schema: schemaWithSplitTypographyBlock,
        acceptance: [
          fontAcceptance,
          makeControlAcceptance("text.case", "select"),
          colorAcceptance,
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'Text / textCase splits "Case" out of the FontPicker-owned typography block for "text". Keep font family, weight, size, case, letter spacing, line height, color, and opacity in the same fontPicker value.',
        'Text / textColor splits "Color" out of the FontPicker-owned typography block for "text". Keep font family, weight, size, case, letter spacing, line height, color, and opacity in the same fontPicker value.',
      ]),
    );
  });

  it("rejects FontPicker descriptions that only enumerate owned fields", () => {
    const schemaWithRedundantFontHelp = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-2",
                controls: {
                  font: {
                    applicability: { mode: "always" as const },
                    defaultValue: {
                      color: "#FFFFFF",
                      fontId: "inter",
                      fontSize: 16,
                      fontWeight: "400",
                      letterSpacing: "normal",
                      lineHeight: "normal",
                      opacity: 100,
                      textCase: "original",
                    },
                    description:
                      "Controls the family, weight, size, case, color, opacity, letter spacing, and line height used by the text.",
                    label: "Font",
                    orderRole: "primary",
                    target: "text.font",
                    type: "fontPicker",
                  },
                },
                title: "Font",
              },
            ],
            title: "Controls",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    const fontAcceptance = makeControlAcceptance("text.font", "fontPicker");
    fontAcceptance.controlPartCoverage = [
      "fontPicker.fontId",
      "fontPicker.fontWeight",
      "fontPicker.fontSize",
      "fontPicker.letterSpacing",
      "fontPicker.lineHeight",
      "fontPicker.textCase",
      "fontPicker.color",
      "fontPicker.opacity",
    ];

    expect(
      validateContractAcceptance({
        schema: schemaWithRedundantFontHelp,
        acceptance: [fontAcceptance],
      }),
    ).toEqual(
      expect.arrayContaining([
        "Font / font description repeats FontPicker-owned fields (font family, font weight, font size, case, color, opacity, letter spacing, line height). FontPicker help must explain only non-obvious product behavior; use section titles and visible field labels for font family, weight, size, case, color, opacity, letter spacing, and line height, or omit description.",
      ]),
    );
  });

  it("rejects redundant descriptions in obvious color sections", () => {
    const schemaWithObviousColorHelp = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-3",
                controls: {
                  color1: {
                    applicability: { mode: "always" as const },
                    defaultValue: "#DFFF1A",
                    description: "Sets the first bead color.",
                    label: "Color 1",
                    target: "beads.color1",
                    type: "color",
                  },
                  color2: {
                    applicability: { mode: "always" as const },
                    defaultValue: "#8CFF3A",
                    description: "Sets the second bead color.",
                    label: "Color 2",
                    target: "beads.color2",
                    type: "color",
                  },
                  colorSpread: {
                    applicability: { mode: "always" as const },
                    defaultValue: 34,
                    description:
                      "Controls how often beads use colors 2-5 instead of Color 1.",
                    label: "Spread",
                    max: 100,
                    min: 0,
                    target: "beads.colorSpread",
                    type: "slider",
                    unit: "%",
                  },
                },
                title: "Bead Colors",
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
        schema: schemaWithObviousColorHelp,
        acceptance: [
          makeControlAcceptance("beads.color1", "color"),
          makeControlAcceptance("beads.color2", "color"),
          makeControlAcceptance("beads.colorSpread", "slider"),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "Bead Colors / color1 description adds a help icon to an obvious color-section control. Omit control.description when the section title and visible label already explain the setting.",
        "Bead Colors / color2 description adds a help icon to an obvious color-section control. Omit control.description when the section title and visible label already explain the setting.",
        "Bead Colors / colorSpread description adds a help icon to an obvious color-section control. Omit control.description when the section title and visible label already explain the setting.",
      ]),
    );
  });

  it("rejects visible labels for palette variation color banks", () => {
    const schemaWithLabeledPaletteBank = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "accent-shades",
                controls: {
                  accent1: {
                    applicability: { mode: "always" as const },
                    defaultValue: "#9CE6FF",
                    label: "Color 1",
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
                title: "Accent Shades",
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
        schema: schemaWithLabeledPaletteBank,
        acceptance: [
          makeControlAcceptance("palette.accent1", "color"),
          makeControlAcceptance("palette.accent2", "color"),
          makeControlAcceptance("palette.spread", "slider"),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'Accent Shades / accent1 uses visible label "Color 1" for one of multiple sibling colors. Set label: false when the colors form one shared bank, or use a distinct user-facing role such as Fill, Stroke, Background, Connector, or Object color.',
        'Accent Shades / accent2 uses visible label "Color 2" for one of multiple sibling colors. Set label: false when the colors form one shared bank, or use a distinct user-facing role such as Fill, Stroke, Background, Connector, or Object color.',
      ]),
    );
  });

  it("rejects sequential labels for sibling colors without palette keywords", () => {
    const schemaWithSpectrumColors = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-5",
                controls: {
                  spectrum: {
                    applicability: { mode: "always" as const },
                    defaultValue: "custom",
                    label: "Spectrum",
                    options: [{ label: "Custom", value: "custom" }],
                    target: "dispersion.spectrum",
                    type: "select",
                  },
                  customColorA: {
                    applicability: { mode: "always" as const },
                    defaultValue: "#A65F15",
                    label: "Color 1",
                    semanticGroup: "custom-spectrum",
                    target: "dispersion.customColorA",
                    type: "color",
                  },
                  customColorB: {
                    applicability: { mode: "always" as const },
                    defaultValue: "#371C4D",
                    label: "Color 2",
                    semanticGroup: "custom-spectrum",
                    target: "dispersion.customColorB",
                    type: "color",
                  },
                  customColorC: {
                    applicability: { mode: "always" as const },
                    defaultValue: "#375B75",
                    label: "Color 3",
                    semanticGroup: "custom-spectrum",
                    target: "dispersion.customColorC",
                    type: "color",
                  },
                  customColorD: {
                    applicability: { mode: "always" as const },
                    defaultValue: "#2A343E",
                    label: "Color 4",
                    semanticGroup: "custom-spectrum",
                    target: "dispersion.customColorD",
                    type: "color",
                  },
                },
                title: "Spectrum",
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
        schema: schemaWithSpectrumColors,
        acceptance: [
          makeControlAcceptance("dispersion.spectrum", "select"),
          makeControlAcceptance("dispersion.customColorA", "color"),
          makeControlAcceptance("dispersion.customColorB", "color"),
          makeControlAcceptance("dispersion.customColorC", "color"),
          makeControlAcceptance("dispersion.customColorD", "color"),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('customColorA uses visible label "Color 1"'),
        expect.stringContaining('customColorB uses visible label "Color 2"'),
        expect.stringContaining('customColorC uses visible label "Color 3"'),
        expect.stringContaining('customColorD uses visible label "Color 4"'),
      ]),
    );
  });
});
