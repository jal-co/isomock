export type ToolcraftPerformanceRequestEvidenceMatchResult =
  | Readonly<{
      normalizedEvidence: string;
      normalizedRequest: string;
      reason: "evidence-too-short" | "evidence-not-in-request";
      valid: false;
    }>
  | Readonly<{
      normalizedEvidence: string;
      normalizedRequest: string;
      valid: true;
    }>;

export declare function normalizeToolcraftPerformanceRequestText(
  value: string,
): string;

export declare function validateToolcraftPerformanceRequestEvidenceMatch(
  request: string,
  evidence: string,
): ToolcraftPerformanceRequestEvidenceMatchResult;
