import type { ToolcraftEnvelopeValidationContext } from "./performance-envelope-validation-context";
import type { ToolcraftPerformancePath } from "./performance-path-model";
import {
  getToolcraftPerformanceScenarioCommonErrors,
  hasToolcraftBrowserTestName,
} from "./performance-scenario-common-validation";
import type { ToolcraftPerformanceScenario } from "./performance-types";

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareCodeUnits);
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getScenarioPathErrors(
  scenario: ToolcraftPerformanceScenario,
  pathsById: ReadonlyMap<string, ToolcraftPerformancePath>,
): string[] {
  const path = pathsById.get(scenario.pathId);
  if (!path) {
    return [
      `Performance scenario ${scenario.id} references unknown pathId "${scenario.pathId}".`,
    ];
  }

  const errors: string[] = [];
  if (scenario.interaction !== path.interaction) {
    errors.push(
      `Performance scenario ${scenario.id} interaction ${scenario.interaction} does not exercise path ${path.id} interaction ${path.interaction}.`,
    );
  }
  const declaredCoveredTargets = scenario.coversTargets;
  const coveredTargets = uniqueSorted(declaredCoveredTargets);
  if (coveredTargets.length !== declaredCoveredTargets.length) {
    errors.push(
      `Performance scenario ${scenario.id} coversTargets must not contain duplicate targets.`,
    );
  }
  if (!arraysEqual(coveredTargets, path.targets)) {
    errors.push(
      `Performance scenario ${scenario.id} coversTargets must equal path ${path.id} targets ${JSON.stringify(path.targets)}.`,
    );
  }
  if (scenario.target && !path.targets.includes(scenario.target)) {
    errors.push(
      `Performance scenario ${scenario.id} target "${scenario.target}" does not belong to path ${path.id}.`,
    );
  }
  return errors;
}

export function getToolcraftPerformancePathCoverageErrors(
  context: ToolcraftEnvelopeValidationContext,
): string[] {
  const { config, paths, schema } = context;
  const pathsById = new Map(paths.map((path) => [path.id, path] as const));
  const scenariosByPathId = new Map<string, ToolcraftPerformanceScenario[]>();
  const browserNameOwners = new Map<string, { pathId: string; scenarioId: string }>();
  const errors: string[] = [];

  for (const scenario of config.scenarios) {
    errors.push(...getToolcraftPerformanceScenarioCommonErrors(schema, scenario));
    const scenarios = scenariosByPathId.get(scenario.pathId) ?? [];
    scenarios.push(scenario);
    scenariosByPathId.set(scenario.pathId, scenarios);
    errors.push(...getScenarioPathErrors(scenario, pathsById));

    if (hasToolcraftBrowserTestName(scenario)) {
      const previous = browserNameOwners.get(scenario.browserTestName);
      if (previous && previous.pathId !== scenario.pathId) {
        errors.push(
          `${scenario.id} browserTestName "${scenario.browserTestName}" is already used by ${previous.scenarioId} for a different performance path.`,
        );
      } else if (!previous) {
        browserNameOwners.set(scenario.browserTestName, {
          pathId: scenario.pathId,
          scenarioId: scenario.id,
        });
      }
    }
  }

  for (const path of paths) {
    const scenarios = scenariosByPathId.get(path.id) ?? [];
    if (scenarios.length > 1) {
      errors.push(
        `Performance path ${path.id} must have exactly one path scenario; found ${scenarios.length}. Equivalent controls share the derived path instead of declaring per-control scenarios.`,
      );
    }
    if (
      !scenarios.some(
        (scenario) =>
          scenario.automated &&
          scenario.automatedTestName.trim() &&
          hasToolcraftBrowserTestName(scenario),
      )
    ) {
      errors.push(
        `Performance path ${path.id} must have an automated browser performance scenario.`,
      );
    }
  }

  return errors;
}
