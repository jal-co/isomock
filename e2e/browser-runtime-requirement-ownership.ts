import type { ToolcraftBrowserRuntimeRequirement } from "../src/app/test-evidence/browser-runtime-contract";

type BrowserRequirementOwner = Readonly<{
  browser:
    | false
    | Readonly<{
        testName: string;
      }>;
  id: string;
  renderScaleCoverage?: Readonly<{
    states: readonly string[];
  }>;
}>;

function matchesOwner(
  requirement: ToolcraftBrowserRuntimeRequirement,
  owner: BrowserRequirementOwner,
): boolean {
  return (
    owner.browser !== false &&
    requirement.testName === owner.browser.testName &&
    (requirement.requirementId === owner.id ||
      requirement.requirementId.startsWith(`${owner.id}#`))
  );
}

export function getToolcraftBrowserRequirementOwnershipErrors(
  acceptance: readonly BrowserRequirementOwner[],
  requirements: readonly ToolcraftBrowserRuntimeRequirement[],
): string[] {
  const errors: string[] = [];

  for (const owner of acceptance) {
    if (owner.browser === false) continue;
    const ownedIds = requirements
      .filter((requirement) => matchesOwner(requirement, owner))
      .map(({ requirementId }) => requirementId);
    const renderScaleStates = owner.renderScaleCoverage?.states;

    if (renderScaleStates) {
      const expectedIds = renderScaleStates.map(
        (state) => `${owner.id}#${state}`,
      );
      if (
        ownedIds.length !== expectedIds.length ||
        ownedIds.some((id, index) => id !== expectedIds[index])
      ) {
        errors.push(
          `Browser acceptance row "${owner.id}" must derive exactly ${expectedIds.join(", ")}; received ${ownedIds.join(", ") || "none"}.`,
        );
      }
      continue;
    }

    if (!ownedIds.includes(owner.id)) {
      errors.push(
        `Browser acceptance row "${owner.id}" must derive its exact base runtime requirement.`,
      );
    }
  }

  return errors;
}
