import {
  expect,
  test as playwrightTest,
  type Page,
} from "@playwright/test";

import { parseToolcraftFeatureVerificationPlanSource } from "../scripts/toolcraft-feature-verification-plan.mjs";
import { TOOLCRAFT_BROWSER_PROOF_TIMEOUT_MS } from "../src/app/acceptance/browser-proof-policy.mjs";

export { expect };
export { expectToolcraftReferenceParity } from "./browser-acceptance-outcome-helpers";
export { expectToolcraftCanvasRenderScaleEvidence } from "./browser-render-scale-evidence";
export { expectExportExcludesCanvasHandles } from "./canvas-handle-helpers";
export {
  expectToolcraftOrientationAxisDrag,
  expectToolcraftOrientationAxisSnap,
  expectToolcraftOrientationCanvasMissPan,
  expectToolcraftOrientationModelDrag,
  expectToolcraftOrientationUndoReset,
} from "./browser-orientation-gizmo-evidence-helpers";

export type ToolcraftProductTestFixtures = Readonly<{
  page: Page;
}>;

export type ToolcraftProductTestCallback = (
  fixtures: ToolcraftProductTestFixtures,
) => Promise<void> | void;

type ToolcraftProductTest = (
  title: string,
  callback: ToolcraftProductTestCallback,
) => void;

type ToolcraftProtectedFixtures = Readonly<{
  toolcraftProtectedTimeout: void;
}>;

const featureVerificationPlanSource =
  process.env.TOOLCRAFT_FEATURE_VERIFICATION_PLAN;
const selectedProductTestBudgets =
  featureVerificationPlanSource === undefined
    ? undefined
    : new Map(
        parseToolcraftFeatureVerificationPlanSource(
          featureVerificationPlanSource,
        ).scenarios.map(({ budget, testName }) => [testName, budget]),
      );

async function getProductTestBudget(title: string) {
  const selectedBudget = selectedProductTestBudgets?.get(title);
  if (selectedBudget !== undefined) return selectedBudget;
  const [browserProof, acceptance] = await Promise.all([
    import("../src/app/acceptance/browser-proof"),
    import("../src/app/app-acceptance"),
  ]);
  return browserProof.getToolcraftBrowserProofBudgetForTestName(
    acceptance.appAcceptance,
    title,
  );
}

const protectedProductTest = playwrightTest.extend<ToolcraftProtectedFixtures>({
  toolcraftProtectedTimeout: [
    async ({}, use, testInfo) => {
      const budget = await getProductTestBudget(testInfo.title);
      testInfo.setTimeout(TOOLCRAFT_BROWSER_PROOF_TIMEOUT_MS[budget]);
      await use();
    },
    { auto: true },
  ],
});

const registerProductTest = ((
  title: string,
  callback: ToolcraftProductTestCallback,
): void => {
  if (
    selectedProductTestBudgets !== undefined &&
    !selectedProductTestBudgets.has(title)
  ) {
    return;
  }
  protectedProductTest(title, async ({ page }) => {
    await callback(Object.freeze({ page }));
  });
}) as ToolcraftProductTest;

export const test = Object.freeze(registerProductTest);
