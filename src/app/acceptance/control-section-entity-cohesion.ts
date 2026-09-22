import type { ToolcraftControlSectionInventoryEntry } from "./types";

const TOOLCRAFT_MIN_SPLIT_REASON_LENGTH = 12;

export function hasToolcraftInventoryEntityAgreement({
  sectionInventoryById,
  sections,
}: {
  sectionInventoryById: ReadonlyMap<
    string,
    ToolcraftControlSectionInventoryEntry
  >;
  sections: ReadonlySet<string>;
}): boolean {
  const entries = [...sections].map((sectionId) =>
    sectionInventoryById.get(sectionId),
  );
  const entityIds = entries.map((entry) => entry?.entityId?.trim() ?? "");

  return entityIds.every(Boolean) && new Set(entityIds).size === 1;
}

export function getToolcraftControlSectionEntityCohesionErrors(
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[],
): string[] {
  const errors: string[] = [];
  const entriesByEntityId = new Map<
    string,
    ToolcraftControlSectionInventoryEntry[]
  >();

  for (const entry of sectionInventory) {
    const entityId = entry.entityId?.trim() ?? "";
    const entity = entry.entity?.trim() ?? "";

    if (
      !entityId ||
      !entity ||
      (entry.id?.trim().length ?? 0) === 0 ||
      !Array.isArray(entry.targets) ||
      entry.targets.length === 0
    ) {
      continue;
    }

    const entries = entriesByEntityId.get(entityId) ?? [];
    entries.push(entry);
    entriesByEntityId.set(entityId, entries);
  }

  for (const [entityId, entries] of entriesByEntityId) {
    const entityNames = new Set(entries.map((entry) => entry.entity.trim()));

    if (entityNames.size > 1) {
      errors.push(
        `Control Section Inventory entity "${entityId}" uses inconsistent entity names: ${[
          ...entityNames,
        ].join(", ")}. Reuse one human-readable entity name for every section in the entity.`,
      );
    }

    if (entries.length === 1) {
      continue;
    }

    const sectionsByStage = new Map<string, string[]>();

    for (const entry of entries) {
      const sectionName = entry.title.trim() || entry.id;
      const workflowStage = entry.workflowStage?.trim() ?? "";
      const splitReason = entry.splitReason?.trim() ?? "";

      if (!workflowStage) {
        errors.push(
          `Control Section Inventory entity "${entityId}" section ${sectionName} must declare workflowStage because the entity is split across sections.`,
        );
      } else {
        const normalizedStage = workflowStage.toLowerCase();
        const stageSections = sectionsByStage.get(normalizedStage) ?? [];
        stageSections.push(sectionName);
        sectionsByStage.set(normalizedStage, stageSections);
      }

      if (splitReason.length < TOOLCRAFT_MIN_SPLIT_REASON_LENGTH) {
        errors.push(
          `Control Section Inventory entity "${entityId}" section ${sectionName} must declare splitReason of at least ${TOOLCRAFT_MIN_SPLIT_REASON_LENGTH} characters because the entity is split across sections.`,
        );
      }
    }

    for (const [stage, stageSections] of sectionsByStage) {
      if (stageSections.length > 1) {
        errors.push(
          `Control Section Inventory entity "${entityId}" repeats workflowStage "${stage}" across sections ${stageSections.join(", ")}. Workflow stages must be unique within one entity.`,
        );
      }
    }
  }

  return errors;
}
