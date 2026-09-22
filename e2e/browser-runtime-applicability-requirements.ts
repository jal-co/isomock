import type { ResolvedToolcraftAppSchema } from "@/toolcraft/runtime";

import type { ToolcraftBrowserRuntimeRequirement } from "../src/app/test-evidence/browser-runtime-contract";
import {
  getToolcraftApplicabilityRequirementId,
  getToolcraftControlApplicabilityCases,
  type ToolcraftComponentAcceptance,
  type ToolcraftControlSectionInventoryEntry,
} from "../src/app/app-acceptance";

type ApplicabilityAcceptanceSource = Pick<
  ToolcraftComponentAcceptance,
  "browser" | "id" | "target"
> & Partial<Pick<ToolcraftComponentAcceptance, "kind">>;

const layoutOnlyEvidenceTypes = new Set<
  ToolcraftBrowserRuntimeRequirement["evidenceType"]
>(["discrete-slider-layout", "segmented-control-layout"]);

export function expandToolcraftControlApplicabilityRequirements({
  entry,
  schema,
  sectionInventory,
  templates,
}: Readonly<{
  entry: ApplicabilityAcceptanceSource;
  schema?: Pick<ResolvedToolcraftAppSchema, "panels">;
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[];
  templates: readonly ToolcraftBrowserRuntimeRequirement[];
}>): ToolcraftBrowserRuntimeRequirement[] {
  if (!schema || entry.kind !== "control" || !entry.target) {
    return [...templates];
  }

  const cases = getToolcraftControlApplicabilityCases({
    schema,
    sectionInventory,
    target: entry.target,
  });

  if (cases.length === 0) {
    return [...templates];
  }

  const hasOutcomeRequirement = templates.some(
    (requirement) => !layoutOnlyEvidenceTypes.has(requirement.evidenceType),
  );

  return cases.flatMap((applicabilityCase) => {
    if (entry.browser === false) {
      throw new Error(
        `Applicability acceptance row "${entry.id}" has no browser proof.`,
      );
    }
    const visibilityRequirement = {
      evidenceType:
        applicabilityCase.expectation === "hidden"
          ? ("control-applicability-hidden" as const)
          : ("control-applicability-visible" as const),
      requirementId: getToolcraftApplicabilityRequirementId(
        entry.id,
        applicabilityCase,
      ),
      target: entry.target,
      testName: entry.browser.testName,
    };

    if (applicabilityCase.expectation === "hidden") {
      return [visibilityRequirement];
    }

    if (!hasOutcomeRequirement) {
      throw new Error(
        `Visible applicability case for ${entry.id} has no product outcome requirement.`,
      );
    }

    return [
      visibilityRequirement,
      ...templates.map((requirement) => ({
        ...requirement,
        requirementId: getToolcraftApplicabilityRequirementId(
          requirement.requirementId,
          applicabilityCase,
        ),
      })),
    ];
  });
}
