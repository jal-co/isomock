import { describe, expect, it } from "vitest";
import {
  isToolcraftBuiltInControlSchema,
  timelineModule,
  videoExportModule,
} from "@/toolcraft/runtime";
import { exportRequestFixture } from "./app-acceptance.export-request-test-fixtures";

import { schemaHasVideoExportPanelAction } from "./acceptance/output-export";
import {
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import {
  defineExportModuleSchemaFixture,
  forgeResolvedExportSections,
  makeExportSettingsProductReadiness,
} from "./app-acceptance.export-test-utils";

describe("Toolcraft output export synthetic rules", () => {
  it("requires video proof only when the product explicitly exposes video export", () => {
    const playbackSchema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: { sections: [], title: "Controls" },
        },
      },
      modules: [timelineModule({ mode: "playback" })],
    });

    expect(schemaHasVideoExportPanelAction(playbackSchema)).toBe(false);
  });

  it("does not let a video-only schema bypass artifact coverage", () => {
    const videoOnlySchema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: { sections: [], title: "Controls" },
        },
      },
      modules: [videoExportModule()],
    });

    expect(
      validateContractAcceptance({
        acceptance: [],
        productReadiness: makeExportSettingsProductReadiness({
          image: {
            evidence: exportRequestFixture(
              "Remove image export; enable video export only.",
            ),
            mode: "user-removed",
          },
          svg: { mode: "not-requested" },
          video: {
            evidence: exportRequestFixture("Enable video export only."),
            mode: "user-requested",
          },
        }),
        schema: videoOnlySchema,
      }),
    ).toEqual(
      expect.arrayContaining([
        "artifact.video-export requires exported-bytes acceptance with automated and browser proof.",
      ]),
    );
  });

  it("rejects reset actions in sticky footer panelActions", () => {
    const schemaWithFooterReset = forgeResolvedExportSections(
      defineExportModuleSchemaFixture({ image: true }),
      (sections) =>
        sections.map((section) =>
          Object.values(section.controls).some(
            (control) => control.type === "panelActions",
          )
            ? Object.freeze({
                ...section,
                controls: Object.freeze(
                  Object.fromEntries(
                    Object.entries(section.controls).map(
                      ([controlId, control]) => [
                        controlId,
                        isToolcraftBuiltInControlSchema(control) &&
                        control.type === "panelActions"
                          ? Object.freeze({
                              ...control,
                              actions: Object.freeze([
                                Object.freeze({
                                  command: "controls.reset" as const,
                                  icon: "rotate-ccw" as const,
                                  label: "Reset",
                                  value: "reset",
                                }),
                                ...(control.actions ?? []),
                              ]),
                            })
                          : control,
                      ],
                    ),
                  ),
                ),
              })
            : section,
        ),
    );

    expect(
      validateContractAcceptance({
        acceptance: [
          {
            actionCoverage: ["reset", "export.png"],
            automated: true,
            automatedTestName: "footer actions reset and export output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: footer actions reset and export output",
            },
            componentType: "panelActions",
            evidence: "exported-bytes",
            expectedObservable:
              "Footer actions reset controls and export output.",
            fixture: "footer actions fixture",
            id: "actions.output",
            kind: "control",
            target: "actions.output",
            userAction: "Click Reset and Export PNG.",
          },
        ],
        schema: schemaWithFooterReset,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "must not include Reset footer actions (reset)",
        ),
      ]),
    );
  });
});
