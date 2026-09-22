import { expect, test } from "@playwright/test";
import { defineToolcraft, mediaSourceModule } from "@/toolcraft/runtime";

import { deriveToolcraftBrowserRuntimeRequirements } from "./browser-runtime-evidence-requirements";

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

function makeSchema(withMedia: boolean) {
  return defineToolcraft({
    base: {
      identity: { id: "background-media", title: "Background media" },
      canvas: { enabled: true, upload: withMedia },
      panels: {},
    },
    modules: withMedia ? [mediaSourceModule()] : [],
  });
}

test("finite stacking derives only when canonical capabilities include media", () => {
  expect(
    deriveToolcraftBrowserRuntimeRequirements(
      acceptance,
      makeSchema(false),
    ).map(({ evidenceType }) => evidenceType),
  ).not.toContain("background-finite-media-stacking");
  expect(
    deriveToolcraftBrowserRuntimeRequirements(acceptance, makeSchema(true)).map(
      ({ evidenceType }) => evidenceType,
    ),
  ).toContain("background-finite-media-stacking");
});
