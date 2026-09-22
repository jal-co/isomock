import { expect, test } from "@playwright/test";
import {
  defineToolcraft,
  imageExportModule,
  videoExportModule,
} from "@/toolcraft/runtime";

import { appAcceptance } from "../src/app/app-acceptance";
import {
  deriveToolcraftBrowserRuntimeRequirements,
  deriveToolcraftPerformancePathRuntimeRequirements,
} from "./browser-runtime-evidence-requirements";
import { getToolcraftBrowserRequirementOwnershipErrors } from "./browser-runtime-requirement-ownership";

test("runtime evidence requirements are derived from browser acceptance IDs", () => {
  const requirements =
    deriveToolcraftBrowserRuntimeRequirements(appAcceptance);

  expect(
    getToolcraftBrowserRequirementOwnershipErrors(
      appAcceptance,
      requirements,
    ),
  ).toEqual([]);
});

test("derived paths own one canonical browser evidence requirement set", () => {
  const [path] = [
    {
      id: "performance-path:export",
      interaction: "export",
      invalidates: ["export-pass"],
      preparationInvalidates: [],
      profile: "batch-responsive",
      retainedAccesses: [],
      runsOn: ["export-only"],
      targets: ["actions.output", "export.resolution"],
      workloadDimensions: ["export-width-px"],
    },
  ] as const;

  const requirements = deriveToolcraftPerformancePathRuntimeRequirements(
    [path],
    defineToolcraft({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {},
      },
      modules: [],
    }),
  );

  expect(requirements.map(({ evidenceType }) => evidenceType)).toEqual([
    "performance-measurement",
    "performance-budget",
    "performance-compiled-fixture",
    "performance-output-completion",
  ]);
  expect(
    new Set(requirements.map(({ requirementId }) => requirementId)),
  ).toEqual(new Set([path.id]));
  expect(new Set(requirements.map(({ testName }) => testName))).toEqual(
    new Set([`browser perf: toolcraft path ${path.id}`]),
  );
  expect(requirements.every(({ target }) => target === undefined)).toBe(true);
});

test("control schema derives segmented and discrete runtime evidence", () => {
  const acceptance = [
    {
      browser: {
        budget: "standard",
        file: "e2e/app-controls.spec.ts",
        testName: "browser: mode layout",
      },
      evidence: "product-output",
      id: "mode.layout",
      target: "mode.value",
    },
    {
      browser: {
        budget: "standard",
        file: "e2e/app-controls.spec.ts",
        testName: "browser: density layout",
      },
      evidence: "product-output",
      id: "density.layout",
      target: "density.value",
    },
  ] as const;
  const schema = {
    base: {
      canvas: { enabled: true },
      identity: { id: "contract-fixture", title: "Contract fixture" },
      panels: {
        controls: {
          sections: [
            {
              id: "test-section-1",
              controls: {
                density: {
                  applicability: { mode: "always" as const },
                  defaultValue: 2,
                  label: "Density",
                  max: 4,
                  min: 1,
                  step: 1,
                  target: "density.value",
                  type: "slider",
                  variant: "discrete",
                },
                mode: {
                  applicability: { mode: "always" as const },
                  defaultValue: "one",
                  label: "Mode",
                  options: [
                    { label: "One", value: "one" },
                    { label: "Two", value: "two" },
                  ],
                  target: "mode.value",
                  type: "segmented",
                },
              },
              title: "Behavior",
            },
          ],
          title: "Controls",
        },
      },
    },
    modules: [],
  } as const;

  expect(
    deriveToolcraftBrowserRuntimeRequirements(
      acceptance,
      defineToolcraft(schema),
    ).map(({ evidenceType, requirementId, target }) => ({
      evidenceType,
      requirementId,
      target,
    })),
  ).toEqual(
    expect.arrayContaining([
      {
        evidenceType: "segmented-control-layout",
        requirementId: "mode.layout",
        target: "mode.value",
      },
      {
        evidenceType: "discrete-slider-layout",
        requirementId: "density.layout",
        target: "density.value",
      },
    ]),
  );
});

test("typed background coverage derives dedicated semantic evidence", () => {
  const schema = defineToolcraft({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              id: "test-section-2",
              controls: {
                includeBackground: {
                  applicability: { mode: "always" as const },
                  defaultValue: true,
                  label: "Include",
                  target: "export.includeBackground",
                  type: "switch",
                },
              },
              title: "Output",
            },
          ],
          title: "Controls",
        },
      },
    },
    modules: [imageExportModule(), videoExportModule()],
  });
  const requirements = deriveToolcraftBrowserRuntimeRequirements(
    [
      {
        backgroundOutputCoverage: [
          "preview-hidden-when-excluded",
          "image-transparent-when-excluded",
          "infinity-viewport-color-and-dependency",
          "video-background-preserved",
        ],
        browser: {
          budget: "standard",
          file: "e2e/app-controls.spec.ts",
          testName: "browser: background output",
        },
        evidence: "rendered-pixels",
        id: "export.includeBackground",
        target: "export.includeBackground",
      },
    ],
    schema,
  );
  expect(
    requirements
      .filter(
        (requirement) =>
          requirement.requirementId === "export.includeBackground",
      )
      .map((requirement) => requirement.evidenceType),
  ).toEqual(
    expect.arrayContaining([
      "background-image-transparency",
      "background-infinity-viewport",
      "background-preview-exclusion",
      "background-video-preserved",
    ]),
  );
});

test("typed SVG coverage derives only protected SVG artifact evidence", () => {
  const requirements = deriveToolcraftBrowserRuntimeRequirements([
    {
      browser: {
        budget: "standard",
        file: "e2e/app-controls.spec.ts",
        testName: "browser: SVG export",
      },
      evidence: "exported-bytes",
      exportArtifactCoverage: "all-required-svg-export-behavior",
      id: "actions.svg",
      target: "actions.output",
    },
  ]);

  expect(requirements).toEqual([
    {
      evidenceType: "svg-export-artifact",
      requirementId: "actions.svg",
      target: "actions.output",
      testName: "browser: SVG export",
    },
  ]);
});

test("selected-entity coverage adds protected selection isolation evidence", () => {
  const requirements = deriveToolcraftBrowserRuntimeRequirements([
    {
      browser: {
        budget: "standard",
        file: "e2e/app-controls.spec.ts",
        testName: "browser: selected shape fill",
      },
      evidence: "product-output",
      id: "shape.selected-fill",
      selectionScopeCoverage: "two-entity-isolation",
      target: "selectedShape.fill",
    },
  ]);

  expect(requirements).toEqual([
    {
      evidenceType: "product-observable-change",
      requirementId: "shape.selected-fill",
      target: "selectedShape.fill",
      testName: "browser: selected shape fill",
    },
    {
      evidenceType: "selection-scoped-control",
      requirementId: "shape.selected-fill",
      target: "selectedShape.fill",
      testName: "browser: selected shape fill",
    },
  ]);
});

test("typed Infinity canvas coverage derives dedicated semantic evidence", () => {
  const requirements = deriveToolcraftBrowserRuntimeRequirements([
    {
      browser: {
        budget: "standard",
        file: "e2e/app-controls.spec.ts",
        testName: "browser: Infinity canvas mode",
      },
      evidence: "viewport-side-effect",
      id: "canvas.infinity.mode",
      infinityCanvasCoverage: "mode-continuity-and-restoration",
      target: "canvas.infinity",
    },
    {
      browser: {
        budget: "standard",
        file: "e2e/app-controls.spec.ts",
        testName: "browser: Infinity canvas image export",
      },
      evidence: "exported-bytes",
      id: "canvas.infinity.imageExport",
      infinityCanvasCoverage: "scene-bounds-image-export",
      target: "actions.output",
    },
    {
      browser: {
        budget: "standard",
        file: "e2e/app-controls.spec.ts",
        testName: "browser: Infinity canvas SVG export",
      },
      evidence: "exported-bytes",
      id: "canvas.infinity.svgExport",
      infinityCanvasCoverage: "scene-bounds-svg-export",
      target: "actions.output",
    },
  ]);

  expect(
    requirements.filter(
      ({ requirementId }) => requirementId === "canvas.infinity.mode",
    ),
  ).toEqual([
    {
      evidenceType: "viewport-side-effect",
      requirementId: "canvas.infinity.mode",
      target: "canvas.infinity",
      testName: "browser: Infinity canvas mode",
    },
    {
      evidenceType: "infinity-mode-continuity",
      requirementId: "canvas.infinity.mode",
      target: "canvas.infinity",
      testName: "browser: Infinity canvas mode",
    },
  ]);

  expect(
    requirements.map(({ evidenceType, requirementId }) => ({
      evidenceType,
      requirementId,
    })),
  ).toEqual(
    expect.arrayContaining([
      {
        evidenceType: "infinity-mode-continuity",
        requirementId: "canvas.infinity.mode",
      },
      {
        evidenceType: "infinity-scene-bounds-image-export",
        requirementId: "canvas.infinity.imageExport",
      },
      {
        evidenceType: "infinity-scene-bounds-svg-export",
        requirementId: "canvas.infinity.svgExport",
      },
    ]),
  );
});

test("all-required background coverage derives video evidence only for video products", () => {
  const makeSchema = (withVideo: boolean) =>
    defineToolcraft({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-3",
                controls: {
                  includeBackground: {
                    applicability: { mode: "always" as const },
                    defaultValue: true,
                    label: "Include",
                    target: "export.includeBackground",
                    type: "switch",
                  },
                },
                title: "Output",
              },
            ],
            title: "Controls",
          },
        },
      },
      modules: [
        imageExportModule(),
        ...(withVideo ? [videoExportModule()] : []),
      ],
    });
  const acceptance = [
    {
      backgroundOutputCoverage: "all-required-background-output" as const,
      browser: {
        budget: "standard",
        file: "e2e/app-controls.spec.ts",
        testName: "browser: background output",
      },
      evidence: "rendered-pixels" as const,
      id: "export.includeBackground",
      target: "export.includeBackground",
    },
  ] as const;

  const imageEvidence = deriveToolcraftBrowserRuntimeRequirements(
    acceptance,
    makeSchema(false),
  ).map((requirement) => requirement.evidenceType);
  const videoEvidence = deriveToolcraftBrowserRuntimeRequirements(
    acceptance,
    makeSchema(true),
  ).map((requirement) => requirement.evidenceType);

  expect(imageEvidence).not.toContain("background-video-preserved");
  expect(videoEvidence).toContain("background-video-preserved");
});
