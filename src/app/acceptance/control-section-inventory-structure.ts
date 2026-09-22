import type { ResolvedToolcraftAppSchema } from "@/toolcraft/runtime";

import {
  isLegacyToolcraftControlSectionId,
  isToolcraftProductSectionControl,
} from "./controls";
import { getToolcraftSectionLabel } from "./sections";
import type { ToolcraftControlSectionInventoryEntry } from "./types";

type InventorySchemaSection = Readonly<{
  id: string;
  label: string;
  targets: readonly string[];
}>;

function getInventoryEntryId(
  entry: ToolcraftControlSectionInventoryEntry,
): string | null {
  const id = (entry as { id?: unknown }).id;
  return typeof id === "string" ? id.trim() || null : null;
}

export function getToolcraftSectionInventoryById(
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[],
): Map<string, ToolcraftControlSectionInventoryEntry> {
  const entries: [string, ToolcraftControlSectionInventoryEntry][] = [];

  for (const entry of sectionInventory) {
    const id = getInventoryEntryId(entry);
    if (id) entries.push([id, entry]);
  }

  return new Map(entries);
}

function getInventoryEntryByTarget(
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[],
): ReadonlyMap<string, ToolcraftControlSectionInventoryEntry> {
  const entries = new Map<string, ToolcraftControlSectionInventoryEntry>();

  for (const entry of sectionInventory) {
    for (const target of entry.targets) {
      if (!entries.has(target)) entries.set(target, entry);
    }
  }

  return entries;
}

function collectInventorySchemaSections(
  schema: Pick<ResolvedToolcraftAppSchema, "panels">,
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[],
): InventorySchemaSection[] {
  const inventoryEntryByTarget = getInventoryEntryByTarget(sectionInventory);

  return (schema.panels.controls?.sections ?? []).flatMap(
    (section, sectionIndex) => {
      const targets = Object.values(section.controls)
        .filter(isToolcraftProductSectionControl)
        .map((control) => control.target);

      if (targets.length === 0) return [];
      if (section.id !== "runtime.setup") {
        return [{
          id: section.id,
          label: getToolcraftSectionLabel(section.title, sectionIndex),
          targets,
        }];
      }

      const relocatedSections = new Map<string, InventorySchemaSection>();

      for (const target of targets) {
        const inventoryEntry = inventoryEntryByTarget.get(target);
        const inventoryId = inventoryEntry
          ? getInventoryEntryId(inventoryEntry)
          : null;
        const id = inventoryId ?? section.id;
        const existing = relocatedSections.get(id);

        relocatedSections.set(id, {
          id,
          label:
            inventoryId && inventoryEntry
              ? inventoryEntry.title
              : getToolcraftSectionLabel(section.title, sectionIndex),
          targets: [...(existing?.targets ?? []), target],
        });
      }

      return [...relocatedSections.values()];
    },
  );
}

export function getToolcraftControlSectionInventoryStructureErrors(
  schema: Pick<ResolvedToolcraftAppSchema, "panels">,
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[],
): string[] {
  const errors: string[] = [];
  const schemaSections = collectInventorySchemaSections(
    schema,
    sectionInventory,
  );
  const schemaSectionIds = new Set(schemaSections.map((section) => section.id));
  const schemaTargetToSection = new Map<string, string>();

  for (const section of schemaSections) {
    for (const target of section.targets) {
      schemaTargetToSection.set(target, section.id);
    }
  }

  const inventoryIdCounts = new Map<string, number>();
  const inventoryTargetToSection = new Map<string, string>();

  for (const entry of sectionInventory) {
    const id = getInventoryEntryId(entry);
    const title = entry.title.trim();
    const entity = entry.entity?.trim() ?? "";
    const entityId = entry.entityId?.trim() ?? "";
    const groupingReason = entry.groupingReason.trim();

    if (!id) {
      errors.push(
        "Control Section Inventory contains an entry without a non-empty string stable section id.",
      );
      continue;
    }
    if (!title) {
      errors.push(
        "Control Section Inventory contains an entry without a section title.",
      );
      continue;
    }

    inventoryIdCounts.set(id, (inventoryIdCounts.get(id) ?? 0) + 1);
    if (!schemaSectionIds.has(id)) {
      errors.push(
        `Control Section Inventory id "${id}" (${title}) has no rendered product controls section.`,
      );
    }
    if (!entityId) {
      errors.push(
        `Control Section Inventory entry "${title}" must declare a non-empty stable entityId.`,
      );
    }
    if (!entity) {
      errors.push(
        `Control Section Inventory entry "${title}" must declare a human-readable entity name.`,
      );
    }
    if (groupingReason.length < 12) {
      errors.push(
        `Control Section Inventory entry "${title}" must include a concrete groupingReason explaining why these controls belong together.`,
      );
    }
    if (entry.targets.length === 0) {
      errors.push(
        `Control Section Inventory entry "${title}" must list the product control targets rendered in that section.`,
      );
    }

    for (const target of entry.targets) {
      const schemaSection = schemaTargetToSection.get(target);

      if (!schemaSection) {
        errors.push(
          `Control Section Inventory entry "${title}" lists target "${target}", but that target is not rendered by any product controls section.`,
        );
        continue;
      }
      if (schemaSection !== id) {
        errors.push(
          `Control Section Inventory entry "${title}" (${id}) lists target "${target}", but the schema renders it in section id "${schemaSection}". Update the schema grouping or the inventory.`,
        );
      }

      const existingSection = inventoryTargetToSection.get(target);
      if (existingSection && existingSection !== id) {
        errors.push(
          `Control Section Inventory lists target "${target}" in both section ids "${existingSection}" and "${id}". Each product control target belongs to exactly one section inventory entry.`,
        );
      }
      inventoryTargetToSection.set(target, id);
    }
  }

  for (const [id, count] of inventoryIdCounts) {
    if (count > 1) {
      errors.push(
        `Control Section Inventory repeats id "${id}" ${count} times. Section inventory IDs must be unique.`,
      );
    }
  }

  for (const section of schemaSections) {
    if (isLegacyToolcraftControlSectionId(section.id)) {
      errors.push(
        `Product controls section "${section.label}" must declare an explicit stable id shared with appControlSectionInventory; compatibility id "${section.id}" is runtime-only.`,
      );
    }

    const entry = sectionInventory.find(
      (candidate) => getInventoryEntryId(candidate) === section.id,
    );
    if (!entry) {
      errors.push(
        `Control Section Inventory is missing product section id "${section.id}" (${section.label}). Add the same explicit id, entityId, entity, targets, and groupingReason.`,
      );
      continue;
    }

    const inventoryTargets = new Set(entry.targets);
    for (const target of section.targets) {
      if (!inventoryTargets.has(target)) {
        errors.push(
          `Control Section Inventory entry "${section.label}" is missing rendered target "${target}". The inventory must cover every product control in the section.`,
        );
      }
    }
  }

  return errors;
}
