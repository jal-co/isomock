import { getCatalogProvider, validateContractVersion, type MissingRequirement } from "./dependency-validation";
import type { ToolcraftModuleDefinition } from "../contract/module-definition";
import type { ToolcraftModuleRecord } from "../contract/module-protocol";
import {
  assertToolcraftProductModuleDefinitions,
} from "../contract/module-definition";
import type {
  ResolvedModuleOrigin,
} from "../contract/module-plan";
import { findShortestStableCycle } from "../graph/find-shortest-stable-cycle";
type WorkingModule = Readonly<{
  definition: ToolcraftModuleDefinition;
  origin: ResolvedModuleOrigin;
}>;
export type ResolvedToolcraftModuleDependencies<Definition extends ToolcraftModuleRecord = ToolcraftModuleRecord> = Readonly<{
  capabilities: readonly Readonly<{ capabilityId: Definition["provides"][number]; moduleId: Definition["id"] }>[];
  definitions: readonly ToolcraftModuleDefinition<Definition>[];
  modules: readonly Readonly<{
    id: Definition["id"];
    origin: ResolvedModuleOrigin;
    provides: readonly Definition["provides"][number][];
    requires: readonly Definition["requires"][number][];
    requestedBy: readonly Definition["id"][];
  }>[];
}>;
function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}

function indexCapabilityProviders(
  workingModules: ReadonlyMap<string, WorkingModule>,
) {
  const providers = new Map<
    string,
    Set<string>
  >();
  for (const id of [...workingModules.keys()].sort()) {
    const definition = workingModules.get(id)!.definition;
    for (const capabilityId of sortedUnique(definition.provides)) {
      const moduleIds = providers.get(capabilityId) ?? new Set();
      moduleIds.add(id);
      providers.set(capabilityId, moduleIds);
    }
  }
  return new Map(
    [...providers.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([capabilityId, moduleIds]) => [
        capabilityId,
        sortedUnique([...moduleIds]),
      ]),
  );
}
function rejectProviderConflicts(
  providers: ReadonlyMap<
    string,
    readonly string[]
  >,
) {
  for (const [capabilityId, moduleIds] of providers) {
    if (moduleIds.length > 1) {
      throw new Error(
        `Toolcraft capability "${capabilityId}" has multiple providers: ${moduleIds.join(", ")}.`,
      );
    }
  }
}
function compareRequirementPaths(
  left: readonly string[],
  right: readonly string[],
) {
  if (left.length !== right.length) {
    return left.length - right.length;
  }
  return left.join("\u0000").localeCompare(right.join("\u0000"));
}
export function resolveToolcraftModuleDependencies<Definition extends ToolcraftModuleRecord>(
  definitions: readonly ToolcraftModuleDefinition<Definition>[],
  catalog: readonly Readonly<{ capabilityId: Definition["provides"][number]; definition: ToolcraftModuleDefinition<Definition>; id: string }>[],
): ResolvedToolcraftModuleDependencies<Definition> {
  const explicitDefinitions = [...definitions].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const duplicateDefinition = explicitDefinitions.find(
    (definition, index, candidates) =>
      definition.id === candidates[index - 1]?.id,
  );
  if (duplicateDefinition !== undefined) {
    throw new Error(
      `Toolcraft product module id "${duplicateDefinition.id}" is declared more than once.`,
    );
  }
  explicitDefinitions.forEach(validateContractVersion);
  assertToolcraftProductModuleDefinitions(explicitDefinitions);
  const workingModules = new Map<string, WorkingModule>(
    explicitDefinitions.map((definition) => [
      definition.id,
      { definition, origin: "explicit" },
    ]),
  );
  const requirementPathByModule = new Map<
    string,
    readonly string[]
  >(
    explicitDefinitions.map((definition) => [definition.id, [definition.id]]),
  );
  while (true) {
    const providers = indexCapabilityProviders(workingModules);
    rejectProviderConflicts(providers);

    const unresolved: MissingRequirement[] = [];
    const insertions = new Map<
      string,
      Readonly<{
        definition: ToolcraftModuleDefinition;
        path: readonly string[];
      }>
    >();
    for (const moduleId of [...workingModules.keys()].sort()) {
      const definition = workingModules.get(moduleId)!.definition;
      for (const capabilityId of sortedUnique(definition.requires)) {
        if ((providers.get(capabilityId)?.length ?? 0) === 1) {
          continue;
        }
        const requirement: MissingRequirement = {
          capabilityId,
          moduleId,
          path: [
            ...(requirementPathByModule.get(moduleId) ?? [moduleId]),
            capabilityId,
          ],
        };
        const providerIds = sortedUnique(
          definition.defaultProviders
            .filter((provider) => provider.capabilityId === capabilityId)
            .map((provider) => provider.providerId),
        );
        if (providerIds.length > 1) {
          throw new Error(
            `Module "${moduleId}" declares multiple default providers for "${capabilityId}": ${providerIds.join(", ")} along requirement path ${requirement.path.join(" -> ")}.`,
          );
        }
        const providerId = providerIds[0];
        if (providerId === undefined) {
          unresolved.push(requirement);
          continue;
        }
        const providerDefinition = getCatalogProvider(providerId, requirement, catalog);
        const occupiedModule = workingModules.get(providerDefinition.id);
        if (occupiedModule !== undefined) {
          throw new Error(
            `Toolcraft default provider "${providerId}" cannot insert module "${providerDefinition.id}" because that id is already occupied by an ${occupiedModule.origin} module along requirement path ${requirement.path.join(" -> ")}.`,
          );
        }
        const insertionPath = [...requirement.path, providerDefinition.id];
        const previous = insertions.get(providerDefinition.id);
        if (previous !== undefined && previous.definition !== providerDefinition) {
          throw new Error(
            `Conflicting default definitions for module "${providerDefinition.id}" along requirement paths ${previous.path.join(" -> ")} and ${insertionPath.join(" -> ")}.`,
          );
        }
        if (
          previous === undefined ||
          compareRequirementPaths(insertionPath, previous.path) < 0
        ) {
          insertions.set(providerDefinition.id, {
            definition: providerDefinition,
            path: insertionPath,
          });
        }
      }
    }
    if (insertions.size > 0) {
      for (const [id, insertion] of [...insertions.entries()].sort(
        ([left], [right]) => left.localeCompare(right),
      )) {
        workingModules.set(id, {
          definition: insertion.definition,
          origin: "default-provider",
        });
        requirementPathByModule.set(id, insertion.path);
      }
      continue;
    }
    if (unresolved.length > 0) {
      unresolved.sort((left, right) =>
        compareRequirementPaths(left.path, right.path),
      );
      const missing = unresolved[0]!;
      throw new Error(
        `Toolcraft capability "${missing.capabilityId}" is missing along requirement path ${missing.path.join(" -> ")}; module "${missing.moduleId}" declares no default provider for it.`,
      );
    }
    break;
  }
  const providers = indexCapabilityProviders(workingModules);
  rejectProviderConflicts(providers);
  const requestedBy = new Map<
    string,
    Set<string>
  >();
  const adjacency = new Map<
    string,
    readonly string[]
  >();
  for (const moduleId of [...workingModules.keys()].sort()) {
    const definition = workingModules.get(moduleId)!.definition;
    const dependencies = new Set<string>();
    for (const capabilityId of sortedUnique(definition.requires)) {
      const providerId = providers.get(capabilityId)![0]!;
      dependencies.add(providerId);
      if (workingModules.get(providerId)!.origin === "default-provider") {
        const requesters = requestedBy.get(providerId) ?? new Set();
        requesters.add(moduleId);
        requestedBy.set(providerId, requesters);
      }
    }
    adjacency.set(moduleId, sortedUnique([...dependencies]));
  }
  const cycle = findShortestStableCycle(adjacency);
  if (cycle !== undefined) {
    throw new Error(
      `Toolcraft module dependency cycle: ${cycle.join(" -> ")}.`,
    );
  }
  const sortedModuleIds = [...workingModules.keys()].sort();
  const resolvedDefinitions = Object.freeze(
    sortedModuleIds.map((id) => workingModules.get(id)!.definition),
  );
  const modules = Object.freeze(
    sortedModuleIds.map((id) => {
      const workingModule = workingModules.get(id)!;
      return Object.freeze({
        id,
        origin: workingModule.origin,
        provides: Object.freeze(sortedUnique(workingModule.definition.provides)),
        requestedBy: Object.freeze(
          sortedUnique([...(requestedBy.get(id) ?? [])]),
        ),
        requires: Object.freeze(sortedUnique(workingModule.definition.requires)),
      });
    }),
  );
  const capabilities = Object.freeze(
    [...providers.entries()].map(([capabilityId, moduleIds]) =>
      Object.freeze({ capabilityId, moduleId: moduleIds[0]! }),
    ),
  );
  return Object.freeze({
    capabilities,
    definitions: resolvedDefinitions,
    modules,
  }) as ResolvedToolcraftModuleDependencies<Definition>;
}
