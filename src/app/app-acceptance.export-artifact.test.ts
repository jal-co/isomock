import {
  defineToolcraft,
  imageExportModule,
  svgExportModule,
  videoExportModule,
} from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";

import {
  getToolcraftExportArtifactActionPlacementErrors,
  getToolcraftExportArtifactProofErrors,
  TOOLCRAFT_ARTIFACT_CAPABILITY_PROOFS_BY_ROLE,
} from "./acceptance/export-artifact-coverage";
import type { ToolcraftComponentAcceptance } from "./acceptance/types";

function createSchema(
  roles: readonly ("export-image" | "export-svg" | "export-video")[],
) {
  return defineToolcraft({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: { enabled: true },
      panels: { controls: { sections: [], title: "Controls" } },
    },
    modules: roles.map((role) =>
      role === "export-image"
        ? imageExportModule()
        : role === "export-svg"
          ? svgExportModule()
          : videoExportModule(),
    ),
  });
}

const capabilityProofs = Object.values(
  TOOLCRAFT_ARTIFACT_CAPABILITY_PROOFS_BY_ROLE,
);

function getCoverageErrors(
  schema: ReturnType<typeof createSchema>,
  acceptance: readonly ToolcraftComponentAcceptance[],
) {
  return getToolcraftExportArtifactProofErrors({
    acceptance,
    capabilityIds: schema.modulePlan.capabilities.map(
      ({ capabilityId }) => capabilityId,
    ),
    capabilityProofs,
    schema,
  });
}

function createAcceptance(
  overrides: Partial<ToolcraftComponentAcceptance> = {},
): ToolcraftComponentAcceptance {
  return {
    actionCoverage: ["export.png"],
    automated: true,
    automatedTestName: "exports image",
    browser: {
      budget: "standard",
      file: "e2e/app-controls.spec.ts",
      testName: "browser: exports image",
    },
    componentType: "panelActions",
    evidence: "exported-bytes",
    expectedObservable: "Downloads decoded image output.",
    fixture: "image export fixture",
    id: "actions.output",
    kind: "control",
    target: "actions.output",
    userAction: "Click Export Image.",
    ...overrides,
  };
}

describe("Toolcraft export artifact acceptance", () => {
  it("requires exact image coverage for an image action", () => {
    const schema = createSchema(["export-image"]);

    expect(getCoverageErrors(schema, [createAcceptance()])).toEqual([
      "artifact.image-export requires exported-bytes acceptance with automated and browser proof.",
    ]);
    expect(
      getCoverageErrors(schema, [
        createAcceptance({
          exportArtifactCoverage: "all-required-image-export-behavior",
        }),
      ]),
    ).toEqual([]);
  });

  it("does not allow image coverage to satisfy video", () => {
    const errors = getCoverageErrors(createSchema(["export-video"]), [
      createAcceptance({
        actionCoverage: ["export.video"],
        exportArtifactCoverage: "all-required-image-export-behavior",
      }),
    ]);

    expect(errors).toEqual([
      "artifact.video-export requires exported-bytes acceptance with automated and browser proof.",
      'Acceptance "actions.output" claims artifact.image-export proof but that capability is absent.',
    ]);
  });

  it("requires exact SVG exported-bytes coverage for a typed SVG action", () => {
    const schema = createSchema(["export-svg"]);

    expect(
      getCoverageErrors(schema, [
        createAcceptance({
          actionCoverage: ["export.svg"],
          exportArtifactCoverage: "all-required-svg-export-behavior",
        }),
      ]),
    ).toEqual([]);
    expect(
      getCoverageErrors(schema, [
        createAcceptance({
          actionCoverage: ["export.svg"],
          exportArtifactCoverage: "all-required-image-export-behavior",
        }),
      ]),
    ).toEqual([
      "artifact.svg-export requires exported-bytes acceptance with automated and browser proof.",
      'Acceptance "actions.output" claims artifact.image-export proof but that capability is absent.',
    ]);
  });

  it("rejects typed export roles outside sticky panelActions", () => {
    const canonicalSchema = createSchema(["export-svg"]);
    const schema = {
      ...canonicalSchema,
      panels: {
        ...canonicalSchema.panels,
        controls: {
          sections: [
            ...(canonicalSchema.panels.controls?.sections ?? []),
            {
              controls: {
                local: {
                  applicability: {
                    mode: "always" as const,
                    origin: "explicit" as const,
                  },
                  actions: [
                    { role: "export-svg" as const, value: "export.svg" },
                  ],
                  target: "local.actions",
                  type: "actions" as const,
                },
              },
              id: "local",
              origin: "explicit" as const,
            },
          ],
          title: "Controls",
        },
      },
    };

    expect(getToolcraftExportArtifactActionPlacementErrors(schema)).toContain(
      'Typed export-svg action "export.svg" must be declared in sticky panelActions.',
    );
  });

  it("requires exported bytes plus automated browser proof", () => {
    const errors = getCoverageErrors(createSchema(["export-image"]), [
      createAcceptance({
        automated: false,
        browser: false,
        evidence: "command-side-effect",
        exportArtifactCoverage: "all-required-image-export-behavior",
      }),
    ]);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('evidence is not "exported-bytes"'),
        expect.stringContaining("requires automated and browser proof"),
        expect.stringContaining("all-required-image-export-behavior"),
      ]),
    );
  });

  it("allows one row to cover both typed actions explicitly", () => {
    expect(
      getCoverageErrors(createSchema(["export-image", "export-video"]), [
        createAcceptance({
          actionCoverage: ["export.png", "export.video"],
          exportArtifactCoverage: [
            "all-required-image-export-behavior",
            "all-required-video-export-behavior",
          ],
        }),
      ]),
    ).toEqual([]);
  });
});
