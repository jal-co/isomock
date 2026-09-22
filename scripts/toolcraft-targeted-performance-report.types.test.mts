import {
  createToolcraftTargetedPerformanceComparisonHash,
  createToolcraftTargetedPerformanceEvidenceHash,
  type ToolcraftTargetedPerformanceComparisonHash,
  type ToolcraftTargetedPerformanceEvidenceHash,
  type ToolcraftTargetedPerformanceReport,
} from "./toolcraft-targeted-performance-report.mjs";

const report: ToolcraftTargetedPerformanceReport = {
  fixtureResolutionMode: "strict-development",
  fixtureSelector: "development",
  measurements: ["cold", "warm", "sustained"].map((phase) => ({
    evidenceType: "performance-measurement-metrics" as const,
    kind: "interaction" as const,
    metrics: {
      droppedFrameCount: 0,
      droppedFrameRatio: 0,
      durationMs: 10,
      frameGapP50Ms: 10,
      frameGapP95Ms: 16,
      frameGapP99Ms: 16,
      longTaskCount: 0,
      longTaskMaxMs: 0,
      maxFrameGapMs: 16,
      sampleCount: 3,
    },
    pathId: "performance-path:composite",
    phase: phase as "cold" | "warm" | "sustained",
    profile: "interactive-discrete",
    profileCatalogVersion: 1,
    version: 1 as const,
  })),
  nonce: "runner-nonce",
  performancePassIds: ["composite"],
  performancePathIds: ["performance-path:composite"],
  requestAuthorityHash: "b".repeat(64),
  sourceHash: "a".repeat(64),
  testNames: ["browser perf: focused renderer path"],
  version: 3,
};
const testEvidence = [
  {
    fullTitle: "app-controls.spec.ts › browser perf: focused renderer path",
    leafTitle: "browser perf: focused renderer path",
  },
];
const evidenceHash: ToolcraftTargetedPerformanceEvidenceHash =
  createToolcraftTargetedPerformanceEvidenceHash({ report, testEvidence });
const comparisonHash: ToolcraftTargetedPerformanceComparisonHash =
  createToolcraftTargetedPerformanceComparisonHash(report);
const acceptEvidenceHash = (
  _value: ToolcraftTargetedPerformanceEvidenceHash,
) => {};
const acceptComparisonHash = (
  _value: ToolcraftTargetedPerformanceComparisonHash,
) => {};
acceptEvidenceHash(evidenceHash);
acceptComparisonHash(comparisonHash);
// @ts-expect-error Comparison hashes cannot cross the evidence boundary.
acceptEvidenceHash(comparisonHash);
// @ts-expect-error Evidence hashes cannot cross the comparison boundary.
acceptComparisonHash(evidenceHash);
// @ts-expect-error Evidence hash identity requires canonical evidence.
createToolcraftTargetedPerformanceEvidenceHash({ report });
createToolcraftTargetedPerformanceEvidenceHash({
  report,
  // @ts-expect-error Title-only evidence is unsupported.
  testTitles: ["app-controls.spec.ts › browser perf: focused renderer path"],
});

void [evidenceHash, comparisonHash];
