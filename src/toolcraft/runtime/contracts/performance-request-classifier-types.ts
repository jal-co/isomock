export type ToolcraftPerformanceIntent =
  | "ordinary-product-work"
  | "performance-iteration"
  | "needs-agent-judgment";

export type ToolcraftPerformanceRequestConfidence = "high" | "ambiguous";

export type ToolcraftPerformanceRequestReason =
  | "strong-direct-complaint"
  | "software-optimization-request"
  | "resource-pressure-complaint"
  | "product-speed-command"
  | "product-freeze-command"
  | "product-terminology-command"
  | "generic-product-command"
  | "negated-performance-complaint"
  | "needs-semantic-judgment";

export type ToolcraftPerformanceRequestClassification = Readonly<{
  confidence: ToolcraftPerformanceRequestConfidence;
  intent: ToolcraftPerformanceIntent;
  matchedClause: string | null;
  reason: ToolcraftPerformanceRequestReason;
}>;

export type ToolcraftPerformanceRequestEvidenceFailureReason =
  | "request-high-confidence-ordinary"
  | "evidence-too-short"
  | "evidence-not-in-request"
  | "evidence-high-confidence-ordinary";

export type ToolcraftPerformanceRequestEvidenceResult =
  | Readonly<{
      evidenceClassification: ToolcraftPerformanceRequestClassification;
      normalizedEvidence: string;
      normalizedRequest: string;
      reason:
        | "valid-performance-iteration-evidence"
        | "valid-agent-judgment-evidence";
      requestClassification: ToolcraftPerformanceRequestClassification;
      valid: true;
    }>
  | Readonly<{
      evidenceClassification?: ToolcraftPerformanceRequestClassification;
      normalizedEvidence: string;
      normalizedRequest: string;
      reason: ToolcraftPerformanceRequestEvidenceFailureReason;
      requestClassification?: ToolcraftPerformanceRequestClassification;
      valid: false;
    }>;
