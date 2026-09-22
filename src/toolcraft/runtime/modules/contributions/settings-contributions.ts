import { registerToolcraftInternalControlSection } from "../../schema/controls-panel-section-id";
import type { ToolcraftControlSectionSchema } from "../../schema/types";
import type { ToolcraftSettingsContribution } from "../contract/control-section-contribution";
import { findShortestStableCycle } from "../graph/find-shortest-stable-cycle";

export function resolveToolcraftSettingsContributions(
  settingsContributions: readonly ToolcraftSettingsContribution[],
): readonly ToolcraftControlSectionSchema[] {
  return Object.freeze([
    ...resolveSettingsSlot(settingsContributions.filter(item => item.placement.slot === "product-settings"), "product-settings"),
    ...resolveSettingsSlot(settingsContributions.filter(item => item.placement.slot === "artifact-settings"), "artifact-settings"),
  ]);
}

function resolveSettingsSlot(settingsContributions: readonly ToolcraftSettingsContribution[], slot: ToolcraftSettingsContribution["placement"]["slot"]): readonly ToolcraftControlSectionSchema[] {
  const contributionById = new Map(
    settingsContributions.map((contribution) => [contribution.id, contribution]),
  );
  const adjacency = new Map<
    string,
    Set<string>
  >(
    settingsContributions.map((contribution) => [contribution.id, new Set()]),
  );
  for (const contribution of settingsContributions) {
    for (const peerId of contribution.placement.before) {
      if (contributionById.has(peerId)) {
        adjacency.get(contribution.id)!.add(peerId);
      }
    }
    for (const peerId of contribution.placement.after) {
      if (contributionById.has(peerId)) {
        adjacency.get(peerId)!.add(contribution.id);
      }
    }
  }

  const cycle = findShortestStableCycle(adjacency);
  if (cycle !== undefined) {
    throw new Error(
      `Toolcraft ${slot} placement cycle: ${cycle.join(" -> ")}.`,
    );
  }

  const indegree = new Map(
    settingsContributions.map((contribution) => [contribution.id, 0]),
  );
  for (const peers of adjacency.values()) {
    for (const peerId of peers) {
      indegree.set(peerId, indegree.get(peerId)! + 1);
    }
  }
  const available = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id)
    .sort();
  const orderedIds: string[] = [];
  while (available.length > 0) {
    const id = available.shift()!;
    orderedIds.push(id);
    for (const peerId of [...(adjacency.get(id) ?? [])].sort()) {
      const nextDegree = indegree.get(peerId)! - 1;
      indegree.set(peerId, nextDegree);
      if (nextDegree === 0) {
        available.push(peerId);
        available.sort();
      }
    }
  }

  return Object.freeze(
    orderedIds.map((id) => {
      const contribution = contributionById.get(id)!;
      return registerToolcraftInternalControlSection(
        Object.freeze({
          ...(contribution.section.layout ? { layout: contribution.section.layout } : {}),
          controls: contribution.section.controls,
          id: contribution.runtimeSectionId,
          layoutGroups: contribution.section.layoutGroups,
          title: contribution.section.title,
        }),
      );
    }),
  );
}
