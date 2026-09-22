import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import { getToolcraftPerformanceProfile } from "../performance/profile-catalog";
import { requiresConcreteUiTarget } from "./performance-scenario-validation";
import { hasOutputDeliveryActionReference } from "./performance-schema-queries";
import type { ToolcraftPerformanceScenario } from "./performance-types";

export function hasToolcraftBrowserTestName(
  scenario: ToolcraftPerformanceScenario,
): boolean {
  return scenario.browser && scenario.browserTestName.trim().length > 0;
}

export function getToolcraftPerformanceScenarioBaseErrors(
  scenario: ToolcraftPerformanceScenario,
): string[] {
  const errors: string[] = [];

  if (!scenario.id.trim()) {
    errors.push("Performance scenario is missing an id.");
  }
  if (!scenario.fixture.trim()) {
    errors.push(`${scenario.id} must name a representative fixture.`);
  }
  if (!scenario.expectedObservable.trim()) {
    errors.push(
      `${scenario.id} must describe a product-level performance observable.`,
    );
  }
  if (!scenario.automated || !scenario.automatedTestName.trim()) {
    errors.push(`${scenario.id} must point to an automated performance test.`);
  }
  if (!hasToolcraftBrowserTestName(scenario)) {
    errors.push(`${scenario.id} must point to a browser performance test.`);
  }
  return errors;
}

export function getToolcraftPerformanceScenarioInteractionErrors(
  schema: ResolvedToolcraftAppSchema,
  scenario: ToolcraftPerformanceScenario,
): string[] {
  const errors: string[] = [];

  if (
    requiresConcreteUiTarget(scenario.interaction) &&
    !scenario.controlLabel?.trim() &&
    !scenario.uiSelector?.trim() &&
    !(scenario.interaction === "export" && scenario.actionValue?.trim())
  ) {
    errors.push(
      `${scenario.id} ${scenario.interaction} scenario must declare controlLabel or uiSelector for its real browser interaction.`,
    );
  }

  if (scenario.interaction !== "export") return errors;

  if (!scenario.actionValue?.trim()) {
    errors.push(
      `${scenario.id} export scenario must declare actionValue for the exact output delivery action it exercises.`,
    );
  } else if (!scenario.controlLabel?.trim()) {
    errors.push(
      `${scenario.id} export scenario must declare controlLabel for the visible output delivery action it clicks.`,
    );
  } else if (
    scenario.completionEvidence !== "download" &&
    scenario.completionEvidence !== "clipboard"
  ) {
    errors.push(
      `${scenario.id} export scenario must declare completionEvidence as download or clipboard.`,
    );
  } else if (!hasOutputDeliveryActionReference(schema, scenario)) {
    errors.push(
      `${scenario.id} export scenario references actionValue "${scenario.actionValue.trim()}" with label "${scenario.controlLabel.trim()}", but schema panelActions has no matching output delivery action.`,
    );
  }

  const centralDeadline =
    getToolcraftPerformanceProfile("batch-responsive").thresholds
      .maxBatchCompletionMs;
  if (
    scenario.completionDeadlineMs !== undefined &&
    (!Number.isFinite(scenario.completionDeadlineMs) ||
      scenario.completionDeadlineMs <= 0 ||
      centralDeadline === undefined ||
      scenario.completionDeadlineMs > centralDeadline)
  ) {
    errors.push(
      `${scenario.id} completionDeadlineMs must be a positive deadline no greater than the central batch profile deadline ${centralDeadline}ms.`,
    );
  }

  return errors;
}

export function getToolcraftPerformanceScenarioCommonErrors(
  schema: ResolvedToolcraftAppSchema,
  scenario: ToolcraftPerformanceScenario,
): string[] {
  return [
    ...getToolcraftPerformanceScenarioBaseErrors(scenario),
    ...getToolcraftPerformanceScenarioInteractionErrors(schema, scenario),
  ];
}
