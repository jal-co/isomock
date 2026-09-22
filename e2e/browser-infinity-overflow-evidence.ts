import { expect, test, type Page } from "@playwright/test";
import { appAcceptance } from "../src/app/app-acceptance";
import { appPerformance } from "../src/app/app-performance";
import { appSchema } from "../src/app/app-schema";
import { getToolcraftInfinityOverflowErrors } from "../src/app/acceptance/infinity-overflow";
import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import { runInfinityOverflowRecipe } from "./browser-infinity-overflow-recipe";
import type { ToolcraftInfinityEdgeProbe } from "./browser-infinity-overflow-pixels";
export type { ToolcraftInfinityEdgeProbe } from "./browser-infinity-overflow-pixels";

export async function expectToolcraftInfinityOverflowEvidence(page: Page, options: {
  requirementId: string;
  prepare: () => Promise<void>;
  probes: readonly ToolcraftInfinityEdgeProbe[];
}): Promise<void> {
  const entry = appAcceptance.find(entry => entry.id === options.requirementId);
  const pipeline = appPerformance.rendererPipeline;
  if (!entry?.infinityOverflowCoverage || !entry.browser || !pipeline) throw new Error("Infinity overflow proof requires a registered acceptance case and renderer pipeline.");
  expect(entry.browser.testName, "Overflow evidence belongs to its registered browser test").toBe(test.info().title);
  expect(getToolcraftInfinityOverflowErrors({ acceptance: appAcceptance, rendererPipeline: pipeline, schema: appSchema })).toEqual([]);
  await runInfinityOverflowRecipe(page, { ...options, coverage: entry.infinityOverflowCoverage, pipeline, schema: appSchema });
  await attachToolcraftBrowserRuntimeEvidence({ evidenceType: "infinity-output-overflow", requirementId: entry.id, target: entry.target });
}
