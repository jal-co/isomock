import { describe, expect, it } from "vitest";

import {
  createContractSectionInventoryFixture,
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import { makeControlAcceptance } from "./app-acceptance.test-utils";
import type { ToolcraftComponentAcceptance } from "./acceptance/types";

describe("starter acceptance compound control part coverage contract", () => {
  it("distinguishes user-owned and source-owned collection parts", () => {
    const collectionSchema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-1",
                controls: {
                  editableColors: {
                    applicability: { mode: "always" as const },
                    defaultValue: [{ hex: "#DFFF1A" }],
                    itemControl: { label: false, type: "color" },
                    target: "colors.editable",
                    type: "collectionActions",
                  },
                  editableLayers: {
                    applicability: { mode: "always" as const },
                    defaultValue: [{ enabled: true, strength: 0.5 }],
                    itemControls: {
                      enabled: {
                        defaultValue: true,
                        label: "Enabled",
                        type: "switch",
                      },
                      strength: {
                        defaultValue: 0.5,
                        label: "Strength",
                        max: 1,
                        min: 0,
                        type: "slider",
                      },
                    },
                    itemLabel: "Layer",
                    target: "layers.editable",
                    type: "collectionActions",
                  },
                  sourceColors: {
                    applicability: { mode: "always" as const },
                    defaultValue: [{ hex: "#8CFF3A" }],
                    itemControl: { label: false, type: "color" },
                    target: "colors.source",
                    type: "sourceCollection",
                  },
                },
                title: "Fill Sections",
              },
            ],
            title: "Controls",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });
    const acceptance: ToolcraftComponentAcceptance[] = [
      makeControlAcceptance("colors.editable", "collectionActions"),
      makeControlAcceptance("layers.editable", "collectionActions"),
      makeControlAcceptance("colors.source", "sourceCollection"),
    ];

    expect(
      validateContractAcceptance({ schema: collectionSchema, acceptance }),
    ).toEqual(
      expect.arrayContaining([
        "Fill Sections / editableColors (colors.editable) must declare controlPartCoverage for every semantic value part: collectionActions.add, collectionActions.remove, collectionActions.items.",
        "Fill Sections / editableLayers (layers.editable) must declare controlPartCoverage for every semantic value part: collectionActions.add, collectionActions.remove, collectionActions.items.",
        "Fill Sections / sourceColors (colors.source) must declare controlPartCoverage for every semantic value part: sourceCollection.items.",
      ]),
    );
  });

  it("requires compound controls to cover every semantic value part", () => {
    const compoundSchema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-2",
                controls: {
                  anchor: {
                    applicability: { mode: "always" as const },
                    defaultValue: "center",
                    label: "Anchor",
                    orderRole: "spatial",
                    target: "mesh.anchor",
                    type: "anchorGrid",
                  },
                  focus: {
                    applicability: { mode: "always" as const },
                    defaultValue: { x: "0.00", y: "0.00" },
                    label: "Focus",
                    orderRole: "spatial",
                    target: "mesh.focus",
                    type: "vector",
                  },
                  gradient: {
                    applicability: { mode: "always" as const },
                    defaultValue: {
                      angle: 120,
                      gradientType: "linear",
                      stops: [
                        { color: "#1D1264", opacity: 100, position: "0%" },
                        { color: "#22A7FF", opacity: 100, position: "50%" },
                        { color: "#FFE97A", opacity: 100, position: "100%" },
                      ],
                    },
                    label: "Gradient",
                    orderRole: "color",
                    target: "mesh.gradient",
                    type: "gradient",
                  },
                  palette: {
                    applicability: { mode: "always" as const },
                    defaultValue: { family: "Amber", shade: "500" },
                    label: "Palette",
                    orderRole: "color",
                    target: "mesh.palette",
                    type: "palette",
                  },
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
                    target: "mesh.font",
                    type: "fontPicker",
                  },
                  range: {
                    applicability: { mode: "always" as const },
                    defaultValue: { end: "80%", start: "20%" },
                    label: "Range",
                    orderRole: "primary",
                    target: "mesh.range",
                    type: "rangeInput",
                  },
                  band: {
                    applicability: { mode: "always" as const },
                    defaultValue: [20, 80],
                    label: "Band",
                    max: 100,
                    min: 0,
                    orderRole: "primary",
                    step: 1,
                    target: "mesh.band",
                    type: "rangeSlider",
                  },
                  mixer: {
                    applicability: { mode: "always" as const },
                    defaultValue: {
                      B: { B: 100, G: 0, R: 0 },
                      G: { B: 0, G: 100, R: 0 },
                      R: { B: 0, G: 0, R: 100 },
                    },
                    label: "Channels",
                    orderRole: "color",
                    target: "mesh.channels",
                    type: "channelMixer",
                  },
                  curves: {
                    applicability: { mode: "always" as const },
                    curveIntent: "color-channels",
                    defaultValue: {
                      activeChannel: "RGB",
                      points: {
                        B: [
                          { x: 0, y: 0 },
                          { x: 1, y: 1 },
                        ],
                        G: [
                          { x: 0, y: 0 },
                          { x: 1, y: 1 },
                        ],
                        R: [
                          { x: 0, y: 0 },
                          { x: 1, y: 1 },
                        ],
                        RGB: [
                          { x: 0, y: 0 },
                          { x: 1, y: 1 },
                        ],
                      },
                    },
                    label: "Curves",
                    orderRole: "color",
                    target: "mesh.curves",
                    type: "curves",
                  },
                },
                title: "Compound",
              },
            ],
            title: "Controls",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    const acceptance = [
      "mesh.anchor",
      "mesh.focus",
      "mesh.gradient",
      "mesh.palette",
      "mesh.font",
      "mesh.range",
      "mesh.band",
      "mesh.channels",
      "mesh.curves",
    ].map(
      (target): ToolcraftComponentAcceptance => ({
        automated: true,
        automatedTestName: `${target} changes output`,
        browser: {
          budget: "standard",
          file: "e2e/app-controls.spec.ts",
          testName: `browser: ${target} changes output`,
        },
        componentType:
          target === "mesh.anchor"
            ? "anchorGrid"
            : target === "mesh.focus"
              ? "vector"
              : target === "mesh.gradient"
                ? "gradient"
                : target === "mesh.palette"
                  ? "palette"
                  : target === "mesh.font"
                    ? "fontPicker"
                    : target === "mesh.range"
                      ? "rangeInput"
                      : target === "mesh.band"
                        ? "rangeSlider"
                        : target === "mesh.channels"
                          ? "channelMixer"
                          : "curves",
        evidence: "product-output" as const,
        expectedObservable: `${target} changes the rendered product output.`,
        fixture: "compound fixture",
        id: target,
        kind: "control" as const,
        target,
        userAction: `Change ${target}.`,
      }),
    );

    expect(
      validateContractAcceptance({
        schema: compoundSchema,
        acceptance: acceptance,
      }),
    ).toEqual(
      expect.arrayContaining([
        "Mesh / anchor (mesh.anchor) must declare controlPartCoverage for every semantic value part: anchorGrid.position.",
        "Mesh / focus (mesh.focus) must declare controlPartCoverage for every semantic value part: vector.x, vector.y.",
        "Mesh / gradient (mesh.gradient) must declare controlPartCoverage for every semantic value part: gradient.gradientType, gradient.angle, gradient.stops.position, gradient.stops.color, gradient.stops.opacity.",
        "Mesh / palette (mesh.palette) must declare controlPartCoverage for every semantic value part: palette.family, palette.shade.",
        "Mesh / font (mesh.font) must declare controlPartCoverage for every semantic value part: fontPicker.fontId, fontPicker.fontWeight, fontPicker.fontSize, fontPicker.letterSpacing, fontPicker.lineHeight, fontPicker.textCase, fontPicker.color, fontPicker.opacity.",
        "Compound / range (mesh.range) must declare controlPartCoverage for every semantic value part: rangeInput.start, rangeInput.end.",
        "Compound / band (mesh.band) must declare controlPartCoverage for every semantic value part: rangeSlider.lower, rangeSlider.upper.",
        "Channels & Curves / mixer (mesh.channels) must declare controlPartCoverage for every semantic value part: channelMixer.activeChannel, channelMixer.values.",
        "Channels & Curves / curves (mesh.curves) must declare controlPartCoverage for every semantic value part: curves.activeChannel, curves.points.",
      ]),
    );
  });

  it("accepts compound controls only when every semantic value part is declared", () => {
    const gradientSchema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "gradient",
                controls: {
                  gradient: {
                    applicability: { mode: "always" as const },
                    defaultValue: {
                      angle: 120,
                      gradientType: "linear",
                      stops: [
                        { color: "#1D1264", opacity: 100, position: "0%" },
                        { color: "#22A7FF", opacity: 100, position: "50%" },
                        { color: "#FFE97A", opacity: 100, position: "100%" },
                      ],
                    },
                    label: false,
                    orderRole: "color",
                    target: "mesh.gradient",
                    type: "gradient",
                  },
                },
                title: "Gradient",
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
        schema: gradientSchema,
        acceptance: [
          {
            automated: true,
            automatedTestName: "gradient type angle and stops change output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: gradient type angle and stops change output",
            },
            componentType: "gradient",
            controlPartCoverage: [
              "gradient.gradientType",
              "gradient.angle",
              "gradient.stops.position",
              "gradient.stops.color",
              "gradient.stops.opacity",
            ],
            evidence: "product-output",
            expectedObservable:
              "Changing gradient type, angle, stop position, stop color, and stop opacity changes the rendered output.",
            fixture: "gradient fixture",
            id: "mesh.gradient",
            kind: "control",
            target: "mesh.gradient",
            userAction: "Change every visible part of the Gradient control.",
          },
        ],
        sectionInventory: createContractSectionInventoryFixture(
          gradientSchema,
          [
            {
              entity: "Gradient",
              entityId: "gradient",
              finiteSelectors: [],
              groupingReason:
                "Gradient parts jointly define one rendered fill.",
              id: "gradient",
            },
          ],
        ),
      }),
    ).toEqual([]);
  });
});
