import type { ToolcraftControlSchema } from "@/toolcraft/runtime";

import type {
  ToolcraftComponentAcceptance,
  ToolcraftCustomControlCapability,
  ToolcraftCustomControlCoverage,
} from "./types";
import { builtInToolcraftControlTypeValues } from "./types";

const builtInToolcraftControlTypes = new Set<string>(
  builtInToolcraftControlTypeValues,
);

export const requiredCustomControlCoverage: readonly ToolcraftCustomControlCoverage[] = [
  "built-in-gap",
  "kit-primitives",
  "minimal-ui",
  "product-output",
  "runtime-state",
];

export function isCustomToolcraftControl(control: ToolcraftControlSchema): boolean {
  return !builtInToolcraftControlTypes.has(control.type);
}

const customControlCapabilities = new Set<ToolcraftCustomControlCapability>([
  "collection",
  "commands",
  "custom-interaction",
  "custom-value-model",
  "custom-visualization",
  "reorder",
  "selection",
]);

export function getBuiltInFitCheckErrors(
  label: string,
  entry: ToolcraftComponentAcceptance,
  control: ToolcraftControlSchema,
): string[] {
  const fitCheck = entry.builtInFitCheck;

  if (!fitCheck) {
    return [
      `${label} is a custom control and must declare builtInFitCheck with checkedBuiltIns, closestBuiltIn, whyInsufficient, and productObservable.`,
    ];
  }

  const errors: string[] = [];
  const checkedBuiltIns = Array.isArray(fitCheck.checkedBuiltIns)
    ? fitCheck.checkedBuiltIns
    : [];
  const capabilities = Array.isArray(fitCheck.capabilities)
    ? fitCheck.capabilities
    : [];

  if (capabilities.length === 0) {
    errors.push(
      `${label} builtInFitCheck.capabilities must declare the product capabilities that require custom UI; prose labels are not capability evidence.`,
    );
  }

  const unknownCapabilities = capabilities.filter(
    (capability) => !customControlCapabilities.has(capability),
  );
  if (unknownCapabilities.length > 0) {
    errors.push(
      `${label} builtInFitCheck.capabilities contains unknown capabilities: ${unknownCapabilities.join(", ")}.`,
    );
  }
  if (new Set(capabilities).size !== capabilities.length) {
    errors.push(`${label} builtInFitCheck.capabilities must not contain duplicates.`);
  }

  if (checkedBuiltIns.length === 0) {
    errors.push(
      `${label} builtInFitCheck.checkedBuiltIns must name at least one checked built-in control.`,
    );
  }

  const unknownCheckedBuiltIns = checkedBuiltIns.filter(
    (builtIn) => !builtInToolcraftControlTypes.has(builtIn),
  );

  if (unknownCheckedBuiltIns.length > 0) {
    errors.push(
      `${label} builtInFitCheck.checkedBuiltIns contains unknown built-in controls: ${unknownCheckedBuiltIns.join(", ")}.`,
    );
  }

  if (
    fitCheck.closestBuiltIn !== "none" &&
    !checkedBuiltIns.includes(fitCheck.closestBuiltIn)
  ) {
    errors.push(
      `${label} builtInFitCheck.closestBuiltIn must be one of the checked built-ins or "none".`,
    );
  }

  if (fitCheck.whyInsufficient.trim().length < 24) {
    errors.push(
      `${label} builtInFitCheck.whyInsufficient must explain why the closest built-in cannot express the product interaction.`,
    );
  }

  if (fitCheck.productObservable.trim().length < 24) {
    errors.push(
      `${label} builtInFitCheck.productObservable must name the product output or side effect that proves the custom control is necessary.`,
    );
  }

  const ownsRepeatedItems = capabilities.some((capability) =>
    ["collection", "reorder", "selection"].includes(capability),
  );

  if (ownsRepeatedItems && !checkedBuiltIns.includes("sourceCollection")) {
    errors.push(
      `${label} builtInFitCheck.checkedBuiltIns must include sourceCollection when the custom control owns a repeated runtime item set whose cardinality could be source-owned.`,
    );
  }

  if (
    ownsRepeatedItems &&
    !checkedBuiltIns.includes("collectionActions")
  ) {
    errors.push(
      `${label} builtInFitCheck.checkedBuiltIns must include collectionActions when the custom control owns a growable, removable, selectable, or reorderable runtime item set.`,
    );
  }

  if (capabilities.includes("commands") && !checkedBuiltIns.includes("actions")) {
    errors.push(
      `${label} builtInFitCheck.checkedBuiltIns must include actions when the custom control exposes local command buttons such as add, remove, delete, duplicate, sort, normalize, or clear.`,
    );
  }

  if (!capabilities.some((capability) =>
    ["custom-interaction", "custom-value-model", "custom-visualization"].includes(
      capability,
    ),
  )) {
    errors.push(
      `${label} builtInFitCheck.capabilities must include custom-interaction, custom-value-model, or custom-visualization; collection or command chrome alone is not enough to justify custom UI.`,
    );
  }

  return errors;
}
