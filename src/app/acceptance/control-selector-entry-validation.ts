import type { ToolcraftControlSectionInventoryEntry } from "./types";
import { getToolcraftUserRequestEvidenceErrors } from "./user-request-evidence";

export type SelectorInventoryEntryRecord = Record<string, unknown>;

const branchKeys = ["affectedTargets", "productMode", "reason", "role", "target"] as const;
const parameterKeys = ["reason", "role", "target"] as const;

function isRecord(value: unknown): value is SelectorInventoryEntryRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getInvalidKeys(
  entry: SelectorInventoryEntryRecord,
  allowedKeys: readonly string[],
): string[] {
  const allowed = new Set(allowedKeys);
  return Object.keys(entry).filter((key) => !allowed.has(key)).sort();
}

export function getSelectorTarget(
  entry: SelectorInventoryEntryRecord,
): string | null {
  return typeof entry.target === "string" && entry.target.trim()
    ? entry.target
    : null;
}

export function getEntryFiniteSelectors(
  entry: ToolcraftControlSectionInventoryEntry,
): readonly unknown[] | null {
  const finiteSelectors = (entry as { finiteSelectors?: unknown })
    .finiteSelectors;
  return Array.isArray(finiteSelectors) ? finiteSelectors : null;
}

export function validateSelectorEntryShape(
  candidate: unknown,
  errors: string[],
  sectionId: string,
): candidate is SelectorInventoryEntryRecord {
  if (!isRecord(candidate)) {
    errors.push(
      `Control Section Inventory entry "${sectionId}" contains a non-object finite selector declaration.`,
    );
    return false;
  }

  const target = getSelectorTarget(candidate) ?? "<invalid>";
  if (candidate.role !== "branch" && candidate.role !== "parameter") {
    errors.push(
      `Selector inventory entry "${target}" must declare role "branch" or "parameter".`,
    );
    return false;
  }

  const expectedKeys = candidate.role === "branch" ? branchKeys : parameterKeys;
  const invalidKeys = getInvalidKeys(candidate, expectedKeys);
  if (invalidKeys.length > 0) {
    errors.push(
      `Selector inventory entry "${target}" with role "${candidate.role}" has invalid keys: ${invalidKeys.join(", ")}.`,
    );
  }
  if (candidate.role === "branch" && !Array.isArray(candidate.affectedTargets)) {
    errors.push(
      `Selector inventory entry "${target}" with role "branch" must declare affectedTargets as an array.`,
    );
  }
  if (typeof candidate.reason !== "string" || candidate.reason.trim().length < 12) {
    errors.push(
      `Selector inventory entry "${target}" must include a concrete reason of at least 12 characters.`,
    );
  }
  if (!getSelectorTarget(candidate)) {
    errors.push(
      `Control Section Inventory entry "${sectionId}" contains a finite selector without a non-empty target.`,
    );
  }

  if (candidate.role === "branch" && "productMode" in candidate) {
    const intent = candidate.productMode;
    if (
      !isRecord(intent) ||
      Object.keys(intent).some((key) => key !== "request" && key !== "sharedTargets") ||
      !Array.isArray(intent.sharedTargets) ||
      intent.sharedTargets.some((target) => typeof target !== "string" || !target.trim())
    ) {
      errors.push(`Product mode "${target}" requires { request, sharedTargets: string[] }.`);
      return false;
    }
    for (const error of getToolcraftUserRequestEvidenceErrors(intent.request)) {
      errors.push(`Product mode "${target}" ${error}`);
    }
  }

  return true;
}
