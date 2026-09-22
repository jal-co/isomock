import type {
  ResolvedToolcraftControlSchema,
  ToolcraftControlPredicateSchema,
} from "@/toolcraft/runtime";

import { getToolcraftApplicabilitySelectorDiagnostic } from "./control-applicability";

export function getToolcraftPredicateSelectorDomainErrors(
  controlsByTarget: ReadonlyMap<string, ResolvedToolcraftControlSchema>,
  predicatesBySelector: ReadonlyMap<
    string,
    readonly ToolcraftControlPredicateSchema[]
  >,
): string[] {
  const errors: string[] = [];

  for (const [target, predicates] of predicatesBySelector) {
    const diagnostic = getToolcraftApplicabilitySelectorDiagnostic(
      target,
      controlsByTarget.get(target),
      predicates,
    );
    if (diagnostic.status !== "supported") {
      errors.push(
        `${target} is not a supported applicability selector: ${diagnostic.reason}.`,
      );
    }
  }

  return errors;
}
