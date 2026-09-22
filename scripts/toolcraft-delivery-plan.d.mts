import type {
  ToolcraftDeliveryCatalog,
} from "./toolcraft-delivery-catalog-validation.mjs";
import type {
  ToolcraftTargetedPerformanceComparisonHash,
  ToolcraftTargetedPerformanceReport,
} from "./toolcraft-targeted-performance-report.d.mts";
import type {
  ToolcraftPerformanceRequestAuthority,
} from "./toolcraft-performance-authority-policy.d.mts";
import type {
  ToolcraftFunctionalProofModel,
} from "./toolcraft-functional-proof-model.d.mts";

export type ToolcraftPackageManager = "npm" | "pnpm" | "yarn" | "bun";

export type ToolcraftVerificationInventoryEntry = Readonly<{
  path: string;
  sha256: string;
}>;

export type ToolcraftVerificationInventory = Readonly<{
  entries: readonly ToolcraftVerificationInventoryEntry[];
  sourceHash: string;
}>;

export type ToolcraftDeliveryLifecycleState = Readonly<{
  consumedPerformanceRequestAuthorityHashes: readonly string[];
  performanceEscalationOffered: boolean;
}>;

export type ToolcraftFunctionalProofStep =
  | Readonly<{ kind: "docs" }>
  | Readonly<{ kind: "code-health" }>
  | Readonly<{
      acceptanceIds: null;
      files: readonly string[];
      kind: "product-tests";
    }>
  | Readonly<{ kind: "build" }>
  | Readonly<{
      kind: "browser-functional";
      testNames: readonly string[];
    }>;

export type ToolcraftBrowserPerformanceProofStep = Readonly<{
  kind: "browser-performance";
  testNames: readonly string[];
  pathIds: readonly string[];
  passIds: readonly string[];
}>;

export type ToolcraftProofStep =
  | ToolcraftFunctionalProofStep
  | ToolcraftBrowserPerformanceProofStep;

export type ToolcraftDeliveryPerformanceComparison =
  | Readonly<{ kind: "none" }>
  | Readonly<{
      kind: "compatible-targeted-report";
      report: ToolcraftTargetedPerformanceReport;
      comparisonHash: ToolcraftTargetedPerformanceComparisonHash;
    }>;

export type ToolcraftInitialDeliveryBasis = Readonly<{
  kind: "initial";
}>;

export type ToolcraftPerformanceRequestBasis = Readonly<{
  initialFunctionalProofModelHash: string;
  initialSourceHash: string;
  kind: "performance-request";
}>;

export type FunctionalDeliveryPlan = Readonly<{
  basis: ToolcraftInitialDeliveryBasis;
  functionalProofModelHash: string;
  kind: "functional";
  lifecycle: ToolcraftDeliveryLifecycleState;
  sourceHash: string;
  manifestHash: string;
  steps: readonly ToolcraftFunctionalProofStep[];
}>;

export type PerformanceIterationPlan = Readonly<{
  basis: ToolcraftPerformanceRequestBasis;
  functionalProofModelHash: string;
  kind: "performance-iteration";
  lifecycle: ToolcraftDeliveryLifecycleState;
  sourceHash: string;
  manifestHash: string;
  requestAuthorityHash: string;
  performanceComparison: ToolcraftDeliveryPerformanceComparison;
  steps: readonly [
    Readonly<{ kind: "build" }>,
    ToolcraftBrowserPerformanceProofStep,
  ];
}>;

export type ToolcraftDeliveryPlan =
  | FunctionalDeliveryPlan
  | PerformanceIterationPlan;

export type ToolcraftDeliveryPlanningInputs = Readonly<{
  allProductTestFiles: readonly string[];
  authority: ToolcraftPerformanceRequestAuthority | null;
  catalog: ToolcraftDeliveryCatalog;
  currentFunctionalProofModel: ToolcraftFunctionalProofModel;
  currentInventory: ToolcraftVerificationInventory;
  initialProof: Readonly<{
    functionalProofModelHash: string;
    sourceHash: string;
  }> | null;
  integrity: Readonly<{ manifestHash: string; sourceHash: string }>;
  packageManager: ToolcraftPackageManager;
  previousLifecycle: ToolcraftDeliveryLifecycleState;
  previousPerformance:
    | Readonly<{ kind: "none" }>
    | Readonly<{
        kind: "performance-iteration-report";
        requestAuthorityHash: string;
        report: ToolcraftTargetedPerformanceReport;
        comparisonHash: ToolcraftTargetedPerformanceComparisonHash;
      }>;
}>;

export const TOOLCRAFT_DELIVERY_PLAN_VERSION: 6;

export function createToolcraftDeliveryPlan(
  inputs: ToolcraftDeliveryPlanningInputs,
): ToolcraftDeliveryPlan;

export function getToolcraftDeliveryPlanError(
  plan: unknown,
): string | undefined;

export function createToolcraftDeliveryPlanHash(
  plan: ToolcraftDeliveryPlan,
): string;

export function getToolcraftDeliveryDiagnosticTier(
  plan: ToolcraftDeliveryPlan,
): 3 | 4;
