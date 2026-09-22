import type { ToolcraftProductModuleId } from "../contract/capability";
import type { ToolcraftProductIntegrationPortId } from "../contract/integration-port";
import type { ResolvedProductModulePlan } from "../contract/module-plan";

type ResolvedPortRequirement =
  ResolvedProductModulePlan["portRequirements"][number];

export type ToolcraftModulePortValidationInput = Readonly<{
  plan: ResolvedProductModulePlan;
  productSceneRequired: boolean;
  provided: ReadonlySet<ToolcraftProductIntegrationPortId>;
  spatialProductSceneRequired: boolean;
}>;

function isApplicable(
  requirement: ResolvedPortRequirement,
  productSceneRequired: boolean,
  spatialProductSceneRequired: boolean,
): boolean {
  switch (requirement.applicability) {
    case "always":
      return true;
    case "product-scene":
      return productSceneRequired;
    case "spatial-product-scene":
      return spatialProductSceneRequired;
  }
}

function sortedConsumers(
  requirements: readonly ResolvedPortRequirement[],
): ToolcraftProductModuleId[] {
  return [...new Set(requirements.flatMap(({ consumers }) => consumers))].sort();
}

function formatMissingRequirement(
  requirement: ResolvedPortRequirement,
): string {
  const productSceneReason =
    requirement.applicability === "product-scene"
      ? " because productSceneRequired is true"
      : requirement.applicability === "spatial-product-scene"
        ? " because spatialProductSceneRequired is true"
        : "";
  return `Toolcraft integration port "${requirement.id}" is missing; applicability "${requirement.applicability}" requires it${productSceneReason} for consumers: ${requirement.consumers.join(", ")}. Expected public field "ports.${requirement.id}".`;
}

export function getToolcraftModulePortErrors({
  plan,
  productSceneRequired,
  provided,
  spatialProductSceneRequired,
}: ToolcraftModulePortValidationInput): readonly string[] {
  const errors: string[] = [];

  const requirementsByPort = new Map<
    ToolcraftProductIntegrationPortId,
    ResolvedPortRequirement[]
  >();
  for (const requirement of plan.portRequirements) {
    const requirements = requirementsByPort.get(requirement.id) ?? [];
    requirements.push(requirement);
    requirementsByPort.set(requirement.id, requirements);

    if (
      isApplicable(
        requirement,
        productSceneRequired,
        spatialProductSceneRequired,
      ) &&
      !provided.has(requirement.id)
    ) {
      errors.push(formatMissingRequirement(requirement));
    }
  }

  for (const id of [...provided].sort()) {
    const requirements = requirementsByPort.get(id);
    if (requirements === undefined) {
      if (id === "scene.canvasContent") continue;
      errors.push(
        `Toolcraft integration port "${id}" is provided but unused; no resolved module consumes it. Public field "ports.${id}" is not applicable.`,
      );
      continue;
    }
    if (
      !requirements.some((requirement) =>
        isApplicable(
          requirement,
          productSceneRequired,
          spatialProductSceneRequired,
        ),
      )
    ) {
      if (id === "scene.canvasContent") continue;
      const firstRequirement = requirements[0];
      if (firstRequirement === undefined) {
        throw new Error(
          `Toolcraft integration port "${id}" has an empty resolved requirement set.`,
        );
      }
      const applicability = firstRequirement.applicability;
      const fact = applicability === "spatial-product-scene"
        ? "spatialProductSceneRequired"
        : "productSceneRequired";
      errors.push(
        `Toolcraft integration port "${id}" is provided but unused; applicability "${applicability}" is inapplicable because ${fact} is false for known consumers: ${sortedConsumers(requirements).join(", ")}. Public field "ports.${id}" is not applicable.`,
      );
    }
  }

  return Object.freeze(errors.sort());
}
