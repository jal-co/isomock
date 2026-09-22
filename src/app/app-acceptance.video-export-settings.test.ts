import { exportRequestFixture } from "./app-acceptance.export-request-test-fixtures";
import { describe, expect, it } from "vitest";

import type { ToolcraftComponentAcceptance } from "./acceptance/types";
import { getToolcraftOutputExportErrors } from "./acceptance/output-export";
import { buildToolcraftOutputExportFacts } from "./acceptance/output-export-model";
import { getToolcraftVideoExportErrors } from "./acceptance/output-video-export-rules";
import { collectToolcraftVisibleAcceptanceControls } from "./acceptance/validate-coverage";
import { validateContractAcceptance } from "./app-acceptance.contract-fixtures";
import {
  defineExportModuleSchemaFixture,
  forgeResolvedExportSections,
  makeExportSettingsProductReadiness,
} from "./app-acceptance.export-test-utils";
import { makeControlAcceptance } from "./app-acceptance.test-utils";

describe("Toolcraft video export settings acceptance contract", () => {
  it("accepts a Segmented video format paired with a Select resolution", () => {
    const schemaWithSegmentedVideoFormat = forgeResolvedExportSections(
      defineExportModuleSchemaFixture({ video: true }),
      (sections) =>
        sections.map((section) =>
          section.title === "Video Export"
            ? Object.freeze({
                ...section,
                controls: Object.freeze({
                  ...section.controls,
                  videoFormat: Object.freeze({
                    applicability: {
                      mode: "always" as const,
                      origin: "explicit" as const,
                    },
                    defaultValue: "mp4",
                    label: "Format",
                    options: Object.freeze([
                      Object.freeze({ label: "MP4", value: "mp4" }),
                      Object.freeze({ label: "WebM", value: "webm" }),
                    ]),
                    target: "export.video.format",
                    type: "segmented" as const,
                  }),
                }),
              })
            : section,
        ),
    );
    const segmentedProductReadiness = makeExportSettingsProductReadiness({
      image: {
        evidence: exportRequestFixture("Remove image export."),
        mode: "user-removed",
      },
      svg: { mode: "not-requested" },
      video: {
        evidence: exportRequestFixture("Add video export."),
        mode: "user-requested",
      },
    });
    const videoFormatAcceptance = makeControlAcceptance(
      "export.video.format",
      "segmented",
    );
    videoFormatAcceptance.optionCoverage = ["mp4", "webm"];
    const videoResolutionAcceptance = makeControlAcceptance(
      "export.video.resolution",
      "select",
    );
    videoResolutionAcceptance.optionCoverage = ["current", "4k"];
    const acceptance: readonly ToolcraftComponentAcceptance[] = [
      makeControlAcceptance("appearance.background", "color"),
      makeControlAcceptance("export.includeBackground", "switch"),
      videoFormatAcceptance,
      videoResolutionAcceptance,
      {
        actionCoverage: ["export.video"],
        automated: true,
        automatedTestName: "exports segmented-format video output",
        browser: {
          budget: "standard",
          file: "e2e/app-controls.spec.ts",
          testName: "browser: exports segmented-format video output",
        },
        componentType: "panelActions",
        evidence: "exported-bytes",
        expectedObservable: "Export Video creates validated video bytes.",
        exportArtifactCoverage: "all-required-video-export-behavior",
        fixture: "segmented video export fixture",
        id: "actions.output",
        kind: "control",
        target: "actions.output",
        userAction:
          "Choose MP4 or WebM, then export and inspect the video artifact.",
      },
    ];

    expect(
      getToolcraftOutputExportErrors({
        acceptance,
        controls: collectToolcraftVisibleAcceptanceControls(
          schemaWithSegmentedVideoFormat,
        ),
        productReadiness: segmentedProductReadiness,
        schema: schemaWithSegmentedVideoFormat,
      }),
    ).toEqual([]);

    expect(
      validateContractAcceptance({
        acceptance,
        productReadiness: segmentedProductReadiness,
        schema: schemaWithSegmentedVideoFormat,
      }),
    ).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("includes segmented control videoFormat"),
      ]),
    );
  });

  it.each([
    {
      expected: 'Video Export format options must be exactly "mp4" and "webm".',
      formatOptions: ["mp4", "webm", "mov"],
      name: "extra video format",
      resolutionOptions: ["current", "4k"],
    },
    {
      expected: 'Video Export format options must be exactly "mp4" and "webm".',
      formatOptions: ["mp4", "webm", "webm"],
      name: "duplicate video format",
      resolutionOptions: ["current", "4k"],
    },
    {
      expected:
        'Video Export resolution options must be exactly "current" and "4k".',
      formatOptions: ["mp4", "webm"],
      name: "extra video resolution",
      resolutionOptions: ["current", "4k", "8k"],
    },
    {
      expected:
        'Video Export resolution options must be exactly "current" and "4k".',
      formatOptions: ["mp4", "webm"],
      name: "duplicate video resolution",
      resolutionOptions: ["current", "4k", "4k"],
    },
  ])(
    "rejects an $name option",
    ({ expected, formatOptions, resolutionOptions }) => {
      const schema = forgeResolvedExportSections(
        defineExportModuleSchemaFixture({ video: true }),
        (sections) =>
          sections.map((section) =>
            section.title === "Video Export"
              ? Object.freeze({
                  ...section,
                  controls: Object.freeze({
                    ...section.controls,
                    videoFormat: Object.freeze({
                      applicability: {
                        mode: "always" as const,
                        origin: "explicit" as const,
                      },
                      defaultValue: "mp4",
                      label: "Format",
                      options: Object.freeze(
                        formatOptions.map((value) =>
                          Object.freeze({
                            label: value.toUpperCase(),
                            value,
                          }),
                        ),
                      ),
                      target: "export.video.format",
                      type: "select" as const,
                    }),
                    videoResolution: Object.freeze({
                      applicability: {
                        mode: "always" as const,
                        origin: "explicit" as const,
                      },
                      defaultValue: "current",
                      label: "Resolution",
                      options: Object.freeze(
                        resolutionOptions.map((value) =>
                          Object.freeze({
                            label: value.toUpperCase(),
                            value,
                          }),
                        ),
                      ),
                      target: "export.video.resolution",
                      type: "select" as const,
                    }),
                  }),
                })
              : section,
          ),
      );

      expect(
        getToolcraftVideoExportErrors(
          buildToolcraftOutputExportFacts({ schema }),
        ),
      ).toContain(expected);
    },
  );

  it("validates the complete video format, resolution, defaults, and layout contract", () => {
    const malformedVideoSchema = forgeResolvedExportSections(
      defineExportModuleSchemaFixture({ video: true }),
      (sections) =>
        sections.map((section) =>
          section.title === "Video Export"
            ? Object.freeze({
                ...section,
                layoutGroups: undefined,
                controls: Object.freeze({
                  videoFormat: Object.freeze({
                    applicability: {
                      mode: "always" as const,
                      origin: "explicit" as const,
                    },
                    defaultValue: "mov",
                    label: "Format",
                    target: "export.video.format",
                    textValueKind: "single-line" as const,
                    type: "text" as const,
                  }),
                  videoResolution: Object.freeze({
                    applicability: {
                      mode: "always" as const,
                      origin: "explicit" as const,
                    },
                    defaultValue: "8k",
                    label: "Resolution",
                    options: Object.freeze([
                      Object.freeze({ label: "Current", value: "current" }),
                      Object.freeze({ label: "8K", value: "8k" }),
                    ]),
                    target: "export.video.resolution",
                    type: "segmented" as const,
                  }),
                }),
              })
            : section,
        ),
    );

    expect(
      validateContractAcceptance({
        acceptance: [
          makeControlAcceptance("appearance.background", "color"),
          makeControlAcceptance("export.includeBackground", "switch"),
          makeControlAcceptance("export.video.format", "text"),
          makeControlAcceptance("export.video.resolution", "segmented"),
          {
            actionCoverage: ["export.video"],
            automated: true,
            automatedTestName: "exports video output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: exports video output",
            },
            componentType: "panelActions",
            evidence: "exported-bytes",
            expectedObservable: "Export Video creates validated video bytes.",
            exportArtifactCoverage: "all-required-video-export-behavior",
            fixture: "video-only export fixture",
            id: "actions.output",
            kind: "control",
            target: "actions.output",
            userAction: "Export and inspect the video artifact.",
          },
        ],
        productReadiness: makeExportSettingsProductReadiness({
          image: {
            evidence: exportRequestFixture("Remove image export."),
            mode: "user-removed",
          },
          svg: { mode: "not-requested" },
          video: {
            evidence: exportRequestFixture("Add video export."),
            mode: "user-requested",
          },
        }),
        schema: malformedVideoSchema,
      }),
    ).toEqual(
      expect.arrayContaining([
        "Video Export format must be a Select or Segmented control.",
        'Video Export format options must be exactly "mp4" and "webm".',
        'Video Export format must default to "mp4".',
        "Video Export resolution must be a Select control.",
        'Video Export resolution options must be exactly "current" and "4k".',
        'Video Export resolution must default to "current".',
        "Video Export format and resolution must render as one exact two-column inline row.",
      ]),
    );
  });
});
