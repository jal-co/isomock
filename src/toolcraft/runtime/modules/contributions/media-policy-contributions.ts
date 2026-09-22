import type { ToolcraftMediaPolicyModuleContribution } from "../contract/contribution";

export type ResolvedToolcraftMediaPolicy = Readonly<
  Pick<ToolcraftMediaPolicyModuleContribution, "policy" | "sourceKinds">
>;

export function resolveToolcraftMediaPolicyContributions(
  contributions: readonly ToolcraftMediaPolicyModuleContribution[],
): ResolvedToolcraftMediaPolicy | undefined {
  const contribution = contributions[0];
  if (contribution === undefined) {
    return undefined;
  }
  if (contributions.length > 1) {
    throw new Error(
      "Toolcraft media-policy materialization received multiple source-workflow owners.",
    );
  }

  return Object.freeze({
    policy: contribution.policy,
    sourceKinds: contribution.sourceKinds,
  });
}
