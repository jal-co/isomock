import {
  getToolcraftApplicabilityPredicates,
  type ResolvedToolcraftAppSchema,
  type ResolvedToolcraftControlSchema,
  type ToolcraftControlPredicateSchema,
} from "@/toolcraft/runtime";

import {
  getToolcraftApplicabilitySelectorDomain,
} from "./control-applicability";
import {
  buildToolcraftControlSelectorDependencyIndex,
  type ToolcraftControlSelectorDependencyIndex,
} from "./control-selector-dependency-index";
import { getToolcraftPredicateSelectorDomainErrors } from "./control-selector-domain-validation";
import {
  getEntryFiniteSelectors,
  getSelectorTarget,
  type SelectorInventoryEntryRecord,
  validateSelectorEntryShape,
} from "./control-selector-entry-validation";
import { getToolcraftControlSectionInventoryStructureErrors } from "./control-section-inventory-structure";
import { isToolcraftProductSectionControl } from "./controls";
import type { ToolcraftControlSectionInventoryEntry } from "./types";
import { getToolcraftProductModeInventoryErrors } from "./product-mode-inventory";

function getControlIndexes(
  schema: Pick<ResolvedToolcraftAppSchema, "panels">,
): Readonly<{
  all: ReadonlyMap<string, ResolvedToolcraftControlSchema>;
  product: ReadonlyMap<string, ResolvedToolcraftControlSchema>;
}> {
  const all = new Map<string, ResolvedToolcraftControlSchema>();
  const product = new Map<string, ResolvedToolcraftControlSchema>();

  for (const section of schema.panels.controls?.sections ?? []) {
    for (const control of Object.values(section.controls)) {
      all.set(control.target, control);
      if (isToolcraftProductSectionControl(control)) {
        product.set(control.target, control);
      }
    }
  }

  return { all, product };
}

type ApplicabilityIndex = Readonly<{
  dependentsBySelector: ReadonlyMap<string, ReadonlySet<string>>;
  predicatesBySelector: ReadonlyMap<
    string,
    readonly ToolcraftControlPredicateSchema[]
  >;
}>;

type SelectorInventoryContext = Readonly<{
  controlsByTarget: ReadonlyMap<string, ResolvedToolcraftControlSchema>;
  dependentsBySelector: ApplicabilityIndex["dependentsBySelector"];
  finiteTargets: ReadonlySet<string>;
  ownerByTarget: ReadonlyMap<string, ToolcraftControlSectionInventoryEntry>;
  predicateDomainErrors: readonly string[];
}>;

type SelectorDependencySource = Readonly<{
  allControlsByTarget: ReadonlyMap<string, ResolvedToolcraftControlSchema>;
  controlsByTarget: ReadonlyMap<string, ResolvedToolcraftControlSchema>;
  dependentsBySelector: ApplicabilityIndex["dependentsBySelector"];
  predicatesBySelector: ApplicabilityIndex["predicatesBySelector"];
}>;

function getApplicabilityIndex(
  controlsByTarget: ReadonlyMap<string, ResolvedToolcraftControlSchema>,
): ApplicabilityIndex {
  const dependents = new Map<string, Set<string>>();
  const predicates = new Map<string, ToolcraftControlPredicateSchema[]>();

  for (const control of controlsByTarget.values()) {
    for (const predicate of getToolcraftApplicabilityPredicates(
      control.applicability,
    )) {
      const targets = dependents.get(predicate.target) ?? new Set<string>();
      targets.add(control.target);
      dependents.set(predicate.target, targets);
      const selectorPredicates = predicates.get(predicate.target) ?? [];
      selectorPredicates.push(predicate);
      predicates.set(predicate.target, selectorPredicates);
    }
  }

  return {
    dependentsBySelector: dependents,
    predicatesBySelector: predicates,
  };
}

function getInventoryOwnerByTarget(
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[],
): ReadonlyMap<string, ToolcraftControlSectionInventoryEntry> {
  const owners = new Map<string, ToolcraftControlSectionInventoryEntry>();

  for (const entry of sectionInventory) {
    for (const target of entry.targets) {
      if (!owners.has(target)) {
        owners.set(target, entry);
      }
    }
  }

  return owners;
}

function collectFiniteSelectorTargets(
  controlsByTarget: ReadonlyMap<string, ResolvedToolcraftControlSchema>,
  predicatesBySelector: ApplicabilityIndex["predicatesBySelector"],
): ReadonlySet<string> {
  const targets = new Set<string>();

  for (const control of controlsByTarget.values()) {
    const domain = getToolcraftApplicabilitySelectorDomain(
      control,
      predicatesBySelector.get(control.target) ?? [],
    );

    if (domain.status === "supported") {
      targets.add(control.target);
    }
  }

  return targets;
}

function createSelectorDependencySource(
  schema: Pick<ResolvedToolcraftAppSchema, "panels">,
): SelectorDependencySource {
  const { all, product } = getControlIndexes(schema);
  const { dependentsBySelector, predicatesBySelector } =
    getApplicabilityIndex(product);

  return {
    allControlsByTarget: all,
    controlsByTarget: product,
    dependentsBySelector,
    predicatesBySelector,
  };
}

function createSelectorInventoryContext(
  source: SelectorDependencySource,
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[],
): SelectorInventoryContext {
  const {
    allControlsByTarget,
    controlsByTarget,
    dependentsBySelector,
    predicatesBySelector,
  } = source;

  return {
    controlsByTarget,
    dependentsBySelector,
    finiteTargets: collectFiniteSelectorTargets(
      controlsByTarget,
      predicatesBySelector,
    ),
    ownerByTarget: getInventoryOwnerByTarget(sectionInventory),
    predicateDomainErrors: getToolcraftPredicateSelectorDomainErrors(
      allControlsByTarget,
      predicatesBySelector,
    ),
  };
}

export function getToolcraftFiniteSelectorTargets(
  schema: Pick<ResolvedToolcraftAppSchema, "panels">,
): ReadonlySet<string> {
  const { product: controlsByTarget } = getControlIndexes(schema);
  const { predicatesBySelector } = getApplicabilityIndex(controlsByTarget);
  return collectFiniteSelectorTargets(controlsByTarget, predicatesBySelector);
}

function validateBranchAffectedTargets({
  branch,
  controlsByTarget,
  dependentsBySelector,
  errors,
  ownerByTarget,
  selectorOwner,
}: {
  branch: SelectorInventoryEntryRecord;
  controlsByTarget: ReadonlyMap<string, ResolvedToolcraftControlSchema>;
  dependentsBySelector: ReadonlyMap<string, ReadonlySet<string>>;
  errors: string[];
  ownerByTarget: ReadonlyMap<string, ToolcraftControlSectionInventoryEntry>;
  selectorOwner: ToolcraftControlSectionInventoryEntry;
}): void {
  const selectorTarget = getSelectorTarget(branch);
  if (!selectorTarget || !Array.isArray(branch.affectedTargets)) {
    return;
  }

  const seen = new Set<string>();
  const predicateDependents = dependentsBySelector.get(selectorTarget) ?? new Set();

  for (const candidate of branch.affectedTargets) {
    if (typeof candidate !== "string" || !candidate.trim()) {
      errors.push(
        `Branch selector "${selectorTarget}" contains a non-string affected target.`,
      );
      continue;
    }
    if (candidate === selectorTarget) {
      errors.push(`Branch selector "${selectorTarget}" cannot affect itself.`);
      continue;
    }
    if (seen.has(candidate)) {
      errors.push(
        `Branch selector "${selectorTarget}" repeats affected target "${candidate}".`,
      );
      continue;
    }
    seen.add(candidate);

    const affectedControl = controlsByTarget.get(candidate);
    if (!affectedControl) {
      errors.push(
        `Branch selector "${selectorTarget}" affected target "${candidate}" is not a product control.`,
      );
      continue;
    }
    const affectedOwner = ownerByTarget.get(candidate);
    if (!affectedOwner || (!branch.productMode && affectedOwner.entityId !== selectorOwner.entityId)) {
      errors.push(
        `Branch selector "${selectorTarget}" cannot affect "${candidate}" because they belong to different entities.`,
      );
    }
    if (affectedControl.applicability.mode !== "always") {
      errors.push(
        `Branch selector "${selectorTarget}" affected target "${candidate}" must be always applicable.`,
      );
    }
    if (predicateDependents.has(candidate)) {
      errors.push(
        `Branch selector "${selectorTarget}" must not list "${candidate}" because its applicability already declares that dependency.`,
      );
    }
  }

  if (branch.affectedTargets.length === 0 && predicateDependents.size === 0) {
    errors.push(
      `Branch selector "${selectorTarget}" must affect at least one peer or own an applicability predicate.`,
    );
  }
}

function getSelectorInventoryErrors(
  context: SelectorInventoryContext,
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[],
): string[] {
  const errors: string[] = [];
  const {
    controlsByTarget,
    dependentsBySelector,
    finiteTargets,
    ownerByTarget,
  } = context;
  const classifications = new Map<string, number>();

  for (const section of sectionInventory) {
    const finiteSelectors = getEntryFiniteSelectors(section);
    if (!finiteSelectors) {
      errors.push(
        `Control Section Inventory entry "${section.id}" must declare finiteSelectors as an array.`,
      );
      continue;
    }

    for (const candidate of finiteSelectors) {
      if (!validateSelectorEntryShape(candidate, errors, section.id)) {
        continue;
      }
      const target = getSelectorTarget(candidate);
      if (!target) {
        continue;
      }
      classifications.set(target, (classifications.get(target) ?? 0) + 1);

      if (!section.targets.includes(target)) {
        errors.push(
          `Selector inventory target "${target}" is not owned by section "${section.id}".`,
        );
      }
      if (!finiteTargets.has(target)) {
        errors.push(
          `Selector inventory target "${target}" is not a finite product selector.`,
        );
      }
      if (
        dependentsBySelector.has(target) &&
        candidate.role === "parameter"
      ) {
        errors.push(
          `Finite selector "${target}" owns applicability predicates and must declare role "branch".`,
        );
      }
      if (candidate.role === "branch") {
        validateBranchAffectedTargets({
          branch: candidate,
          controlsByTarget,
          dependentsBySelector,
          errors,
          ownerByTarget,
          selectorOwner: section,
        });
      }
    }
  }

  for (const target of finiteTargets) {
    const count = classifications.get(target) ?? 0;
    if (count !== 1) {
      errors.push(
        `Finite selector "${target}" must be classified exactly once; found ${count} entries.`,
      );
    }
  }

  return errors.sort();
}

export function getToolcraftControlSelectorInventoryErrors(
  schema: Pick<ResolvedToolcraftAppSchema, "panels">,
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[],
): string[] {
  return [...getSelectorInventoryErrors(
    createSelectorInventoryContext(
      createSelectorDependencySource(schema),
      sectionInventory,
    ),
    sectionInventory,
  ), ...getToolcraftProductModeInventoryErrors(schema, sectionInventory)];
}

export type { ToolcraftControlSelectorDependencyIndex };

export function createToolcraftControlSelectorCaseDependencyIndex(
  schema: Pick<ResolvedToolcraftAppSchema, "panels">,
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[],
): ToolcraftControlSelectorDependencyIndex {
  const source = createSelectorDependencySource(schema);
  return buildToolcraftControlSelectorDependencyIndex(
    source.dependentsBySelector,
    sectionInventory,
  );
}

export function createToolcraftControlSelectorDependencyIndex(
  schema: Pick<ResolvedToolcraftAppSchema, "panels">,
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[],
): ToolcraftControlSelectorDependencyIndex {
  const source = createSelectorDependencySource(schema);
  const context = createSelectorInventoryContext(source, sectionInventory);
  const errors = [
    ...getToolcraftControlSectionInventoryStructureErrors(
      schema,
      sectionInventory,
    ),
    ...context.predicateDomainErrors,
    ...getSelectorInventoryErrors(context, sectionInventory),
    ...getToolcraftProductModeInventoryErrors(schema, sectionInventory),
  ].sort();

  if (errors.length > 0) {
    throw new Error(
      `Toolcraft selector dependency inventory is invalid:\n${errors.map((error) => `- ${error}`).join("\n")}`,
    );
  }

  return buildToolcraftControlSelectorDependencyIndex(
    context.dependentsBySelector,
    sectionInventory,
  );
}
