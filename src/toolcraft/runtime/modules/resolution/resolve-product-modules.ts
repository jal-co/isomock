import type { ToolcraftProductModuleId } from "../contract/capability";
import type { ToolcraftProductIntegrationPortRequirement } from "../contract/integration-port";
import {
  assertToolcraftProductModuleDefinitions,
  type ToolcraftProductModuleDefinition,
} from "../contract/module-definition";
import type { ResolvedProductModulePlan } from "../contract/module-plan";
import {
  resolveToolcraftModuleContributions,
  type ResolvedToolcraftModuleContributions,
} from "./contribution-phase/resolve-module-contributions";
import { resolveToolcraftModuleDependencies } from "./resolve-module-dependencies";

type PortApplicability =
  ToolcraftProductIntegrationPortRequirement["applicability"];

export type ResolvedToolcraftProductModules = Readonly<{
  contributionResolution: ResolvedToolcraftModuleContributions;
  plan: ResolvedProductModulePlan;
}>;

function sortedConsumers(
  consumers: ReadonlySet<ToolcraftProductModuleId>,
): ToolcraftProductModuleId[] {
  return [...consumers].sort();
}

export function resolveToolcraftModulePortRequirements(
  definitions: readonly ToolcraftProductModuleDefinition[],
): ResolvedProductModulePlan["portRequirements"] {
  assertToolcraftProductModuleDefinitions(definitions);
  const declarationsByPort = new Map<
    ToolcraftProductIntegrationPortRequirement["id"],
    Map<PortApplicability, Set<ToolcraftProductModuleId>>
  >();

  for (const definition of definitions) {
    for (const requirement of definition.portRequirements) {
      const declarationsByApplicability =
        declarationsByPort.get(requirement.id) ?? new Map();
      const consumers =
        declarationsByApplicability.get(requirement.applicability) ?? new Set();
      consumers.add(definition.id);
      declarationsByApplicability.set(requirement.applicability, consumers);
      declarationsByPort.set(requirement.id, declarationsByApplicability);
    }
  }

  const portRequirements: {
    applicability: PortApplicability;
    consumers: readonly ToolcraftProductModuleId[];
    id: ToolcraftProductIntegrationPortRequirement["id"];
  }[] = [];

  for (const [id, declarationsByApplicability] of [
    ...declarationsByPort.entries(),
  ].sort(([left], [right]) => left.localeCompare(right))) {
    const alwaysConsumers = declarationsByApplicability.get("always");
    if (
      declarationsByApplicability.size > 1 &&
      alwaysConsumers === undefined
    ) {
      const declarationFacts = [...declarationsByApplicability.entries()]
        .flatMap(([applicability, consumers]) =>
          sortedConsumers(consumers).map(
            (consumer) => `${consumer} (${applicability})`,
          ),
        )
        .sort();
      throw new Error(
        `Toolcraft integration port "${id}" has incompatible applicability declarations: ${declarationFacts.join(", ")}.`,
      );
    }

    const declaration = declarationsByApplicability.entries().next().value;
    if (declaration === undefined) continue;
    const applicability: PortApplicability = alwaysConsumers === undefined
      ? declaration[0]
      : "always";
    const consumers = alwaysConsumers === undefined
      ? declaration[1]
      : new Set(
          [...declarationsByApplicability.values()].flatMap(
            (declarationConsumers) => [...declarationConsumers],
          ),
        );
    portRequirements.push(
      Object.freeze({
        applicability,
        consumers: Object.freeze(sortedConsumers(consumers)),
        id,
      }),
    );
  }

  return Object.freeze(portRequirements);
}

export function resolveToolcraftProductModules(
  modules: readonly ToolcraftProductModuleDefinition[],
  catalog: import("../contract/module-catalog").ToolcraftModuleCatalog,
): ResolvedToolcraftProductModules {
  const dependencies = resolveToolcraftModuleDependencies(modules, catalog.defaultProviders);
  const contributions = Object.freeze(
    dependencies.definitions.flatMap(
      (definition) => definition.contributions,
    ),
  );
  const contributionResolution = resolveToolcraftModuleContributions(
    contributions, catalog.validateContribution,
  );
  const portRequirements = resolveToolcraftModulePortRequirements(
    dependencies.definitions,
  );

  const plan: ResolvedProductModulePlan = Object.freeze({
    capabilities: dependencies.capabilities,
    modules: dependencies.modules,
    ownership: contributionResolution.ownership,
    portRequirements,
  });

  return Object.freeze({ contributionResolution, plan });
}
