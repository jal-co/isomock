import type { ToolcraftModelDocument } from "../canonical/model-document";
import { deriveToolcraftModelRepair } from "./model-repair-execution";
import { analyzeToolcraftModelWithoutRepairPlanning } from "./model-topology-analysis";
import type {
  ToolcraftModelRepairOperation,
  ToolcraftModelRepairPlan,
} from "./model-repair-plan";

export function applyToolcraftModelRepair(
  document: ToolcraftModelDocument,
  plan: ToolcraftModelRepairPlan,
): ToolcraftModelDocument {
  const repaired = deriveToolcraftModelRepair(document, plan);
  const proof = analyzeToolcraftModelWithoutRepairPlanning(
    repaired,
    plan.profile,
  );
  const hasUnresolvedRepair = proof.diagnostics.some(({ severity }) =>
    severity === "fatal" || severity === "repairable"
  );
  if (hasUnresolvedRepair ||
      (plan.profile === "solid-mesh" && proof.outcome !== "clean")) {
    throw new Error(`Repair plan did not prove ${plan.profile} compliance.`);
  }
  return repaired;
}

export type {
  ToolcraftModelRepairOperation,
  ToolcraftModelRepairPlan,
};
