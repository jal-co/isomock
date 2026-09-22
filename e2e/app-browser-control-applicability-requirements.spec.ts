import { expect, test } from "@playwright/test";
import { defineToolcraft } from "@/toolcraft/runtime";

import { deriveToolcraftBrowserRuntimeRequirements } from "./browser-runtime-evidence-requirements";

const inventory = [
  {
    entity: "Feature",
    entityId: "feature",
    finiteSelectors: [{
      affectedTargets: ["feature.amount"],
      reason: "Mode selects the active amount behavior.",
      role: "branch",
      target: "feature.mode",
    }],
    groupingReason: "Mode and amount describe one feature.",
    id: "feature",
    targets: ["feature.mode", "feature.amount"],
    title: "Feature",
  },
] as const;

test("conditional controls derive case-specific visibility and outcome evidence", () => {
  const schema = defineToolcraft({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                amount: {
                  applicability: {
                    all: [{ equals: "advanced", target: "feature.mode" }],
                    mode: "conditional",
                  },
                  defaultValue: 1,
                  target: "feature.amount",
                  type: "slider",
                },
                mode: {
                  applicability: { mode: "always" },
                  defaultValue: "simple",
                  options: [
                    { label: "Simple", value: "simple" },
                    { label: "Advanced", value: "advanced" },
                  ],
                  target: "feature.mode",
                  type: "segmented",
                },
              },
              id: "feature",
              title: "Feature",
            },
          ],
          title: "Controls",
        },
      },
    },
    modules: [],
  });
  const requirements = deriveToolcraftBrowserRuntimeRequirements(
    [
      {
        browser: {
          budget: "standard",
          file: "e2e/app-controls.spec.ts",
          testName: "browser: conditional amount",
        },
        evidence: "product-output",
        id: "feature.amount",
        kind: "control",
        target: "feature.amount",
      },
    ],
    schema,
    inventory,
  );

  expect(requirements.map(({ evidenceType }) => evidenceType)).toEqual(
    expect.arrayContaining([
      "control-applicability-hidden",
      "control-applicability-visible",
      "product-observable-change",
    ]),
  );
  expect(
    requirements.some(
      (requirement) => requirement.requirementId === "feature.amount",
    ),
  ).toBe(false);
});

test("finite siblings expand outcomes even when always-applicability omits the selector", () => {
  const schema = defineToolcraft({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                amount: {
                  applicability: { mode: "always" },
                  defaultValue: 1,
                  target: "feature.amount",
                  type: "slider",
                },
                mode: {
                  applicability: { mode: "always" },
                  defaultValue: "simple",
                  options: [
                    { label: "Simple", value: "simple" },
                    { label: "Advanced", value: "advanced" },
                  ],
                  target: "feature.mode",
                  type: "segmented",
                },
              },
              id: "feature",
              title: "Feature",
            },
          ],
          title: "Controls",
        },
      },
    },
    modules: [],
  });
  const acceptance = {
    browser: {
      budget: "standard",
      file: "e2e/app-controls.spec.ts",
      testName: "browser: feature amount",
    },
    evidence: "product-output" as const,
    id: "feature.amount",
    kind: "control" as const,
    target: "feature.amount",
  } as const;
  const requirements = deriveToolcraftBrowserRuntimeRequirements(
    [acceptance],
    schema,
    inventory,
  );

  expect(requirements).toHaveLength(4);
  expect(
    requirements.filter(
      ({ evidenceType }) => evidenceType === "control-applicability-visible",
    ),
  ).toHaveLength(2);
  expect(
    requirements.filter(
      ({ evidenceType }) => evidenceType === "product-observable-change",
    ),
  ).toHaveLength(2);
  expect(
    requirements.every(({ requirementId }) =>
      requirementId.includes("#applicability:feature.mode="),
    ),
  ).toBe(true);

  expect(() =>
    deriveToolcraftBrowserRuntimeRequirements(
      [
        {
          ...acceptance,
          renderScaleCoverage: {
            kind: "selected-backing-pixels",
            states: [],
          },
        },
      ],
      schema,
      inventory,
    ),
  ).toThrow(
    "Visible applicability case for feature.amount has no product outcome requirement",
  );
});
