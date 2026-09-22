import type { ToolcraftControlSectionInventoryEntry } from "./types";

export type ToolcraftControlSelectorDependencyIndex = Readonly<{
  dependentsBySelector: ReadonlyMap<string, readonly string[]>;
  selectorsByDependent: ReadonlyMap<string, readonly string[]>;
}>;

const compareCodeUnits = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function addDependency(
  dependencies: Map<string, Set<string>>,
  source: string,
  target: string,
): void {
  const targets = dependencies.get(source) ?? new Set<string>();
  targets.add(target);
  dependencies.set(source, targets);
}

function freezeDependencyMap(
  dependencies: ReadonlyMap<string, ReadonlySet<string>>,
): ReadonlyMap<string, readonly string[]> {
  return new Map(
    [...dependencies]
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([target, related]) => [
        target,
        Object.freeze([...related].sort(compareCodeUnits)),
      ] as const),
  );
}

export function buildToolcraftControlSelectorDependencyIndex(
  predicateDependentsBySelector: ReadonlyMap<string, ReadonlySet<string>>,
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[],
): ToolcraftControlSelectorDependencyIndex {
  const dependentsBySelector = new Map<string, Set<string>>();

  for (const [selectorTarget, dependents] of predicateDependentsBySelector) {
    for (const dependentTarget of dependents) {
      addDependency(dependentsBySelector, selectorTarget, dependentTarget);
    }
  }

  for (const section of sectionInventory) {
    for (const selector of section.finiteSelectors) {
      if (selector.role !== "branch") continue;
      for (const dependentTarget of selector.affectedTargets) {
        addDependency(dependentsBySelector, selector.target, dependentTarget);
      }
    }
  }

  const selectorsByDependent = new Map<string, Set<string>>();
  for (const [selectorTarget, dependents] of dependentsBySelector) {
    for (const dependentTarget of dependents) {
      addDependency(selectorsByDependent, dependentTarget, selectorTarget);
    }
  }

  return Object.freeze({
    dependentsBySelector: freezeDependencyMap(dependentsBySelector),
    selectorsByDependent: freezeDependencyMap(selectorsByDependent),
  });
}
