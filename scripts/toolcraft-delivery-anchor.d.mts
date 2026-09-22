import type {
  ToolcraftDeliveryLifecycleState,
  ToolcraftVerificationInventoryEntry,
} from "./toolcraft-delivery-plan.mjs";
import type {
  ToolcraftTargetedPerformanceComparisonHash,
  ToolcraftTargetedPerformanceReport,
} from "./toolcraft-targeted-performance-report.mjs";
import type {
  ToolcraftFunctionalProofModel,
} from "./toolcraft-functional-proof-model.mjs";

export type ToolcraftDeliveryAnchor = Readonly<{
  files: readonly ToolcraftVerificationInventoryEntry[];
  functionalProofModel: ToolcraftFunctionalProofModel;
  functionalProofModelHash: string;
  lifecycle: ToolcraftDeliveryLifecycleState;
  performance:
    | Readonly<{ kind: "none" }>
    | Readonly<{
        kind: "performance-iteration-report";
        report: ToolcraftTargetedPerformanceReport;
        comparisonHash: ToolcraftTargetedPerformanceComparisonHash;
        requestAuthorityHash: string;
      }>;
  sourceHash: string;
}>;

export function normalizeToolcraftDeliveryAnchor(
  receipt: unknown,
): ToolcraftDeliveryAnchor;

export function getToolcraftDeliveryAnchorShapeError(
  receipt: unknown,
): string | undefined;

export function readToolcraftDeliveryAnchor(rootDir: string): Promise<{
  anchor?: ToolcraftDeliveryAnchor;
  error?: string;
  missing?: boolean;
  receipt?: unknown;
}>;

export function validateToolcraftDeliveryAnchor(options: {
  rootDir: string;
}): Promise<string[]>;
