import { expect, test } from "@playwright/test";
import { defineToolcraft, spatialViewModule } from "@/toolcraft/runtime";
import { deriveToolcraftBrowserRuntimeRequirements } from "./browser-runtime-evidence-requirements";

test("orientation gizmo coverage derives behavior-specific runtime evidence", () => {
  const schema = defineToolcraft({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              id: "test-section-4",
              controls: {
                orientation: {
                  applicability: { mode: "always" as const },
                  defaultValue: {
                    position: [0, 0, 5],
                    up: [0, 1, 0],
                  },
                  keyframeable: false,
                  label: false,
                  target: "view.orbit",
                  type: "orientationGizmo",
                },
                scale: {
                  applicability: { mode: "always" as const },
                  defaultValue: 1,
                  label: "Scale",
                  target: "model.scale",
                  type: "slider",
                },
              },
              title: "Model",
            },
          ],
          title: "Controls",
        },
      },
    },
    modules: [spatialViewModule()],
  });
  const requirements = deriveToolcraftBrowserRuntimeRequirements(
    [
      {
        browser: {
          budget: "standard",
          file: "e2e/app-controls.spec.ts",
          testName: "browser: orientation behavior",
        },
        canvasHandle: {
          outputObservable: "The rendered model follows the pose.",
          testId: "toolcraft-orientation-gizmo",
          writesTarget: "view.orbit",
        },
        evidence: "product-output",
        id: "model.orientation",
        orientationGizmoCoverage: "all-required-orientation-gizmo-behavior",
      },
    ],
    schema,
  );
  const orientationRequirements = requirements
    .filter(({ evidenceType }) => evidenceType.startsWith("orientation-"))
    .map(({ evidenceType, requirementId, target, testName }) => ({
      evidenceType,
      requirementId,
      target,
      testName,
    }));

  expect(orientationRequirements).toEqual([
    {
      evidenceType: "orientation-axis-drag",
      requirementId: "model.orientation#axis-drag",
      target: "view.orbit",
      testName: "browser: orientation behavior",
    },
    {
      evidenceType: "orientation-axis-snap",
      requirementId: "model.orientation#axis-snap",
      target: "view.orbit",
      testName: "browser: orientation behavior",
    },
    {
      evidenceType: "orientation-canvas-miss-pan",
      requirementId: "model.orientation#canvas-miss-pan",
      target: "view.orbit",
      testName: "browser: orientation behavior",
    },
    {
      evidenceType: "orientation-model-drag",
      requirementId: "model.orientation#model-drag",
      target: "view.orbit",
      testName: "browser: orientation behavior",
    },
    {
      evidenceType: "orientation-shared-pose-output",
      requirementId: "model.orientation#shared-pose-output",
      target: "view.orbit",
      testName: "browser: orientation behavior",
    },
    {
      evidenceType: "orientation-undo-reset",
      requirementId: "model.orientation#undo-reset",
      target: "view.orbit",
      testName: "browser: orientation behavior",
    },
  ]);
  expect(requirements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        evidenceType: "canvas-export-clean",
        requirementId: "model.orientation#export-clean",
        target: "view.orbit",
        testName: "browser: orientation behavior",
      }),
    ]),
  );
  expect(requirements.map(({ evidenceType }) => evidenceType)).not.toContain(
    "canvas-handle-interaction",
  );
});
