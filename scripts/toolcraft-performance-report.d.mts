export const TOOLCRAFT_PERFORMANCE_REPORT_VERSION: 1;
export const TOOLCRAFT_PERFORMANCE_PROFILE_CATALOG_VERSION: 1;

export type ToolcraftPerformanceReportEnvironment = Readonly<{
  browser: Readonly<{ name: string; version: string }>;
  calibration: Readonly<{ durationMs: number; iterations: number }>;
  cpuThrottling: Readonly<{ mode: "cdp" | "none"; rate: number }>;
  evidenceType: "performance-environment";
  hardwareConcurrency: number;
  version: 1;
  viewport: Readonly<{ height: number; width: number }>;
}>;

export type ToolcraftPerformanceReportEvidence = Readonly<{
  environment: ToolcraftPerformanceReportEnvironment;
  matrixHash: string;
  measurements: readonly Readonly<Record<string, unknown>>[];
  pipelineSummaries: readonly Readonly<Record<string, unknown>>[];
  profileCatalogVersion: 1;
  reportHash: string;
}>;

export function createToolcraftPerformanceReportHash(value: unknown): string;
export function getToolcraftPerformanceReportPath(rootDir: string): string;
export function readAndValidateToolcraftPerformanceReport(options: {
  nonce: string;
  notBeforeMs: number;
  reportPath: string;
  sourceHash: string;
}): Promise<{
  evidence: ToolcraftPerformanceReportEvidence;
  report: Readonly<Record<string, unknown>>;
  reportHash: string;
}>;
