import type { ToolcraftModelWorkerAnalysisSummary } from "../model-import-types";
import type { ToolcraftModelRepairPlan } from "./model-repair-plan";

export type ToolcraftModelAnalysis = ToolcraftModelWorkerAnalysisSummary & Readonly<{
  repairPlan?: ToolcraftModelRepairPlan;
}>;

export type {
  ToolcraftModelAnalysisOutcome,
  ToolcraftModelTopologyDiagnostic,
  ToolcraftModelTopologyDiagnosticCode,
  ToolcraftModelTopologySeverity,
  ToolcraftModelTopologyStatistics,
} from "../model-import-types";
