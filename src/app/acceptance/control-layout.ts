import type { ResolvedToolcraftAppSchema } from "@/toolcraft/runtime";

import { getToolcraftControlDependencyGroupingErrors } from "./control-layout-dependency-rules";
import { getToolcraftControlEntityGroupingErrors } from "./control-layout-entity-rules";
import { buildToolcraftControlLayoutFacts } from "./control-layout-model";
import {
  getToolcraftControlLayoutSectionHeuristicErrors,
  getToolcraftControlLayoutSectionInvariantErrors,
} from "./control-layout-section-rules";
import type { ToolcraftControlSectionInventoryEntry } from "./types";
import { getToolcraftProductModeTargets } from "./product-mode-intent";

export function getToolcraftControlSectionInvariantErrors(
  schema: ResolvedToolcraftAppSchema,
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[] = [],
): string[] {
  const facts = buildToolcraftControlLayoutFacts(schema, getToolcraftProductModeTargets(sectionInventory));

  return [
    ...getToolcraftControlLayoutSectionInvariantErrors(facts),
    ...getToolcraftControlDependencyGroupingErrors(facts, sectionInventory),
    ...getToolcraftControlEntityGroupingErrors({ facts, sectionInventory }),
  ];
}

export function getToolcraftControlSectionHeuristicErrors(
  schema: ResolvedToolcraftAppSchema,
): string[] {
  return getToolcraftControlLayoutSectionHeuristicErrors(
    buildToolcraftControlLayoutFacts(schema),
  );
}
