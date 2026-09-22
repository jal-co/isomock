import type {
  ToolcraftDeliveryPlan,
  ToolcraftVerificationInventory,
  ToolcraftVerificationInventoryEntry,
} from "./toolcraft-delivery-plan.mjs";
import type {
  ToolcraftTargetedPerformanceEvidenceHash,
  ToolcraftTargetedPerformanceReport,
} from "./toolcraft-targeted-performance-report.mjs";
import type {
  ToolcraftFunctionalProofModel,
} from "./toolcraft-functional-proof-model.mjs";

export const TOOLCRAFT_DELIVERY_RECEIPT_VERSION: 8;

export type ToolcraftResolvedTestEvidence = Readonly<{
  fullTitle: string;
  leafTitle: string;
}>;

export type ToolcraftDeliveryStepEvidence =
  | Readonly<{ kind: "docs" }>
  | Readonly<{ kind: "code-health" }>
  | Readonly<{ kind: "product-tests"; files: readonly string[] }>
  | Readonly<{ kind: "build" }>
  | Readonly<{ kind: "browser-functional"; testNames: readonly string[] }>
  | Readonly<{
      kind: "browser-performance";
      passIds: readonly string[];
      pathIds: readonly string[];
      report: ToolcraftTargetedPerformanceReport;
      evidenceHash: ToolcraftTargetedPerformanceEvidenceHash;
      testEvidence: readonly ToolcraftResolvedTestEvidence[];
      testNames: readonly string[];
    }>;

export type ToolcraftDeliveryExecutionResult = Readonly<{
  evidence: readonly ToolcraftDeliveryStepEvidence[];
  finalInventory: ToolcraftVerificationInventory;
}>;

export type ToolcraftDeliveryReceipt = Readonly<{
  baselineEvidenceHash?: never;
  baselineSourceHash?: never;
  checks?: never;
  completedAt: string;
  evidence: readonly ToolcraftDeliveryStepEvidence[];
  files: readonly ToolcraftVerificationInventoryEntry[];
  functionalProofModel: ToolcraftFunctionalProofModel;
  functionalProofModelHash: string;
  kind: "delivery-verification" | "targeted-performance-verification";
  manifestHash: string;
  mode?: never;
  plan: ToolcraftDeliveryPlan;
  planHash: string;
  planVersion: 6;
  runner: "protected-delivery";
  sourceHash: string;
  status: "passed";
  version: typeof TOOLCRAFT_DELIVERY_RECEIPT_VERSION;
}>;

export function createToolcraftDeliveryReceipt(options: {
  functionalProofModel: ToolcraftFunctionalProofModel;
  plan: ToolcraftDeliveryPlan;
  result: ToolcraftDeliveryExecutionResult;
}): ToolcraftDeliveryReceipt;

export function getToolcraftDeliveryReceiptShapeError(
  receipt: unknown,
): string | undefined;

export function readToolcraftDeliveryReceipt(rootDir: string): Promise<{
  error?: string;
  missing?: boolean;
  receipt?: unknown;
}>;

export function validateToolcraftDeliveryReceipt(options: {
  rootDir: string;
}): Promise<string[]>;
