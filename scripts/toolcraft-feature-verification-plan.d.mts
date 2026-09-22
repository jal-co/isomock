export const TOOLCRAFT_FEATURE_VERIFICATION_PLAN_VERSION: 2;

export type ToolcraftFeatureBrowserScenario = Readonly<{
  acceptanceIds: readonly string[];
  budget: "extended-io" | "standard";
  file: `e2e/${string}.spec.ts`;
  testName: string;
}>;

export type ToolcraftFeatureVerificationPlan = Readonly<{
  acceptanceIds: readonly string[];
  scenarios: readonly ToolcraftFeatureBrowserScenario[];
  version: 2;
}>;

export type ToolcraftFeatureVerificationPlanValidation = Readonly<{
  errors: readonly string[];
  plan?: ToolcraftFeatureVerificationPlan;
}>;

export function validateToolcraftFeatureVerificationPlan(
  value: unknown,
): ToolcraftFeatureVerificationPlanValidation;

export function parseToolcraftFeatureVerificationPlanSource(
  source: unknown,
): ToolcraftFeatureVerificationPlan;
