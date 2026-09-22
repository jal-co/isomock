import { exportRequestFixture } from "./app-acceptance.export-request-test-fixtures";
import { describe, expect, it } from "vitest";
import type { ResolvedToolcraftControlSchema } from "@/toolcraft/runtime";

import type { ToolcraftProductReadiness } from "./acceptance/types";
import { validateContractAcceptance } from "./app-acceptance.contract-fixtures";
import {
  defineExportModuleSchemaFixture,
  forgeResolvedExportSections,
} from "./app-acceptance.export-test-utils";
import { makeControlAcceptance } from "./app-acceptance.test-utils";
import { deriveToolcraftBrowserRuntimeRequirements } from "../../e2e/browser-runtime-evidence-requirements";

const imageExportProductReadiness: ToolcraftProductReadiness = {
  exportIntent: {
    image: { mode: "toolcraft-default" },
    svg: { mode: "not-requested" },
    video: { mode: "not-requested" },
  },
  interactionOwnership: [],
  mode: "product",
  productName: "Background image export fixture",
  productSummary: "A static image fixture for background export validation.",
  requestedBehavior: "Export the image with configurable background output.",
  viewInteraction: {
    mode: "non-spatial",
    reason: "The fixture renders a static two-dimensional image.",
  },
};

const videoExportProductReadiness: ToolcraftProductReadiness = {
  ...imageExportProductReadiness,
  exportIntent: {
    image: { mode: "toolcraft-default" },
    svg: { mode: "not-requested" },
    video: {
      evidence: exportRequestFixture(
        "Add video export with the selected background.",
      ),
      mode: "user-requested",
    },
  },
};

describe("Toolcraft background export acceptance contract", () => {
  it("requires png export apps to expose background color and png background toggle controls", () => {
    const schemaWithoutBackgroundControls = defineExportModuleSchemaFixture({
      image: true,
      productSections: [],
    });

    expect(
      validateContractAcceptance({
        schema: schemaWithoutBackgroundControls,
        productReadiness: imageExportProductReadiness,
        acceptance: [
          {
            actionCoverage: ["export.png"],
            automated: true,
            automatedTestName: "exports png output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: exports png output",
            },
            componentType: "panelActions",
            evidence: "exported-bytes",
            expectedObservable: "Export PNG creates output bytes.",
            fixture: "export fixture",
            id: "actions.output",
            kind: "control",
            target: "actions.output",
            userAction: "Click Export PNG.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "must expose a user-facing background color control",
        ),
        expect.stringContaining(
          "must expose export.includeBackground in runtime Setup",
        ),
      ]),
    );
  });

  it("rejects legacy output sections that mix background controls with export actions", () => {
    const schemaWithLegacyBackgroundControls = forgeResolvedExportSections(
      defineExportModuleSchemaFixture({ image: true, productSections: [] }),
      (sections) => {
        return sections.map((section) =>
          Object.values(section.controls).some(
            (control) => control.type === "panelActions",
          )
            ? Object.freeze({
                ...section,
                controls: Object.freeze({
                  background: Object.freeze({
                    applicability: Object.freeze({
                      mode: "always" as const,
                      origin: "explicit" as const,
                    }),
                    defaultValue: "#0F0F0F",
                    label: false,
                    target: "appearance.background",
                    type: "color" as const,
                  }),
                  includeBackground: Object.freeze({
                    applicability: Object.freeze({
                      mode: "always" as const,
                      origin: "explicit" as const,
                    }),
                    defaultValue: true,
                    label: "Include",
                    target: "export.includeBackground",
                    type: "switch" as const,
                  }),
                  ...section.controls,
                }),
                title: "Output",
              })
            : section,
        );
      },
    );

    expect(
      validateContractAcceptance({
        schema: schemaWithLegacyBackgroundControls,
        productReadiness: imageExportProductReadiness,
        acceptance: [
          makeControlAcceptance("appearance.background", "color"),
          makeControlAcceptance("export.includeBackground", "switch"),
          {
            actionCoverage: ["export.png"],
            automated: true,
            automatedTestName: "exports png output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: exports png output",
            },
            componentType: "panelActions",
            evidence: "exported-bytes",
            expectedObservable: "Export PNG creates output bytes.",
            fixture: "export fixture",
            id: "actions.output",
            kind: "control",
            target: "actions.output",
            userAction: "Click Export PNG.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "Runtime Setup must contain export.includeBackground as the Background switch.",
        ),
        expect.stringContaining(
          "Runtime Setup must contain the renderer-owned background color control",
        ),
      ]),
    );
  });

  it("accepts png export apps that wire background controls into the schema", () => {
    const schemaWithBackgroundControls = defineExportModuleSchemaFixture({
      image: true,
    });
    const errors = validateContractAcceptance({
      schema: schemaWithBackgroundControls,
      productReadiness: imageExportProductReadiness,
      acceptance: [
        makeControlAcceptance("appearance.background", "color"),
        {
          ...makeControlAcceptance("export.includeBackground", "switch"),
          backgroundOutputCoverage: [
            "preview-hidden-when-excluded",
            "image-transparent-when-excluded",
            "infinity-viewport-color-and-dependency",
          ],
          expectedObservable:
            "Переключатель изменяет фон предпросмотра и растрового результата.",
          userAction: "Отключить фон и проверить оба результата.",
        },
        {
          actionCoverage: ["export.png"],
          automated: true,
          automatedTestName:
            "exports png output with current background settings",
          browser: {
            budget: "standard",
            file: "e2e/app-controls.spec.ts",
            testName:
              "browser: exports png output with current background settings",
          },
          componentType: "panelActions",
          evidence: "exported-bytes",
          expectedObservable:
            "Export PNG creates output bytes and reads background color plus include-background state.",
          fixture: "export fixture",
          id: "actions.output",
          kind: "control",
          target: "actions.output",
          userAction: "Toggle Background, change Color, then click Export PNG.",
        },
      ],
    });

    expect(errors).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "must expose a user-facing background color control",
        ),
        expect.stringContaining(
          "must expose export.includeBackground in runtime Setup",
        ),
      ]),
    );
  });

  it("requires include-background acceptance to hide preview background and keep video background", () => {
    const schemaWithBackgroundControls = defineExportModuleSchemaFixture({
      image: true,
    });

    expect(
      validateContractAcceptance({
        schema: schemaWithBackgroundControls,
        productReadiness: imageExportProductReadiness,
        acceptance: [
          makeControlAcceptance("appearance.background", "color"),
          makeControlAcceptance("export.includeBackground", "switch"),
          {
            actionCoverage: ["export.png"],
            automated: true,
            automatedTestName:
              "exports png output with current background settings",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName:
                "browser: exports png output with current background settings",
            },
            componentType: "panelActions",
            evidence: "exported-bytes",
            expectedObservable:
              "Export PNG creates output bytes and reads background color plus include-background state.",
            fixture: "export fixture",
            id: "actions.output",
            kind: "control",
            target: "actions.output",
            userAction:
              "Toggle Background, change Color, then click Export PNG.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "controls background inclusion and must declare backgroundOutputCoverage",
        ),
      ]),
    );
  });

  it("requires video background coverage only when video export is present", () => {
    const schemaWithVideoExport = defineExportModuleSchemaFixture({
      image: true,
      video: true,
    });

    expect(
      validateContractAcceptance({
        schema: schemaWithVideoExport,
        productReadiness: videoExportProductReadiness,
        acceptance: [
          makeControlAcceptance("appearance.background", "color"),
          {
            ...makeControlAcceptance("export.includeBackground", "switch"),
            backgroundOutputCoverage: [
              "preview-hidden-when-excluded",
              "image-transparent-when-excluded",
            ],
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("video-background-preserved"),
      ]),
    );
  });

  it("requires finite background stacking coverage when runtime media can be imported", () => {
    const baseSchema = defineExportModuleSchemaFixture({ image: true });
    const schemaWithRuntimeMedia = Object.freeze({
      ...baseSchema,
      canvas: Object.freeze({ ...baseSchema.canvas, upload: true }),
    });

    expect(
      validateContractAcceptance({
        schema: schemaWithRuntimeMedia,
        productReadiness: imageExportProductReadiness,
        acceptance: [
          makeControlAcceptance("appearance.background", "color"),
          {
            ...makeControlAcceptance("export.includeBackground", "switch"),
            backgroundOutputCoverage: [
              "preview-hidden-when-excluded",
              "image-transparent-when-excluded",
              "infinity-viewport-color-and-dependency",
            ],
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("finite-media-stacking"),
      ]),
    );
  });

  it.each([
    ["canvas upload", "canvas-upload"],
    ["default image", "default-image"],
    ["image fileDrop", "image-file-drop"],
    ["model fileDrop", "model-file-drop"],
  ] as const)(
    "uses canonical media authority for %s background stacking",
    (_label, mediaCase) => {
      const baseSchema = defineExportModuleSchemaFixture({ image: true });
      const sections = baseSchema.panels.controls?.sections ?? [];
      const sourceControl = {
        applicability: { mode: "always" as const, origin: "explicit" as const },
        assetKind:
          mediaCase === "model-file-drop"
            ? ("model" as const)
            : ("image" as const),
        target: "source.media",
        type: "fileDrop" as const,
      } as ResolvedToolcraftControlSchema;
      const schema = {
        ...baseSchema,
        canvas: {
          ...baseSchema.canvas,
          upload: mediaCase === "canvas-upload",
        },
        media: {
          ...baseSchema.media,
          defaultAssets:
            mediaCase === "default-image"
              ? [
                  {
                    assetKind: "image" as const,
                    dataUrl: "data:image/png;base64,AA==",
                    fileName: "default.png",
                    ingressPolicy: "prepared-source" as const,
                    position: { x: 0, y: 0 },
                    sourceSize: { width: 100, height: 80, unit: "px" as const },
                  },
                ]
              : [],
        },
        panels: {
          ...baseSchema.panels,
          controls:
            mediaCase === "image-file-drop" || mediaCase === "model-file-drop"
              ? {
                  ...baseSchema.panels.controls!,
                  sections: [
                    ...sections,
                    {
                      controls: { source: sourceControl },
                      id: "source",
                      title: "Source",
                    },
                  ],
                }
              : baseSchema.panels.controls,
        },
      };
      const errors = validateContractAcceptance({
        schema,
        productReadiness: imageExportProductReadiness,
        acceptance: [
          makeControlAcceptance("appearance.background", "color"),
          {
            ...makeControlAcceptance("export.includeBackground", "switch"),
            backgroundOutputCoverage: [
              "preview-hidden-when-excluded",
              "image-transparent-when-excluded",
              "infinity-viewport-color-and-dependency",
            ],
          },
          ...(mediaCase === "image-file-drop" || mediaCase === "model-file-drop"
            ? [makeControlAcceptance("source.media", "fileDrop")]
            : []),
        ],
      });

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("finite-media-stacking"),
        ]),
      );
    },
  );

  it("does not require finite media stacking for a media-free schema", () => {
    const errors = validateContractAcceptance({
      schema: defineExportModuleSchemaFixture({ image: true }),
      productReadiness: imageExportProductReadiness,
      acceptance: [
        makeControlAcceptance("appearance.background", "color"),
        {
          ...makeControlAcceptance("export.includeBackground", "switch"),
          backgroundOutputCoverage: [
            "preview-hidden-when-excluded",
            "image-transparent-when-excluded",
            "infinity-viewport-color-and-dependency",
          ],
        },
      ],
    });

    expect(errors).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("finite-media-stacking"),
      ]),
    );
  });

  it("derives all-required finite stacking browser evidence only with media authority", () => {
    const mediaFree = defineExportModuleSchemaFixture({ image: true });
    const withMedia = {
      ...mediaFree,
      canvas: { ...mediaFree.canvas, upload: true },
    };
    const acceptance = [
      {
        backgroundOutputCoverage: "all-required-background-output" as const,
        browser: {
          budget: "standard",
          file: "e2e/app-controls.spec.ts",
          testName: "browser: background output",
        } as const,
        evidence: "rendered-pixels" as const,
        id: "export.includeBackground",
        target: "export.includeBackground",
      },
    ];

    expect(
      deriveToolcraftBrowserRuntimeRequirements(acceptance, mediaFree).map(
        ({ evidenceType }) => evidenceType,
      ),
    ).not.toContain("background-finite-media-stacking");
    expect(
      deriveToolcraftBrowserRuntimeRequirements(acceptance, withMedia).map(
        ({ evidenceType }) => evidenceType,
      ),
    ).toContain("background-finite-media-stacking");
  });
});
