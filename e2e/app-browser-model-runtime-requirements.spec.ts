import { expect, test } from "@playwright/test";
import { defineToolcraft, model3dModule } from "@/toolcraft/runtime";

import { deriveToolcraftBrowserRuntimeRequirements } from "./browser-runtime-evidence-requirements";

test("model import coverage derives lifecycle-specific runtime evidence", () => {
  const schema = defineToolcraft({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              id: "test-section-1",
              controls: {
                model: {
                  applicability: { mode: "always" as const },
                  assetKind: "model",
                  defaultValue: null,
                  label: "Model",
                  target: "media.model",
                  type: "fileDrop",
                },
              },
              title: "Model",
            },
          ],
          title: "Controls",
        },
      },
    },
    modules: [model3dModule()],
  });

  const requirements = deriveToolcraftBrowserRuntimeRequirements(
    [
      {
        browser: {
          budget: "standard",
          file: "e2e/app-controls.spec.ts",
          testName: "browser: complete model import lifecycle",
        },
        evidence: "media-lifecycle",
        id: "media.model",
        modelImportCoverage: "all-required-model-import-behavior",
        target: "media.model",
      },
    ],
    schema,
  ).filter(({ requirementId }) => requirementId.startsWith("media.model#"));

  expect(requirements.map(({ evidenceType }) => evidenceType)).toEqual([
    "model-advertised-format-import",
    "model-staged-preview",
    "model-clean-commit",
    "model-package-extraction",
    "model-deterministic-root-selection",
    "model-appearance-preservation",
    "model-fallback-appearance",
    "model-presentation-consumer-readiness",
    "model-pixel-output",
    "model-repairable-diagnosis",
    "model-repair-action",
    "model-repair-progress",
    "model-verified-repair",
    "model-fatal-rejection",
    "model-persistence-restore",
    "model-resource-unavailable",
    "model-preview-output",
    "model-export-output",
    "model-history-reset",
  ]);
  expect(new Set(requirements.map(({ target }) => target))).toEqual(
    new Set(["media.model"]),
  );
  expect(new Set(requirements.map(({ testName }) => testName))).toEqual(
    new Set(["browser: complete model import lifecycle"]),
  );
});
