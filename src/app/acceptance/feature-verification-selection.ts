import type { ResolvedToolcraftAppSchema } from "@/toolcraft/runtime";

import {
  groupToolcraftBrowserProofScenarios,
  type ToolcraftFeatureBrowserScenario,
} from "./browser-proof";
import { getControlAcceptanceTarget } from "./control-acceptance-context";
import { createToolcraftControlSelectorDependencyIndex } from "./control-selector-inventory";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlSectionInventoryEntry,
} from "./types";

export type ToolcraftFeatureVerificationSelection = Readonly<{
  acceptanceIds: readonly string[];
  scenarios: readonly ToolcraftFeatureBrowserScenario[];
  version: 2;
}>;

export type ToolcraftFeatureVerificationRequest =
  | Readonly<{
      acceptanceIds: readonly string[];
      mode: "ids";
      version: 1;
    }>
  | Readonly<{
      mode: "all";
      version: 1;
    }>;

type ToolcraftFeatureVerificationSelectionInput = Readonly<{
  acceptance: readonly ToolcraftComponentAcceptance[];
  request: ToolcraftFeatureVerificationRequest;
  schema: Pick<ResolvedToolcraftAppSchema, "panels">;
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[];
}>;

const compareCodeUnits = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function indexBrowserAcceptance(
  acceptance: readonly ToolcraftComponentAcceptance[],
): Map<string, ToolcraftComponentAcceptance> {
  const byId = new Map<string, ToolcraftComponentAcceptance>();

  for (const entry of acceptance) {
    if (entry.browser === false) continue;
    if (byId.has(entry.id)) {
      throw new Error(
        `Toolcraft feature verification found duplicate browser acceptance id "${entry.id}".`,
      );
    }
    byId.set(entry.id, entry);
  }

  return byId;
}

function getSeedIds({
  browserAcceptance,
  request,
}: {
  browserAcceptance: ReadonlyMap<string, ToolcraftComponentAcceptance>;
  request: ToolcraftFeatureVerificationRequest;
}): string[] {
  if (request.version !== 1) {
    throw new Error(
      "Toolcraft feature verification request.version must be 1.",
    );
  }
  if (request.mode === "all") return [...browserAcceptance.keys()];
  if (request.mode !== "ids") {
    throw new Error(
      "Toolcraft feature verification request must use ids or all mode.",
    );
  }
  const { acceptanceIds } = request;
  if (acceptanceIds.length === 0) {
    throw new Error("Toolcraft feature verification requires acceptance ids.");
  }
  if (new Set(acceptanceIds).size !== acceptanceIds.length) {
    const duplicate = acceptanceIds.find(
      (id, index) => acceptanceIds.indexOf(id) !== index,
    );
    throw new Error(
      `Toolcraft feature verification received duplicate acceptance id "${duplicate}".`,
    );
  }
  for (const id of acceptanceIds) {
    if (!browserAcceptance.has(id)) {
      throw new Error(
        `Toolcraft feature verification received unknown browser acceptance id "${id}".`,
      );
    }
  }
  return [...acceptanceIds];
}

function indexAcceptanceIdsByControlTarget({
  browserAcceptance,
}: {
  browserAcceptance: ReadonlyMap<string, ToolcraftComponentAcceptance>;
}): ReadonlyMap<string, ReadonlySet<string>> {
  const acceptanceIds = new Map<string, Set<string>>();

  for (const entry of browserAcceptance.values()) {
    const target = getControlAcceptanceTarget(entry);
    if (!target) continue;
    const ids = acceptanceIds.get(target) ?? new Set<string>();
    ids.add(entry.id);
    acceptanceIds.set(target, ids);
  }

  return acceptanceIds;
}

export function createToolcraftFeatureVerificationSelection(
  input: ToolcraftFeatureVerificationSelectionInput,
): ToolcraftFeatureVerificationSelection {
  const browserAcceptance = indexBrowserAcceptance(input.acceptance);
  if (browserAcceptance.size === 0) {
    throw new Error(
      "Toolcraft feature verification requires at least one browser acceptance row.",
    );
  }
  const selectedIds = new Set(
    getSeedIds({
      browserAcceptance,
      request: input.request,
    }),
  );
  const selectorDependencies =
    createToolcraftControlSelectorDependencyIndex(
      input.schema,
      input.sectionInventory,
    );
  const acceptanceIdsByTarget = indexAcceptanceIdsByControlTarget({
    browserAcceptance,
  });
  const queue = [...selectedIds];

  for (let index = 0; index < queue.length; index += 1) {
    const selected = browserAcceptance.get(queue[index]!);
    const selectedTarget = selected
      ? getControlAcceptanceTarget(selected)
      : null;
    if (!selectedTarget) continue;
    for (const dependentTarget of
      selectorDependencies.dependentsBySelector.get(selectedTarget) ?? []) {
      for (const dependentId of
        acceptanceIdsByTarget.get(dependentTarget) ?? []) {
        if (selectedIds.has(dependentId)) continue;
        selectedIds.add(dependentId);
        queue.push(dependentId);
      }
    }
  }

  const acceptanceIds = Object.freeze([...selectedIds].sort(compareCodeUnits));
  const scenarios = groupToolcraftBrowserProofScenarios(
    acceptanceIds.map((id) => browserAcceptance.get(id)!),
  );

  return Object.freeze({
    acceptanceIds,
    scenarios,
    version: 2,
  });
}
