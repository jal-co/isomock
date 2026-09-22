import type {
  ResolvedToolcraftAppSchema,
  ToolcraftDecisionDiagnosticSeverity,
  ToolcraftDecisionRuleId,
  ToolcraftTimelineMode,
  ToolcraftRendererPipeline,
} from "@/toolcraft/runtime";
import { getToolcraftDecisionDiagnosticSeverity } from "@/toolcraft/runtime";

import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlSectionInventoryEntry,
  ToolcraftProductReadiness,
  ToolcraftTransferMode,
  ToolcraftVisibleControl,
} from "./types";
import type { ToolcraftPersistenceCoverageResult } from "./runtime-coverage";

export type ToolcraftAcceptanceValidationContext = {
  acceptance: readonly ToolcraftComponentAcceptance[];
  controls: readonly ToolcraftVisibleControl[];
  hasVideoExportAction: boolean;
  layersEnabled: boolean;
  persistence: ToolcraftPersistenceCoverageResult;
  productReadiness: ToolcraftProductReadiness;
  rendererPipeline?: ToolcraftRendererPipeline;
  schema: ResolvedToolcraftAppSchema;
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[];
  timelineMode: ToolcraftTimelineMode | null;
  transferMode: ToolcraftTransferMode;
};

export type ToolcraftAcceptanceDiagnostic = {
  message: string;
  path: string;
  ruleId: ToolcraftDecisionRuleId;
  severity: ToolcraftDecisionDiagnosticSeverity;
};

export type ToolcraftAcceptanceValidator = {
  path: string;
  ruleId: ToolcraftDecisionRuleId;
  validate(context: ToolcraftAcceptanceValidationContext): string[];
};

export function runToolcraftAcceptanceValidators(
  context: ToolcraftAcceptanceValidationContext,
  validators: readonly ToolcraftAcceptanceValidator[],
): ToolcraftAcceptanceDiagnostic[] {
  return validators.flatMap(({ path, ruleId, validate }) =>
    validate(context).map((message) => ({
      message,
      path,
      ruleId,
      severity: getToolcraftDecisionDiagnosticSeverity(ruleId),
    })),
  );
}

export function getBlockingToolcraftAcceptanceMessages(
  diagnostics: readonly ToolcraftAcceptanceDiagnostic[],
): string[] {
  return diagnostics
    .filter(({ severity }) => severity === "error")
    .map(({ message }) => message);
}
