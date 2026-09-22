import type { ToolcraftPerformanceReportEvidence } from "./toolcraft-performance-report.mjs";

export const TOOLCRAFT_PERFORMANCE_RECEIPT_VERSION: 5;

export type ToolcraftVerificationFileEntry = Readonly<{
  path: string;
  sha256: string;
}>;

export type ToolcraftPerformanceCheckpointReceipt = Readonly<{
  completedAt: string;
  files: readonly ToolcraftVerificationFileEntry[];
  kind: "performance-checkpoint";
  performanceEvidence: ToolcraftPerformanceReportEvidence;
  runner: "protected-playwright";
  sourceHash: string;
  status: "passed";
  version: typeof TOOLCRAFT_PERFORMANCE_RECEIPT_VERSION;
}>;

export function validateToolcraftPerformanceReceipt(options: {
  rootDir: string;
}): Promise<string[]>;

export function assertToolcraftVerificationInputsUnchanged(options: {
  baseline: { sourceHash: string };
  current: { sourceHash: string };
  phase: string;
}): void;

export function collectToolcraftVerificationInputs(rootDir: string): Promise<{
  entries: readonly ToolcraftVerificationFileEntry[];
  sourceHash: string;
}>;

export function readToolcraftDurablePerformanceBaseline(
  rootDir: string,
): Promise<{
  error?: string;
  missing?: boolean;
  receipt?: ToolcraftPerformanceCheckpointReceipt;
}>;

export function validateToolcraftVerificationReceipt(options: {
  rootDir: string;
}): Promise<string[]>;
