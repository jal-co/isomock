import {
  doesToolcraftPredicateMatchValue,
  getToolcraftApplicabilityPredicates,
  type ResolvedToolcraftAppSchema,
} from "@/toolcraft/runtime";
import { getToolcraftProductModeTargets } from "./product-mode-intent";
import { isToolcraftProductSectionControl } from "./controls";
import type { ToolcraftControlSectionInventoryEntry } from "./types";

/** Check intent against the resolved panel, after runtime Setup relocation. */
export function getToolcraftProductModeInventoryErrors(
  schema: Pick<ResolvedToolcraftAppSchema, "panels">,
  inventory: readonly ToolcraftControlSectionInventoryEntry[],
): string[] {
  const modeTargets = getToolcraftProductModeTargets(inventory);
  if (modeTargets.size === 0) return [];
  const errors: string[] = [];
  if (modeTargets.size !== 1) {
    errors.push("Product modes require one canonical application selector; keep local entity selectors in their semantic sections.");
  }
  const sections = schema.panels.controls?.sections ?? [];
  const controls = sections.flatMap((section) => Object.values(section.controls)
    .filter(isToolcraftProductSectionControl)
    .map((control) => ({ section, control })));
  // Setup and action-only sections remain runtime-owned. Mode applies to product controls.
  const productControls = controls.filter(({ section }) => section.id !== "runtime.setup");

  for (const entry of inventory) {
    for (const branch of Array.isArray(entry.finiteSelectors) ? entry.finiteSelectors : []) {
      if (branch?.role !== "branch" || !branch.productMode) continue;
      const { sharedTargets } = branch.productMode;
      // Malformed declarations are diagnosed by selector-entry validation.
      if (!Array.isArray(sharedTargets) || sharedTargets.some((target) => typeof target !== "string")) continue;
      const selected = productControls.find(({ control }) => control.target === branch.target);
      if (!selected) {
        errors.push(`Product mode "${branch.target}" must resolve to a product panel control.`);
        continue;
      }
      const { section, control } = selected;
      if (sections[0]?.id !== "runtime.defaults" || sections[1]?.id !== "runtime.setup" || sections[2]?.id !== section.id) {
        errors.push(`Product mode "${branch.target}" must be in the first product section immediately after runtime Setup.`);
      }
      if (
        section.visibleWhen || control.applicability.mode !== "always" ||
        control.disabled || control.disabledWhen || control.keyframeable !== false
      ) {
        errors.push(`Product mode "${branch.target}" must remain reachable: unconditional section, always applicability, enabled and keyframeable: false.`);
      }
      if (control.type !== "select" && control.type !== "segmented" && control.type !== "tabs") {
        errors.push(`Product mode "${branch.target}" requires a built-in select, segmented or tabs control.`);
        continue;
      }
      const options = control.options?.map((option) => option.value) ?? [];
      if (options.length < 2 || new Set(options).size !== options.length || typeof control.defaultValue !== "string" || !options.includes(control.defaultValue)) {
        errors.push(`Product mode "${branch.target}" requires at least two distinct options and a default in that domain.`);
        continue;
      }
      const shared = new Set(sharedTargets);
      const modeControls = productControls.map((item) => {
        const predicates = getToolcraftApplicabilityPredicates(item.control.applicability)
          .filter((predicate) => predicate.target === branch.target);
        return {
          ...item, predicates,
          eligible: options.filter((value) => predicates.every((predicate) => doesToolcraftPredicateMatchValue(predicate, value))),
        };
      });
      const eligibilityByTarget = new Map(modeControls.map(({ control, eligible }) => [control.target, eligible]));
      if (shared.size !== sharedTargets.length) errors.push(`Product mode "${branch.target}" repeats sharedTargets.`);
      for (const target of shared) {
        if (target === branch.target || !productControls.some(({ control }) => control.target === target)) {
          errors.push(`Product mode "${branch.target}" sharedTargets contains non-peer "${target}".`);
        }
      }
      for (const item of modeControls) {
        if (item.control.target === branch.target) continue;
        const target = item.control.target;
        const { predicates, eligible } = item;
        for (const predicate of getToolcraftApplicabilityPredicates(item.control.applicability)) {
          if (predicate.target === branch.target) continue;
          const selectorModes = eligibilityByTarget.get(predicate.target);
          if (selectorModes && eligible.some((value) => !selectorModes.includes(value))) {
            errors.push(`Product mode "${branch.target}": "${target}" depends on "${predicate.target}" outside that selector's modes.`);
          }
        }
        if (item.section.visibleWhen?.target === branch.target) {
          errors.push(`Product mode "${branch.target}" must gate "${target}" through control applicability, not section visibleWhen.`);
        }
        if (shared.has(target)) {
          if (predicates.length > 0) errors.push(`Product mode "${branch.target}" sharedTargets contradicts mode applicability on "${target}".`);
          continue;
        }
        if (predicates.length === 0) {
          errors.push(`Product mode "${branch.target}": "${target}" must declare direct mode applicability or be listed in sharedTargets.`);
          continue;
        }
        if (eligible.length === 0 || eligible.length === options.length) {
          errors.push(`Product mode "${branch.target}": "${target}" must apply to a non-empty proper subset of modes; use sharedTargets for mode-independent controls.`);
        }
      }
    }
  }
  return errors;
}
