import { toolcraftMaskTargets } from "@/toolcraft/runtime";

import { getRequiredToolcraftControlPartCoverage } from "../control-parts";
import { hasControlPartCoverage } from "../coverage";
import type { ToolcraftComponentAcceptance } from "../types";
import type {
  ToolcraftCapabilityProofRecipe,
  ToolcraftCapabilityProofValidationContext,
} from "./types";

export const masksCapabilityProof = Object.freeze({
  capabilityId: "foreground.soft-ellipses",
  ownerId: "masks",
  proof: Object.freeze({ kind: "masks" }),
} satisfies ToolcraftCapabilityProofRecipe);

const maskTargets: ReadonlySet<string> = new Set(Object.values(toolcraftMaskTargets));

function getMaskControlProofErrors(
  context: ToolcraftCapabilityProofValidationContext,
  target: string,
  componentType: "switch" | "collectionActions",
  evidence: ToolcraftComponentAcceptance["evidence"],
): string[] {
  const label = `foreground.soft-ellipses "${target}"`;
  const controls = context.controls.filter(({ control }) => control.target === target);
  const control = controls[0]?.control;
  if (controls.length !== 1 || control?.type !== componentType) {
    return [`foreground.soft-ellipses requires the canonical "${target}" ${componentType} control.`];
  }
  const errors: string[] = [];
  if (componentType === "collectionActions" && (
    control.identityField !== "id" || control.selectionTarget !== toolcraftMaskTargets.selection
  )) {
    errors.push(`${label} requires stable mask identity and the canonical mask selection target.`);
  }

  const rows = context.acceptance.filter((entry) => entry.target === target);
  const entry = rows[0];
  if (!entry) {
    return [...errors, `foreground.soft-ellipses requires control acceptance for "${target}".`];
  }
  if (rows.length !== 1) {
    errors.push(`foreground.soft-ellipses requires exactly one control acceptance for "${target}".`);
  }
  if (entry.kind !== "control" || entry.componentType !== componentType) {
    errors.push(`${label} must use canonical ${componentType} control acceptance.`);
  }
  if (!entry.automated || !entry.automatedTestName.trim() || entry.browser === false) {
    errors.push(`${label} requires automated and browser proof.`);
  }
  if (entry.evidence !== evidence) {
    errors.push(`${label} requires ${evidence} evidence.`);
  }
  const parts = getRequiredToolcraftControlPartCoverage(control);
  if (!hasControlPartCoverage(entry.controlPartCoverage, parts)) {
    errors.push(`${label} requires controlPartCoverage for: ${parts.join(", ")}.`);
  }
  return errors;
}

/** Registers the existing protected pixel/compound recipes, never state-only mask proof. */
export function getToolcraftMasksProofErrors({
  capabilityActive,
  context,
}: Readonly<{
  capabilityActive: boolean;
  context: ToolcraftCapabilityProofValidationContext;
}>): string[] {
  if (!capabilityActive) {
    return context.acceptance.filter((entry) =>
      maskTargets.has(entry.target ?? entry.canvasHandle?.writesTarget ?? ""),
    ).map((entry) =>
      `Acceptance "${entry.id}" claims foreground.soft-ellipses proof but that capability is absent.`,
    );
  }

  const errors = [
    ...getMaskControlProofErrors(context, toolcraftMaskTargets.apply, "switch", "rendered-pixels"),
    ...getMaskControlProofErrors(context, toolcraftMaskTargets.items, "collectionActions", "rendered-pixels"),
  ];
  const guideControl = context.controls.find(({ control }) => control.target === toolcraftMaskTargets.show)?.control;
  if (guideControl && guideControl.disabled !== true) {
    errors.push(...getMaskControlProofErrors(context, toolcraftMaskTargets.show, "switch", "command-side-effect"));
  }
  return errors;
}
