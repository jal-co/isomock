import { describe, expect, it } from "vitest";

import {
  validateToolcraftFeatureVerificationPlan,
} from "../../../scripts/toolcraft-feature-verification-plan.mjs";
import { validateToolcraftDeliveryCatalog } from "../../../scripts/toolcraft-delivery-catalog-validation.mjs";
import {
  TOOLCRAFT_BROWSER_PROOF_TIMEOUT_MS,
  toolcraftBrowserProofBudgetValues,
  validateToolcraftBrowserProofRelations,
} from "./browser-proof-policy.mjs";
import {
  getToolcraftBrowserProofBudgetForTestName,
  getToolcraftBrowserProofErrors,
  groupToolcraftBrowserProofScenarios,
} from "./browser-proof";
import type { ToolcraftComponentAcceptance } from "./types";

const standardBrowserDescriptor = {
  budget: "standard",
  file: "e2e/product-material.spec.ts",
  testName: "browser: material layer",
} as const;

const standardAcceptance: ToolcraftComponentAcceptance = {
  automated: true,
  automatedTestName: "material layer changes output",
  browser: standardBrowserDescriptor,
  componentType: "select",
  evidence: "rendered-pixels",
  expectedObservable: "The selected material layer changes the rendered pixels.",
  fixture: "two material layers",
  id: "material.layer",
  kind: "control",
  target: "material.layer",
  userAction: "Select the second material layer.",
};

function withBrowser(
  browser: unknown,
  overrides: Partial<ToolcraftComponentAcceptance> = {},
): ToolcraftComponentAcceptance {
  return {
    ...standardAcceptance,
    ...overrides,
    browser,
  } as ToolcraftComponentAcceptance;
}

describe("Toolcraft browser proof policy", () => {
  it("publishes the closed budget vocabulary and timeout authority", () => {
    expect(toolcraftBrowserProofBudgetValues).toEqual([
      "extended-io",
      "standard",
    ]);
    expect(TOOLCRAFT_BROWSER_PROOF_TIMEOUT_MS).toEqual({
      "extended-io": 120_000,
      standard: 30_000,
    });
  });

  it("accepts a normalized standard descriptor", () => {
    expect(getToolcraftBrowserProofErrors([standardAcceptance])).toEqual([]);
  });

  it("publishes one relational identity, uniqueness, and grouping result", () => {
    const relations = validateToolcraftBrowserProofRelations(
      [
        standardBrowserDescriptor,
        standardBrowserDescriptor,
        { ...standardBrowserDescriptor, budget: "extended-io" },
        { ...standardBrowserDescriptor, file: "e2e/other-material.spec.ts" },
      ],
      { reservedTestNames: [standardBrowserDescriptor.testName] },
    );

    expect(relations.fileConflicts).toEqual([
      {
        files: ["e2e/other-material.spec.ts", "e2e/product-material.spec.ts"],
        testName: standardBrowserDescriptor.testName,
      },
    ]);
    expect(relations.budgetConflicts).toEqual([
      {
        budgets: ["extended-io", "standard"],
        file: standardBrowserDescriptor.file,
        testName: standardBrowserDescriptor.testName,
      },
    ]);
    expect(relations.duplicateIdentities).toContainEqual({
      budget: "standard",
      count: 2,
      file: standardBrowserDescriptor.file,
      rowIndexes: [0, 1],
      testName: standardBrowserDescriptor.testName,
    });
    expect(relations.reservedTestNameCollisions).toEqual([
      standardBrowserDescriptor.testName,
    ]);
    expect(relations.groups).toContainEqual({
      budget: "standard",
      file: standardBrowserDescriptor.file,
      rowIndexes: [0, 1],
      testName: standardBrowserDescriptor.testName,
    });
    expect(Object.isFrozen(relations)).toBe(true);
    expect(Object.isFrozen(relations.groups)).toBe(true);
    expect(() =>
      validateToolcraftBrowserProofRelations([
        standardBrowserDescriptor,
        {
          file: standardBrowserDescriptor.file,
          testName: standardBrowserDescriptor.testName,
        },
      ]),
    ).toThrow(/consistently include or omit budgets/iu);
  });

  it.each([
    ["canonical", standardBrowserDescriptor, true],
    [
      "surrounding title whitespace",
      { ...standardBrowserDescriptor, testName: " browser: material layer " },
      false,
    ],
    [
      "non-normalized file",
      { ...standardBrowserDescriptor, file: "e2e/../material.spec.ts" },
      false,
    ],
  ])(
    "keeps %s descriptor primitive validation aligned with plan transport",
    (_label, descriptor, accepted) => {
      const browserAccepted =
        getToolcraftBrowserProofErrors([withBrowser(descriptor)]).length === 0;
      const transportAccepted =
        validateToolcraftFeatureVerificationPlan({
          acceptanceIds: ["material.layer"],
          scenarios: [{ acceptanceIds: ["material.layer"], ...descriptor }],
          version: 2,
        }).errors.length === 0;
      const deliveryAccepted =
        validateToolcraftDeliveryCatalog({
          acceptance: [
            {
              acceptanceId: "material.layer",
              contractHash: "a".repeat(64),
              domainId: "material",
              file: descriptor.file,
              testName: descriptor.testName,
            },
          ],
          performance: [],
          version: 2,
        }).errors.length === 0;

      expect(browserAccepted).toBe(accepted);
      expect(transportAccepted).toBe(accepted);
      expect(deliveryAccepted).toBe(accepted);
    },
  );

  it("requires semantic I/O evidence for extended-io", () => {
    const entry = withBrowser({
      ...standardAcceptance.browser,
      budget: "extended-io",
    });

    expect(getToolcraftBrowserProofErrors([entry]).join("\n")).toMatch(
      /extended-io.*semantic.*(?:I\/O|IO)/iu,
    );
    expect(
      getToolcraftBrowserProofErrors([
        { ...entry, evidence: "persistence-state", persistenceCoverage: "reload" },
      ]),
    ).toEqual([]);
  });

  it("groups an exact shared descriptor with sorted acceptance ids", () => {
    const sharedEntries = [
      { ...standardAcceptance, id: "material.zeta" },
      { ...standardAcceptance, id: "material.alpha" },
    ];
    const grouped = groupToolcraftBrowserProofScenarios(sharedEntries);

    expect(grouped).toEqual([
      {
        acceptanceIds: ["material.alpha", "material.zeta"],
        budget: "standard",
        file: "e2e/product-material.spec.ts",
        testName: "browser: material layer",
      },
    ]);
    expect(Object.isFrozen(grouped)).toBe(true);
    expect(Object.isFrozen(grouped[0])).toBe(true);
    expect(Object.isFrozen(grouped[0].acceptanceIds)).toBe(true);
    expect(
      getToolcraftBrowserProofBudgetForTestName(
        sharedEntries,
        "browser: material layer",
      ),
    ).toBe("standard");
    expect(
      getToolcraftBrowserProofBudgetForTestName(
        [standardAcceptance],
        "browser: unowned test",
      ),
    ).toBe("standard");
  });

  it.each([
    ["unknown descriptor keys", { ...standardAcceptance.browser, extra: true }],
    ["path outside e2e", { ...standardAcceptance.browser, file: "outside.spec.ts" }],
    ["non spec path", { ...standardAcceptance.browser, file: "e2e/product-material.ts" }],
    ["backslashes", { ...standardAcceptance.browser, file: "e2e\\product-material.spec.ts" }],
    ["absolute POSIX path", { ...standardAcceptance.browser, file: "/e2e/product-material.spec.ts" }],
    ["absolute Windows path", { ...standardAcceptance.browser, file: "C:\\e2e\\product-material.spec.ts" }],
    ["empty segment", { ...standardAcceptance.browser, file: "e2e//product-material.spec.ts" }],
    ["dot segment", { ...standardAcceptance.browser, file: "e2e/./product-material.spec.ts" }],
    ["dotdot segment", { ...standardAcceptance.browser, file: "e2e/../product-material.spec.ts" }],
    ["blank title", { ...standardAcceptance.browser, testName: "   " }],
    ["unknown budget", { ...standardAcceptance.browser, budget: "slow" }],
  ])("rejects %s", (_label, descriptor) => {
    const errors = getToolcraftBrowserProofErrors([withBrowser(descriptor)]);
    expect(errors).not.toEqual([]);
    expect(Object.isFrozen(errors)).toBe(true);
  });

  it("rejects conflicting budgets for one file and title identity", () => {
    const extended = withBrowser(
      { ...standardAcceptance.browser, budget: "extended-io" },
      { evidence: "exported-bytes", id: "material.export" },
    );
    expect(
      getToolcraftBrowserProofErrors([standardAcceptance, extended]).join("\n"),
    ).toMatch(/conflicting.*budget/iu);
  });

  it("rejects one title mapped to different files", () => {
    const otherFile = withBrowser({
      ...standardAcceptance.browser,
      file: "e2e/other-material.spec.ts",
    });
    expect(
      getToolcraftBrowserProofErrors([standardAcceptance, otherFile]).join("\n"),
    ).toMatch(/test name.*different files/iu);
  });
});
