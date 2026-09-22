import { exportRequestFixture } from "./app-acceptance.export-request-test-fixtures";
import { describe, expect, it } from "vitest";

import {
  createContractSectionInventoryFixture,
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import {
  defineExportModuleSchemaFixture,
  forgeResolvedExportSections,
  makeExportSettingsProductReadiness,
} from "./app-acceptance.export-test-utils";
import { makeControlAcceptance } from "./app-acceptance.test-utils";

const imageOnlyProductReadiness = makeExportSettingsProductReadiness({
  image: { mode: "toolcraft-default" },
  svg: { mode: "not-requested" },
  video: { mode: "not-requested" },
});

const imageAndVideoProductReadiness = makeExportSettingsProductReadiness({
  image: { mode: "toolcraft-default" },
  svg: { mode: "not-requested" },
  video: {
    evidence: exportRequestFixture("Add video export."),
    mode: "user-requested",
  },
});

function createExportSectionInventory(
  schema: ReturnType<typeof defineContractSchemaFixture>,
  includeVideo: boolean,
) {
  return createContractSectionInventoryFixture(schema, [
    {
      entity: "Output background",
      entityId: "output-background",
      finiteSelectors: [
        {
          affectedTargets: ["appearance.background"],
          reason:
            "Background inclusion determines whether its color affects output.",
          role: "branch",
          target: "export.includeBackground",
        },
      ],
      groupingReason:
        "Inclusion and color define the exported product background.",
      id: "background",
      targets: ["export.includeBackground", "appearance.background"],
      title: "Background",
    },
    {
      entity: "Image delivery",
      entityId: "image-delivery",
      finiteSelectors: [
        {
          reason: "Image format changes its own exported artifact encoding.",
          role: "parameter",
          target: "export.image.format",
        },
        {
          reason:
            "Image resolution changes its own exported artifact dimensions.",
          role: "parameter",
          target: "export.image.resolution",
        },
      ],
      groupingReason:
        "Format and resolution configure one exported image artifact.",
      id: "runtime.image-export",
    },
    ...(includeVideo
      ? [
          {
            entity: "Video delivery",
            entityId: "video-delivery",
            finiteSelectors: [
              {
                reason:
                  "Video format changes its own exported artifact container.",
                role: "parameter" as const,
                target: "export.video.format",
              },
              {
                reason:
                  "Video resolution changes its own exported artifact dimensions.",
                role: "parameter" as const,
                target: "export.video.resolution",
              },
            ],
            groupingReason:
              "Format and resolution configure one exported video artifact.",
            id: "runtime.video-export",
          },
        ]
      : []),
  ]);
}

describe("Toolcraft image export settings acceptance contract", () => {
  it("requires still-output apps to expose image export format and resolution settings", () => {
    const schemaWithoutImageExportSettings = forgeResolvedExportSections(
      defineExportModuleSchemaFixture({ image: true }),
      (sections) =>
        sections.filter((section) => section.title !== "Image Export"),
    );

    expect(
      validateContractAcceptance({
        schema: schemaWithoutImageExportSettings,
        acceptance: [
          makeControlAcceptance("appearance.background", "color"),
          makeControlAcceptance("export.includeBackground", "switch"),
          {
            actionCoverage: ["export.png"],
            automated: true,
            automatedTestName: "exports image output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: exports image output",
            },
            componentType: "panelActions",
            evidence: "exported-bytes",
            expectedObservable:
              "Export PNG creates output bytes and reads image format, image resolution, background color, and include-background state.",
            exportArtifactCoverage: "all-required-image-export-behavior",
            fixture: "export fixture",
            id: "actions.output",
            kind: "control",
            target: "actions.output",
            userAction:
              "Toggle Include off, verify preview has no product background, export PNG with alpha, and verify the image artifact preserves transparency.",
          },
        ],
        productReadiness: imageOnlyProductReadiness,
      }),
    ).toEqual(
      expect.arrayContaining([
        'Apps with Export PNG must expose image export settings in a separate controls section titled "Image Export" directly above sticky footer export actions or directly before "Video Export" when video export also exists.',
        'The separate "Image Export" section must include a format control with target "export.image.format".',
        'The separate "Image Export" section must include a resolution control with target "export.image.resolution".',
      ]),
    );
  });

  it("accepts still-output apps with image export settings", () => {
    const schemaWithImageExportSettings = defineExportModuleSchemaFixture({
      image: true,
    });
    const imageFormatAcceptance = makeControlAcceptance(
      "export.image.format",
      "select",
    );
    imageFormatAcceptance.optionCoverage = ["png", "jpg"];
    imageFormatAcceptance.expectedObservable =
      "PNG and JPG choices change the exported image MIME/file extension.";
    imageFormatAcceptance.userAction =
      "Choose PNG and JPG, export the image, and verify the blob type or file extension changes.";
    const imageResolutionAcceptance = makeControlAcceptance(
      "export.image.resolution",
      "select",
    );
    imageResolutionAcceptance.optionCoverage = ["2k", "4k", "8k"];
    imageResolutionAcceptance.expectedObservable =
      "Resolution choices change the actual exported image dimensions.";
    imageResolutionAcceptance.userAction =
      "Choose 2K and 8K, export each image, decode it, and compare actual pixel width/height.";

    expect(
      validateContractAcceptance({
        schema: schemaWithImageExportSettings,
        acceptance: [
          makeControlAcceptance("appearance.background", "color"),
          makeControlAcceptance("export.includeBackground", "switch"),
          imageFormatAcceptance,
          imageResolutionAcceptance,
          {
            actionCoverage: ["export.png"],
            automated: true,
            automatedTestName: "exports image output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: exports image output",
            },
            componentType: "panelActions",
            evidence: "exported-bytes",
            expectedObservable:
              "Export PNG creates output bytes and reads image format, image resolution, background color, and include-background state. JPG changes file type; 8K changes exported pixel dimensions to an 8192px long edge.",
            exportArtifactCoverage: "all-required-image-export-behavior",
            fixture: "export fixture",
            id: "actions.output",
            kind: "control",
            target: "actions.output",
            userAction:
              "Set format to JPG and resolution to 8K, then export and decode the output image to verify file type and long-edge dimensions.",
          },
        ],
        productReadiness: imageOnlyProductReadiness,
        sectionInventory: createExportSectionInventory(
          schemaWithImageExportSettings,
          false,
        ),
      }),
    ).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("Image Export"),
        expect.stringContaining("export.image.format"),
        expect.stringContaining("export.image.resolution"),
      ]),
    );
  });

  it("requires explicit image-plus-video delivery to expose Image Export before Video Export", () => {
    const schemaWithoutImageSettings = forgeResolvedExportSections(
      defineExportModuleSchemaFixture({ image: true, video: true }),
      (sections) =>
        sections.filter((section) => section.title !== "Image Export"),
    );

    expect(
      validateContractAcceptance({
        schema: schemaWithoutImageSettings,
        acceptance: [
          makeControlAcceptance("appearance.background", "color"),
          makeControlAcceptance("export.includeBackground", "switch"),
          makeControlAcceptance("export.video.format", "select"),
          makeControlAcceptance("export.video.resolution", "select"),
          {
            actionCoverage: ["export.video", "export.png"],
            automated: true,
            automatedTestName:
              "exports image and explicitly requested video output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: exports video and image output",
            },
            componentType: "panelActions",
            evidence: "exported-bytes",
            expectedObservable:
              "Export Video and Export PNG both create output bytes and read their runtime export settings.",
            exportArtifactCoverage: [
              "all-required-image-export-behavior",
              "all-required-video-export-behavior",
            ],
            fixture: "explicit image-plus-video export fixture",
            id: "actions.output",
            kind: "control",
            target: "actions.output",
            userAction:
              "Export video and PNG with their configured settings, then verify both files exist.",
          },
        ],
        productReadiness: imageAndVideoProductReadiness,
      }),
    ).toEqual(
      expect.arrayContaining([
        'Apps with Export PNG must expose image export settings in a separate controls section titled "Image Export" directly above sticky footer export actions or directly before "Video Export" when video export also exists.',
        'The separate "Image Export" section must include a format control with target "export.image.format".',
        'The separate "Image Export" section must include a resolution control with target "export.image.resolution".',
      ]),
    );
  });

  it("accepts explicit image-plus-video delivery with Image Export immediately before Video Export", () => {
    const schemaWithDualExportSettings = defineExportModuleSchemaFixture({
      image: true,
      video: true,
    });
    const imageFormatAcceptance = makeControlAcceptance(
      "export.image.format",
      "select",
    );
    imageFormatAcceptance.optionCoverage = ["png", "jpg"];
    const imageResolutionAcceptance = makeControlAcceptance(
      "export.image.resolution",
      "select",
    );
    imageResolutionAcceptance.optionCoverage = ["2k", "4k", "8k"];
    const videoFormatAcceptance = makeControlAcceptance(
      "export.video.format",
      "select",
    );
    videoFormatAcceptance.optionCoverage = ["mp4", "webm"];
    const videoResolutionAcceptance = makeControlAcceptance(
      "export.video.resolution",
      "select",
    );
    videoResolutionAcceptance.optionCoverage = ["current", "4k"];

    expect(
      validateContractAcceptance({
        schema: schemaWithDualExportSettings,
        acceptance: [
          makeControlAcceptance("appearance.background", "color"),
          makeControlAcceptance("export.includeBackground", "switch"),
          imageFormatAcceptance,
          imageResolutionAcceptance,
          videoFormatAcceptance,
          videoResolutionAcceptance,
          {
            actionCoverage: ["export.video", "export.png"],
            automated: true,
            automatedTestName:
              "exports image and explicitly requested video output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: exports video and image output",
            },
            componentType: "panelActions",
            evidence: "exported-bytes",
            expectedObservable:
              "Export Video and Export PNG both create output bytes and read their runtime export settings.",
            exportArtifactCoverage: [
              "all-required-image-export-behavior",
              "all-required-video-export-behavior",
            ],
            fixture: "explicit image-plus-video export fixture",
            id: "actions.output",
            kind: "control",
            target: "actions.output",
            userAction:
              "Choose JPG and 8K, choose MP4 and Current, then export PNG and video and verify both outputs use their selected settings.",
          },
        ],
        productReadiness: imageAndVideoProductReadiness,
        sectionInventory: createExportSectionInventory(
          schemaWithDualExportSettings,
          true,
        ),
      }),
    ).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("Image Export"),
        expect.stringContaining("Video Export"),
      ]),
    );
  });
});
