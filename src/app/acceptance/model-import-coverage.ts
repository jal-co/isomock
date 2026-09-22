import type {
  ToolcraftComponentAcceptance,
  ToolcraftVisibleControl,
} from "./types";
import { getControlAcceptanceByTarget } from "./control-acceptance-context";

export type ToolcraftModelImportCoverage =
  | "advertised-format-import"
  | "appearance-preservation"
  | "clean-commit"
  | "deterministic-root-selection"
  | "export-output"
  | "fallback-appearance"
  | "fatal-rejection"
  | "history-reset"
  | "package-extraction"
  | "persistence-restore"
  | "pixel-output"
  | "presentation-consumer-readiness"
  | "preview-output"
  | "repair-action"
  | "repair-progress"
  | "repairable-diagnosis"
  | "resource-unavailable"
  | "staged-preview"
  | "verified-repair";

export const TOOLCRAFT_REQUIRED_MODEL_IMPORT_COVERAGE = [
  "advertised-format-import",
  "staged-preview",
  "clean-commit",
  "package-extraction",
  "deterministic-root-selection",
  "appearance-preservation",
  "fallback-appearance",
  "presentation-consumer-readiness",
  "pixel-output",
  "repairable-diagnosis",
  "repair-action",
  "repair-progress",
  "verified-repair",
  "fatal-rejection",
  "persistence-restore",
  "resource-unavailable",
  "preview-output",
  "export-output",
  "history-reset",
] as const satisfies readonly ToolcraftModelImportCoverage[];

export function hasAllToolcraftModelImportCoverage(
  coverage: ToolcraftComponentAcceptance["modelImportCoverage"],
): boolean {
  return (
    coverage === "all-required-model-import-behavior" ||
    (Array.isArray(coverage) &&
      TOOLCRAFT_REQUIRED_MODEL_IMPORT_COVERAGE.every((item) =>
        coverage.includes(item),
      ))
  );
}

export function getToolcraftModelImportCoverageErrors({
  entry,
  label,
}: Readonly<{
  entry: ToolcraftComponentAcceptance;
  label: string;
}>): string[] {
  return hasAllToolcraftModelImportCoverage(entry.modelImportCoverage)
    ? []
    : [
        `${label} model fileDrop acceptance must declare modelImportCoverage for: ${TOOLCRAFT_REQUIRED_MODEL_IMPORT_COVERAGE.join(", ")}.`,
      ];
}

export function getToolcraftModel3dProofErrors({
  acceptance,
  capabilityActive,
  controls,
}: Readonly<{
  acceptance: readonly ToolcraftComponentAcceptance[];
  capabilityActive: boolean;
  controls: readonly ToolcraftVisibleControl[];
}>): string[] {
  if (!capabilityActive) {
    return acceptance.flatMap((entry) =>
      entry.modelImportCoverage === undefined
        ? []
        : [
            `Acceptance "${entry.id}" claims model.3d proof but that capability is absent.`,
          ],
    );
  }

  const modelControls = controls.filter(
    ({ control }) =>
      control.type === "fileDrop" && control.assetKind === "model",
  );
  if (modelControls.length === 0) {
    return [
      "model.3d requires a model fileDrop acceptance row with complete model import coverage.",
    ];
  }
  const controlAcceptance = getControlAcceptanceByTarget(
    acceptance.filter((entry) => entry.kind === "control"),
  );

  return modelControls.flatMap(({ control, controlId, sectionTitle }) => {
    const label = `${sectionTitle ? `${sectionTitle} / ` : ""}${controlId} (${control.target})`;
    const entry = controlAcceptance.get(control.target);

    return entry
      ? getToolcraftModelImportCoverageErrors({ entry, label })
      : [`${label} is missing model.3d acceptance proof.`];
  });
}
