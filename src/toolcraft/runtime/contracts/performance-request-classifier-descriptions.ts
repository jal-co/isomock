import type {
  ToolcraftPerformanceRequestEvidenceFailureReason,
  ToolcraftPerformanceRequestReason,
} from "./performance-request-classifier-types";

export function describeToolcraftPerformanceRequestReason(
  reason:
    | ToolcraftPerformanceRequestReason
    | ToolcraftPerformanceRequestEvidenceFailureReason,
): string {
  switch (reason) {
    case "strong-direct-complaint":
      return "The request contains a high-confidence performance complaint.";
    case "software-optimization-request":
      return "The request ties optimization language to software responsiveness.";
    case "resource-pressure-complaint":
      return "The request reports excessive runtime resource use.";
    case "product-speed-command":
      return "The request changes product motion speed without reporting performance.";
    case "product-freeze-command":
      return "The request uses freeze as a product behavior command.";
    case "product-terminology-command":
      return "The request uses performance-like words as product terminology.";
    case "generic-product-command":
      return "The request is a high-confidence product implementation command without a performance signal.";
    case "negated-performance-complaint":
      return "The request locally negates a performance complaint.";
    case "needs-semantic-judgment":
      return "The request needs semantic agent judgment.";
    case "request-high-confidence-ordinary":
      return "The full Request is a high-confidence product behavior command.";
    case "evidence-too-short":
      return "Request evidence must be a nontrivial quote.";
    case "evidence-not-in-request":
      return "Request evidence is not an exact normalized substring of Request.";
    case "evidence-high-confidence-ordinary":
      return "Request evidence is a high-confidence product behavior command.";
  }
}
