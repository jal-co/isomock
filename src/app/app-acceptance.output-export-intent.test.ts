import type {
  ResolvedToolcraftAppSchema,
  ResolvedToolcraftControlSchema,
} from "@/toolcraft/runtime";
import { exportRequestFixture } from "./app-acceptance.export-request-test-fixtures";
import {
  imageExportModule,
  isToolcraftBuiltInControlSchema,
  svgExportModule,
  timelineModule,
  videoExportModule,
} from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";

import {
  getToolcraftOutputExportErrors,
  schemaHasPngExportPanelAction,
  schemaHasSvgExportPanelAction,
  schemaHasVideoExportPanelAction,
} from "./acceptance/output-export";
import { buildToolcraftOutputExportFacts } from "./acceptance/output-export-model";
import type {
  ToolcraftArtifactExportIntent,
  ToolcraftComponentAcceptance,
  ToolcraftExportArtifactCoverage,
  ToolcraftProductReadiness,
} from "./acceptance/types";
import { collectToolcraftVisibleAcceptanceControls } from "./acceptance/validate-coverage";
import { defineContractSchemaFixture } from "./app-acceptance.contract-fixtures";
import { makeBackgroundSection } from "./app-acceptance.export-test-utils";

type ProductReadiness = Extract<ToolcraftProductReadiness, { mode: "product" }>;

function makeProductReadiness(
  exportIntent: ToolcraftArtifactExportIntent,
): ProductReadiness {
  return {
    exportIntent,
    interactionOwnership: [],
    mode: "product",
    productName: "Explicit export intent fixture",
    productSummary:
      "A synthetic product for export-intent acceptance coverage.",
    requestedBehavior: "Deliver only the explicitly configured artifact types.",
    viewInteraction: {
      mode: "non-spatial",
      reason: "The synthetic output is two-dimensional.",
    },
  };
}

function makeExportSchema({
  imageAction = false,
  imageSection = false,
  svgAction = false,
  timeline = false,
  videoAction = false,
  videoSection = false,
}: {
  imageAction?: boolean;
  imageSection?: boolean;
  svgAction?: boolean;
  timeline?: boolean;
  videoAction?: boolean;
  videoSection?: boolean;
} = {}) {
  const imageEnabled = imageAction || imageSection;
  const videoEnabled = videoAction || videoSection;
  const schema = defineContractSchemaFixture({
    base: {
      canvas: { enabled: true, sizing: { mode: "editable-output" } },
      identity: { id: "contract-fixture", title: "Contract fixture" },
      panels: {
        controls: {
          sections:
            imageEnabled || svgAction || videoEnabled
              ? [makeBackgroundSection()]
              : [],
          title: "Controls",
        },
      },
      ...(timeline || videoEnabled
        ? {}
        : { persistence: { storage: "none" as const } }),
    },
    modules: [
      ...(imageEnabled ? [imageExportModule()] : []),
      ...(svgAction ? [svgExportModule()] : []),
      ...(videoEnabled ? [videoExportModule()] : []),
      ...(timeline && !videoEnabled
        ? [timelineModule({ mode: "playback" })]
        : []),
    ],
  });
  const sections = schema.panels.controls?.sections ?? [];
  const nextSections = sections
    .filter((section) => imageSection || section.title !== "Image Export")
    .filter((section) => videoSection || section.title !== "Video Export")
    .map((section) => {
      const hasPanelActions = Object.values(section.controls).some(
        (control) => control.type === "panelActions",
      );
      if (!hasPanelActions) {
        return section;
      }
      return Object.freeze({
        ...section,
        controls: Object.freeze(
          Object.fromEntries(
            Object.entries(section.controls).map(
              ([controlId, control]): [
                string,
                ResolvedToolcraftControlSchema,
              ] => [
                controlId,
                isToolcraftBuiltInControlSchema(control) &&
                control.type === "panelActions"
                  ? Object.freeze({
                      ...control,
                      actions: Object.freeze(
                        (control.actions ?? []).filter(
                          (action) =>
                            typeof action === "string" ||
                            ((action.role !== "export-image" || imageAction) &&
                              (action.role !== "export-svg" || svgAction) &&
                              (action.role !== "export-video" || videoAction)),
                        ),
                      ),
                    })
                  : control,
              ],
            ),
          ),
        ),
      });
    });

  return Object.freeze({
    ...schema,
    panels: Object.freeze({
      ...schema.panels,
      controls: schema.panels.controls
        ? Object.freeze({
            ...schema.panels.controls,
            sections: Object.freeze(nextSections),
          })
        : undefined,
    }),
  }) satisfies ResolvedToolcraftAppSchema;
}

function makeArtifactCoverage({
  image,
  svg,
  video,
}: {
  image: boolean;
  svg: boolean;
  video: boolean;
}): readonly ToolcraftComponentAcceptance[] {
  if (!image && !svg && !video) {
    return [];
  }

  const exportArtifactCoverage: ToolcraftExportArtifactCoverage[] = [];

  if (image) {
    exportArtifactCoverage.push("all-required-image-export-behavior");
  }
  if (svg) {
    exportArtifactCoverage.push("all-required-svg-export-behavior");
  }
  if (video) {
    exportArtifactCoverage.push("all-required-video-export-behavior");
  }

  return [
    {
      actionCoverage: [
        ...(image ? ["export.png"] : []),
        ...(svg ? ["export.svg"] : []),
        ...(video ? ["export.video"] : []),
      ],
      automated: true,
      automatedTestName: "exports the configured artifacts",
      browser: {
        budget: "standard",
        file: "e2e/app-controls.spec.ts",
        testName: "browser: exports the configured artifacts",
      },
      componentType: "panelActions",
      evidence: "exported-bytes",
      expectedObservable:
        "Configured export actions create validated artifact bytes.",
      exportArtifactCoverage,
      fixture: "explicit export intent fixture",
      id: "actions.output",
      kind: "control",
      target: "actions.output",
      userAction:
        "Click each configured export action and inspect its artifact.",
    },
  ];
}

function getExplicitExportErrors({
  intent,
  schema,
}: {
  intent: ToolcraftArtifactExportIntent;
  schema: ReturnType<typeof defineContractSchemaFixture>;
}): string[] {
  return getToolcraftOutputExportErrors({
    acceptance: makeArtifactCoverage({
      image: schemaHasPngExportPanelAction(schema),
      svg: schemaHasSvgExportPanelAction(schema),
      video: schemaHasVideoExportPanelAction(schema),
    }),
    controls: collectToolcraftVisibleAcceptanceControls(schema),
    productReadiness: makeProductReadiness(intent),
    schema,
  });
}

describe("Toolcraft explicit output export intent", () => {
  it("rejects a video action and section when video delivery was not requested", () => {
    const errors = getExplicitExportErrors({
      intent: {
        image: { mode: "toolcraft-default" },
        svg: { mode: "not-requested" },
        video: { mode: "not-requested" },
      },
      schema: makeExportSchema({
        imageAction: true,
        imageSection: true,
        videoAction: true,
        videoSection: true,
      }),
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        'Video export intent "not-requested" must not have an export-video panel action.',
        'Video export intent "not-requested" must not have a "Video Export" section.',
      ]),
    );
  });

  it("rejects a plan's invented video quote even when video UI matches the declared mode", () => {
    const errors = getExplicitExportErrors({
      intent: {
        image: { mode: "toolcraft-default" },
        svg: { mode: "not-requested" },
        video: {
          mode: "user-requested",
          evidence: {
            ...exportRequestFixture("Сделай плавный луп на 6 секунд."),
            quote: "Статика + анимация и видео",
          },
        },
      },
      schema: makeExportSchema({
        imageAction: true,
        imageSection: true,
        videoAction: true,
        videoSection: true,
      }),
    });

    expect(errors).toContain(
      "Video export user-requested intent quote must be an exact substring of messageText; an agent paraphrase or plan claim is not primary request evidence.",
    );
  });

  it("requires a video action and section when video delivery was explicitly requested", () => {
    const errors = getExplicitExportErrors({
      intent: {
        image: { mode: "toolcraft-default" },
        svg: { mode: "not-requested" },
        video: {
          evidence: exportRequestFixture("Add MP4 video export."),
          mode: "user-requested",
        },
      },
      schema: makeExportSchema({ imageAction: true, imageSection: true }),
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        'Video export intent "user-requested" requires an export-video panel action.',
        'Video export intent "user-requested" requires a "Video Export" section.',
        'Apps with Export Video must expose video export settings in a separate controls section titled "Video Export" directly above sticky footer export actions.',
        'The separate "Video Export" section must include a format control with target "export.video.format".',
        'The separate "Video Export" section must include a resolution control with target "export.video.resolution".',
      ]),
    );
  });

  it.each([
    {
      expected:
        'Image export intent "user-removed" must not have an export-image panel action.',
      imageAction: true,
      imageSection: false,
      name: "action",
    },
    {
      expected:
        'Image export intent "user-removed" must not have an "Image Export" section.',
      imageAction: false,
      imageSection: true,
      name: "settings section",
    },
  ])(
    "rejects an image $name after explicit image removal",
    ({ expected, imageAction, imageSection }) => {
      expect(
        getExplicitExportErrors({
          intent: {
            image: {
              evidence: exportRequestFixture("Remove image export."),
              mode: "user-removed",
            },
            svg: { mode: "not-requested" },
            video: { mode: "not-requested" },
          },
          schema: makeExportSchema({ imageAction, imageSection }),
        }),
      ).toContain(expected);
    },
  );

  it("requires the default image action when image delivery was not removed", () => {
    expect(
      getExplicitExportErrors({
        intent: {
          image: { mode: "toolcraft-default" },
          svg: { mode: "not-requested" },
          video: { mode: "not-requested" },
        },
        schema: makeExportSchema(),
      }),
    ).toContain(
      'Image export intent "toolcraft-default" requires an export-image panel action.',
    );
  });

  it("surfaces blank explicit export evidence through output validation", () => {
    expect(
      getExplicitExportErrors({
        intent: {
          image: {
            evidence: exportRequestFixture(" \n\t"),
            mode: "user-removed",
          },
          svg: { mode: "not-requested" },
          video: { mode: "not-requested" },
        },
        schema: makeExportSchema(),
      }),
    ).toContain(
      "Image export user-removed intent requires structured user-message evidence with non-empty messageRef, messageText, and quote.",
    );
  });

  it("accepts explicit video-only delivery", () => {
    expect(
      getExplicitExportErrors({
        intent: {
          image: {
            evidence: exportRequestFixture("Remove image export."),
            mode: "user-removed",
          },
          svg: { mode: "not-requested" },
          video: {
            evidence: exportRequestFixture("Add MP4 video export."),
            mode: "user-requested",
          },
        },
        schema: makeExportSchema({ videoAction: true, videoSection: true }),
      }),
    ).toEqual([]);
  });

  it("accepts an explicitly no-export product without a universal PNG error", () => {
    expect(
      getExplicitExportErrors({
        intent: {
          image: {
            evidence: exportRequestFixture(
              "Remove image export; no downloadable artifacts.",
            ),
            mode: "user-removed",
          },
          svg: { mode: "not-requested" },
          video: { mode: "not-requested" },
        },
        schema: makeExportSchema(),
      }),
    ).toEqual([]);
  });

  it("accepts explicit editable SVG-only delivery without inventing a settings section", () => {
    expect(
      getExplicitExportErrors({
        intent: {
          image: {
            evidence: exportRequestFixture(
              "Replace image export with editable SVG export.",
            ),
            mode: "user-removed",
          },
          svg: {
            evidence: exportRequestFixture("Add editable SVG export."),
            mode: "user-requested",
          },
          video: { mode: "not-requested" },
        },
        schema: makeExportSchema({ svgAction: true }),
      }),
    ).toEqual([]);
  });

  it("requires the typed SVG action when SVG delivery was requested", () => {
    expect(
      getExplicitExportErrors({
        intent: {
          image: { mode: "toolcraft-default" },
          svg: {
            evidence: exportRequestFixture("Add editable SVG export."),
            mode: "user-requested",
          },
          video: { mode: "not-requested" },
        },
        schema: makeExportSchema({ imageAction: true, imageSection: true }),
      }),
    ).toContain(
      'SVG export intent "user-requested" requires an export-svg panel action.',
    );
  });

  it("does not infer video delivery from an enabled playback timeline", () => {
    const errors = getExplicitExportErrors({
      intent: {
        image: { mode: "toolcraft-default" },
        svg: { mode: "not-requested" },
        video: { mode: "not-requested" },
      },
      schema: makeExportSchema({
        imageAction: true,
        imageSection: true,
        timeline: true,
      }),
    });

    expect(errors).toEqual([]);
    expect(errors.join("\n")).not.toContain("Video Export");
    expect(errors.join("\n")).not.toContain(
      "all-required-video-export-behavior",
    );
  });

  it("accepts explicit image and video delivery", () => {
    expect(
      getExplicitExportErrors({
        intent: {
          image: { mode: "toolcraft-default" },
          svg: { mode: "not-requested" },
          video: {
            evidence: exportRequestFixture("Add video export."),
            mode: "user-requested",
          },
        },
        schema: makeExportSchema({
          imageAction: true,
          imageSection: true,
          videoAction: true,
          videoSection: true,
        }),
      }),
    ).toEqual([]);
  });

  it("derives the final export settings index from actions, not stray sections", () => {
    const facts = buildToolcraftOutputExportFacts({
      schema: makeExportSchema({ imageSection: true }),
    });

    expect(facts.hasImageExportAction).toBe(false);
    expect(facts.hasSvgExportAction).toBe(false);
    expect(facts.hasVideoExportAction).toBe(false);
    expect(facts.imageExportSectionIndex).toBeGreaterThanOrEqual(0);
    expect(facts.finalExportSettingsIndex).toBe(-1);
  });
});
