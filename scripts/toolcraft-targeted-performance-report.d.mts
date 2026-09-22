export type ToolcraftTargetedPerformanceMetrics = Readonly<{
  droppedFrameCount: number;
  droppedFrameRatio: number;
  durationMs: number;
  frameGapP50Ms: number;
  frameGapP95Ms: number;
  frameGapP99Ms: number;
  longTaskCount: number;
  longTaskMaxMs: number;
  maxFrameGapMs: number;
  sampleCount: number;
}>;

export type ToolcraftTargetedPerformanceMeasurement = Readonly<{
  evidenceType: "performance-measurement-metrics";
  kind: "animation-frames" | "interaction";
  metrics: ToolcraftTargetedPerformanceMetrics;
  pathId: string;
  phase: "cold" | "warm" | "sustained";
  profile: string;
  profileCatalogVersion: number;
  version: 1;
}>;

export type ToolcraftTargetedPerformanceReport = Readonly<{
  fixtureResolutionMode: "strict-development";
  fixtureSelector: "development";
  measurements: readonly ToolcraftTargetedPerformanceMeasurement[];
  nonce: string;
  performancePassIds: readonly string[];
  performancePathIds: readonly string[];
  requestAuthorityHash: string;
  sourceHash: string;
  testNames: readonly string[];
  version: 3;
}>;

export type ToolcraftTargetedResolvedTestEvidence = Readonly<{
  fullTitle: string;
  leafTitle: string;
}>;

declare const targetedPerformanceEvidenceHashBrand: unique symbol;
declare const targetedPerformanceComparisonHashBrand: unique symbol;

export type ToolcraftTargetedPerformanceEvidenceHash = string & {
  readonly [targetedPerformanceEvidenceHashBrand]: "evidence";
};

export type ToolcraftTargetedPerformanceComparisonHash = string & {
  readonly [targetedPerformanceComparisonHashBrand]: "comparison";
};

export const TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_VERSION: 3;

export function getToolcraftTargetedPerformanceReportError(
  report: unknown,
  expected?: Partial<ToolcraftTargetedPerformanceReport>,
): string | undefined;

export function createToolcraftTargetedPerformanceReport(
  value: Omit<ToolcraftTargetedPerformanceReport, "version">,
): ToolcraftTargetedPerformanceReport;

export function createToolcraftTargetedPerformanceEvidenceHash(
  options: Readonly<{
    report: ToolcraftTargetedPerformanceReport;
    testEvidence: readonly ToolcraftTargetedResolvedTestEvidence[];
  }>,
): ToolcraftTargetedPerformanceEvidenceHash;

export function createToolcraftTargetedPerformanceComparisonHash(
  report: ToolcraftTargetedPerformanceReport,
): ToolcraftTargetedPerformanceComparisonHash;

export function writeToolcraftTargetedPerformanceReport(
  filePath: string,
  value: Omit<ToolcraftTargetedPerformanceReport, "version">,
): Promise<ToolcraftTargetedPerformanceReport>;

export function writeToolcraftTargetedPerformanceReportSync(
  filePath: string,
  value: Omit<ToolcraftTargetedPerformanceReport, "version">,
): ToolcraftTargetedPerformanceReport;

export function readToolcraftTargetedPerformanceReport(
  filePath: string,
  expected?: Partial<ToolcraftTargetedPerformanceReport>,
): Promise<ToolcraftTargetedPerformanceReport>;
