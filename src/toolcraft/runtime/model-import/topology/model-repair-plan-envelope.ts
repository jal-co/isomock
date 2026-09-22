import type { ToolcraftModelImportLimits } from "../../schema/types";

export const TOOLCRAFT_MODEL_REPAIR_PLAN_ENVELOPE_VERSION = 1 as const;
export const TOOLCRAFT_MODEL_REPAIR_PLAN_ENVELOPE_MAX_BYTES = 64 * 1024 * 1024;

export function getToolcraftModelRepairPlanEnvelopeByteLimit(
  limits: Readonly<ToolcraftModelImportLimits>,
): number {
  return Math.floor(Math.min(
    TOOLCRAFT_MODEL_REPAIR_PLAN_ENVELOPE_MAX_BYTES,
    limits.maxEstimatedWorkerBytes,
  ));
}
