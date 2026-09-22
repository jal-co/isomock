import type { ToolcraftProductModuleContribution } from "./contribution";

export type ToolcraftContributionValidator<Contribution = ToolcraftProductModuleContribution> =
  (contribution: Contribution) => Contribution;

export function validateToolcraftProductModuleContribution<Contribution>(
  contribution: Contribution,
  validate: ToolcraftContributionValidator<Contribution>,
): Contribution {
  if (typeof contribution !== "object" || contribution === null) {
    throw new Error("Invalid Toolcraft module contribution: expected a contribution record.");
  }
  return validate(contribution);
}
