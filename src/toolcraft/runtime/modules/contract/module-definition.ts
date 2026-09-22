import { snapshotToolcraftModuleData } from "./module-data";
import type { ToolcraftModuleRecord } from "./module-protocol";
import {
  TOOLCRAFT_PRODUCT_MODULE_CONTRACT_VERSION,
  type ToolcraftDefaultProvider,
  type ToolcraftProductCapabilityId,
  type ToolcraftProductModuleId,
} from "./capability";
import type { ToolcraftProductModuleContribution } from "./contribution";
import type { ToolcraftProductIntegrationPortRequirement } from "./integration-port";
import type { ToolcraftContributionValidator } from "./validate-module-contribution";
import { normalizeToolcraftProductModuleContribution } from "./normalize-module-contribution";

const toolcraftProductModuleDefinitionBrand: unique symbol = Symbol(
  "ToolcraftProductModuleDefinition",
);
const registeredToolcraftProductModuleDefinitions = new WeakSet<object>();

declare class ToolcraftProductModuleDefinitionIdentity {
  private opaqueDefinition(): void;
}

export type ToolcraftProductModuleRecord = {
  readonly contractVersion: number;
  readonly contributions: readonly ToolcraftProductModuleContribution[];
  readonly defaultProviders: readonly ToolcraftDefaultProvider[];
  readonly id: ToolcraftProductModuleId;
  readonly portRequirements: readonly ToolcraftProductIntegrationPortRequirement[];
  readonly provides: readonly ToolcraftProductCapabilityId[];
  readonly requires: readonly ToolcraftProductCapabilityId[];
};

export type ToolcraftModuleDefinition<Record extends ToolcraftModuleRecord = ToolcraftModuleRecord> = Record &
  ToolcraftProductModuleDefinitionIdentity & {
    readonly [toolcraftProductModuleDefinitionBrand]: true;
  };

export type ToolcraftProductModuleDefinition = ToolcraftModuleDefinition<ToolcraftProductModuleRecord>;

function assertContributionOwnership(
  moduleId: string,
  contributions: ToolcraftModuleRecord["contributions"],
): void {
  for (const contribution of contributions) {
    if (contribution.moduleId !== moduleId) {
      throw new Error(
        `Toolcraft product module "${moduleId}" cannot include contribution "${contribution.id}" owned by "${contribution.moduleId}".`,
      );
    }
  }
}

export function createToolcraftModuleDefinition<Record extends ToolcraftModuleRecord>(
  input: Omit<Record, "contractVersion">,
  normalizeContribution: (contribution: Record["contributions"][number]) => Record["contributions"][number],
): ToolcraftModuleDefinition<Record> {
  const record = snapshotToolcraftModuleData(input);
  assertContributionOwnership(record.id, record.contributions);
  const contributions = Object.freeze(
    record.contributions.map(contribution => snapshotToolcraftModuleData(normalizeContribution(contribution))),
  );

  assertContributionOwnership(record.id, contributions);
  const definition = {
    [toolcraftProductModuleDefinitionBrand]: true,
    contractVersion: TOOLCRAFT_PRODUCT_MODULE_CONTRACT_VERSION,
    contributions,
    defaultProviders: Object.freeze(
      record.defaultProviders.map((provider) =>
        Object.freeze({
          capabilityId: provider.capabilityId,
          providerId: provider.providerId,
        }),
      ),
    ),
    id: record.id,
    portRequirements: Object.freeze(
      record.portRequirements.map((requirement) =>
        Object.freeze({
          applicability: requirement.applicability,
          id: requirement.id,
        }),
      ),
    ),
    provides: Object.freeze([...record.provides]),
    requires: Object.freeze([...record.requires]),
  } as ToolcraftModuleDefinition<Record>;

  const frozenDefinition = Object.freeze(
    definition,
  ) as ToolcraftModuleDefinition<Record>;
  registeredToolcraftProductModuleDefinitions.add(frozenDefinition);
  return frozenDefinition;
}

export function createBuiltInToolcraftProductModuleDefinition(
  record: Omit<ToolcraftProductModuleRecord, "contractVersion">,
  validateContribution: ToolcraftContributionValidator,
): ToolcraftProductModuleDefinition {
  return createToolcraftModuleDefinition<ToolcraftProductModuleRecord>(record,
    contribution => normalizeToolcraftProductModuleContribution(contribution, validateContribution));
}

export function assertToolcraftProductModuleDefinition(
  record: ToolcraftModuleRecord,
): asserts record is ToolcraftModuleDefinition {
  if (!registeredToolcraftProductModuleDefinitions.has(record)) {
    throw new Error(
      `Toolcraft product module "${record.id}" is not an opaque definition created by a Toolcraft module factory; pass the factory result without copying or mutation.`,
    );
  }
}

export function assertToolcraftProductModuleDefinitions(
  records: readonly ToolcraftModuleRecord[],
): asserts records is readonly ToolcraftModuleDefinition[] {
  for (const record of records) {
    assertToolcraftProductModuleDefinition(record);
  }
}
