import type { ToolcraftProductCapabilityId } from "@/toolcraft/runtime";

import type {
  ToolcraftCapabilityProofCatalog,
  ToolcraftCapabilityProofOwnerId,
  ToolcraftCapabilityProofOwnerRegistry,
  ToolcraftCapabilityProofValidationContext,
} from "./types";

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function getSortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort(compareCodeUnits));
}

export function dispatchToolcraftCapabilityProofOwners({
  context,
  owners,
  plan,
  recipes,
}: Readonly<{
  context: ToolcraftCapabilityProofValidationContext;
  owners: ToolcraftCapabilityProofOwnerRegistry;
  plan: Readonly<{
    capabilities: readonly Readonly<{
      capabilityId: ToolcraftProductCapabilityId;
    }>[];
  }>;
  recipes: ToolcraftCapabilityProofCatalog;
}>): readonly string[] {
  const catalogRecipes = Object.entries(recipes).map(
    ([capabilityId, recipe]) => {
      if (capabilityId !== recipe.capabilityId) {
        throw new Error(
          `Toolcraft capability proof catalog key "${capabilityId}" does not match recipe capability "${recipe.capabilityId}".`,
        );
      }
      return recipe;
    },
  );
  const catalogOwnerIds = getSortedUnique(
    catalogRecipes.map(({ ownerId }) => ownerId),
  );
  const registryOwnerIds = getSortedUnique(Object.keys(owners));
  if (catalogOwnerIds.join("\n") !== registryOwnerIds.join("\n")) {
    throw new Error(
      `Toolcraft capability proof owner registry does not exactly match catalog owners. Catalog: ${catalogOwnerIds.join(", ")}; registry: ${registryOwnerIds.join(", ")}.`,
    );
  }

  const activeCapabilityIds = getSortedUnique(
    plan.capabilities.map(({ capabilityId }) => capabilityId),
  ) as readonly ToolcraftProductCapabilityId[];
  for (const capabilityId of activeCapabilityIds) {
    if (!recipes[capabilityId]) {
      throw new Error(
        `Toolcraft capability proof catalog is missing active capability "${capabilityId}".`,
      );
    }
  }

  const diagnostics = catalogOwnerIds.flatMap((untypedOwnerId) => {
    const ownerId = untypedOwnerId as ToolcraftCapabilityProofOwnerId;
    const ownerRecipes = Object.freeze(
      catalogRecipes
        .filter((recipe) => recipe.ownerId === ownerId)
        .sort((left, right) =>
          compareCodeUnits(left.capabilityId, right.capabilityId),
        ),
    );
    return owners[ownerId]({
      activeCapabilities: activeCapabilityIds,
      context,
      recipes: ownerRecipes,
    });
  });

  return Object.freeze([...diagnostics].sort(compareCodeUnits));
}
