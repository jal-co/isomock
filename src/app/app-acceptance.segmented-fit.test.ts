import { describe, expect, it } from "vitest";
import { getToolcraftSegmentedStaticFitError } from "@/toolcraft/runtime";
import {
  contractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import type { ToolcraftComponentAcceptance } from "./acceptance/types";

const SCREENSHOT_LABELS = ["Default", "Ink Drops", "Solar", "Background"];
const BOUNDARY_LABELS = ["Ink Drops", "Default", "Solar", "RGB"];

function createRawCollectionModesSchema(
  itemControlType: "segmented" | "select",
  labels: readonly string[],
) {
  return {
    ...contractSchemaFixture,
    panels: {
      ...contractSchemaFixture.panels,
      controls: {
        sections: [
          {
            controls: {
              modes: {
                applicability: {
                  mode: "always" as const,
                  origin: "explicit" as const,
                },
                defaultValue: ["default"],
                itemControl: {
                  defaultValue: "default",
                  label: "Mode",
                  options: labels.map((label) => ({
                    label,
                    value: label.toLowerCase().replaceAll(" ", "-"),
                  })),
                  ...(itemControlType === "segmented"
                    ? { type: itemControlType }
                    : { type: itemControlType }),
                },
                itemLabel: "Mode",
                label: "Modes",
                minItems: 1,
                target: "appearance.modes",
                type: "collectionActions" as const,
              },
            },
            id: "style",
            title: "Style",
          },
        ],
        title: "Appearance",
      },
    },
  };
}

const collectionModesAcceptance: readonly ToolcraftComponentAcceptance[] = [
  {
    automated: true,
    automatedTestName: "collection modes update rendered output",
    browser: {
      budget: "standard",
      file: "e2e/app-controls.spec.ts",
      testName: "browser: collection modes update rendered output",
    },
    componentType: "collectionActions",
    controlPartCoverage: [
      "collectionActions.add",
      "collectionActions.remove",
      "collectionActions.items",
    ] as const,
    evidence: "rendered-pixels" as const,
    expectedObservable: "Adding and editing modes changes rendered output.",
    fixture: "collection modes fixture",
    id: "appearance.modes",
    kind: "control" as const,
    target: "appearance.modes",
    userAction: "Add, remove, and edit collection modes.",
  },
];

describe("starter acceptance segmented fit contract", () => {
  it("requires overwide segmented controls to shorten labels or use select", () => {
    const schemaWithOverwideSegmentedControl = {
      ...contractSchemaFixture,
      panels: {
        ...contractSchemaFixture.panels,
        controls: {
          sections: [
            {
              controls: {
                preset: {
                  applicability: {
                    mode: "always" as const,
                    origin: "explicit" as const,
                  },
                  defaultValue: "full-stack",
                  label: "FX Preset",
                  options: [
                    { label: "Full Stack", value: "full-stack" },
                    { label: "RGB Split", value: "rgb-split" },
                    { label: "Shade", value: "shade" },
                    { label: "Lines", value: "lines" },
                    { label: "Off", value: "off" },
                  ],
                  orderRole: "mode" as const,
                  target: "shader.fxPreset",
                  type: "segmented" as const,
                },
              },
              id: "style",
              title: "Style",
            },
          ],
          title: "Shader",
        },
      },
    };

    expect(
      validateContractAcceptance({
        schema: schemaWithOverwideSegmentedControl,
        acceptance: [
          {
            automated: true,
            automatedTestName: "fx preset changes rendered output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: fx preset selector changes rendered output",
            },
            componentType: "segmented",
            evidence: "rendered-pixels",
            expectedObservable:
              "Changing FX Preset switches the shader preset.",
            fixture: "fx preset fixture",
            id: "shader.fxPreset",
            kind: "control",
            optionCoverage: "each-visible-item",
            target: "shader.fxPreset",
            userAction: "Select each FX Preset option.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "Style / preset (shader.fxPreset) segmented controls must preserve cell padding: use at most 4 short options (max 9 characters per label and 24 total) or shorten labels first; if the compact names still exceed the budget, use a select dropdown instead.",
      ]),
    );
  });

  it("reports canonical fit guidance for an overwide collectionActions itemControl", () => {
    const itemControl = {
      options: SCREENSHOT_LABELS.map((label) => ({ label })),
      type: "segmented" as const,
    };
    const fitGuidance = getToolcraftSegmentedStaticFitError(itemControl);

    expect(fitGuidance).not.toBeNull();
    expect(
      validateContractAcceptance({
        schema: createRawCollectionModesSchema(
          itemControl.type,
          SCREENSHOT_LABELS,
        ),
        acceptance: collectionModesAcceptance,
      }),
    ).toEqual(
      expect.arrayContaining([
        `Style / modes (appearance.modes) itemControl ${fitGuidance}`,
      ]),
    );
  });

  it("reports canonical fit guidance for every compound itemControls field", () => {
    const schema = createRawCollectionModesSchema(
      "segmented",
      SCREENSHOT_LABELS,
    );
    const modes = schema.panels.controls.sections[0]!.controls.modes;
    const compoundSchema = {
      ...schema,
      panels: {
        ...schema.panels,
        controls: {
          ...schema.panels.controls,
          sections: [
            {
              ...schema.panels.controls.sections[0],
              controls: {
                modes: {
                  ...modes,
                  defaultValue: [{ enabled: true, mode: "default" }],
                  itemControl: undefined,
                  itemControls: {
                    enabled: {
                      defaultValue: true,
                      label: "Enabled",
                      type: "switch" as const,
                    },
                    mode: modes.itemControl,
                  },
                },
              },
            },
          ],
        },
      },
    };
    const fitGuidance = getToolcraftSegmentedStaticFitError(modes.itemControl);

    expect(fitGuidance).not.toBeNull();
    expect(
      validateContractAcceptance({
        schema: compoundSchema,
        acceptance: collectionModesAcceptance,
      }),
    ).toEqual(
      expect.arrayContaining([
        `Style / modes (appearance.modes) itemControls.mode ${fitGuidance}`,
      ]),
    );
  });

  it.each([
    { labels: BOUNDARY_LABELS, type: "segmented" },
    { labels: SCREENSHOT_LABELS, type: "select" },
  ] as const)(
    "does not report itemControl fit guidance for nested $type",
    ({ labels, type }) => {
      const errors = validateContractAcceptance({
        schema: createRawCollectionModesSchema(type, labels),
        acceptance: collectionModesAcceptance,
      });

      expect(
        errors.some(
          (error) =>
            error.includes("itemControl") &&
            error.includes("preserve cell padding"),
        ),
      ).toBe(false);
    },
  );
});
