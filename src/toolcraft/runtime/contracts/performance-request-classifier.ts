import {
  englishRuntimeSubject,
  explicitComplaintRules,
  matchPerformanceRequestRule,
  negatedComplaintSpanPatterns,
  productCommandRules,
  russianRuntimeSubject,
} from "./performance-request-classifier-rules";
import {
  normalizeToolcraftPerformanceRequestText,
  validateToolcraftPerformanceRequestEvidenceMatch,
} from "./performance-request-evidence-policy.mjs";
import type {
  ToolcraftPerformanceRequestClassification,
  ToolcraftPerformanceRequestEvidenceResult,
} from "./performance-request-classifier-types";

export { describeToolcraftPerformanceRequestReason } from "./performance-request-classifier-descriptions";
export type {
  ToolcraftPerformanceIntent,
  ToolcraftPerformanceRequestClassification,
  ToolcraftPerformanceRequestConfidence,
  ToolcraftPerformanceRequestEvidenceFailureReason,
  ToolcraftPerformanceRequestEvidenceResult,
  ToolcraftPerformanceRequestReason,
} from "./performance-request-classifier-types";

export { normalizeToolcraftPerformanceRequestText };

function splitRequestClauses(value: string): readonly string[] {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .replace(/\s*,?\s*(?:but|however|yet|но|однако)\s+/giu, ". ")
    .replace(
      /,\s+(?=(?:it|(?:the\s+)?(?:app|application|editor|ui|browser|canvas|preview|interaction|dragging)|(?:приложение|редактор|интерфейс|браузер|канвас|превью))(?:\s|$))/giu,
      ". ",
    )
    .split(/[.!?;\n]+/gu)
    .map(normalizeToolcraftPerformanceRequestText)
    .filter(Boolean);
}

function stripNegatedComplaintSpans(value: string): Readonly<{
  hadNegatedComplaint: boolean;
  remainder: string;
}> {
  let hadNegatedComplaint = false;
  let remainder = value;

  for (const pattern of negatedComplaintSpanPatterns) {
    remainder = remainder.replace(pattern, () => {
      hadNegatedComplaint = true;
      return " ";
    });
  }

  return {
    hadNegatedComplaint,
    remainder: normalizeToolcraftPerformanceRequestText(remainder),
  };
}

function stripNegatedClauseStructure(value: string): string {
  return normalizeToolcraftPerformanceRequestText(
    value
      .replace(/[,()[\]{}:]+/gu, " ")
      .replace(/\b(?:and|or)\b/giu, " ")
      .replace(/(?:^|\s)(?:и|или)(?=\s|$)/giu, " ")
      .replace(
        new RegExp(
          `(?:^|\\s)(?:the\\s+)?${englishRuntimeSubject}(?:\\s|$)`,
          "giu",
        ),
        " ",
      )
      .replace(
        new RegExp(`(?:^|\\s)${russianRuntimeSubject}(?:\\s|$)`, "giu"),
        " ",
      ),
  );
}

function classifyClause(clause: string): ToolcraftPerformanceRequestClassification {
  const normalizedClause = normalizeToolcraftPerformanceRequestText(
    clause.toLocaleLowerCase(),
  );
  const { hadNegatedComplaint, remainder } =
    stripNegatedComplaintSpans(normalizedClause);
  const explicitReason = matchPerformanceRequestRule(
    remainder,
    explicitComplaintRules,
  );

  if (explicitReason) {
    return {
      confidence: "high",
      intent: "performance-iteration",
      matchedClause: clause,
      reason: explicitReason,
    };
  }

  const productReason = matchPerformanceRequestRule(
    remainder,
    productCommandRules,
  );
  if (productReason) {
    return {
      confidence: "high",
      intent: "ordinary-product-work",
      matchedClause: clause,
      reason: productReason,
    };
  }

  if (
    hadNegatedComplaint &&
    !matchPerformanceRequestRule(remainder, explicitComplaintRules)
  ) {
    const meaningfulRemainder = stripNegatedClauseStructure(remainder);

    if (!meaningfulRemainder) {
      return {
        confidence: "high",
        intent: "ordinary-product-work",
        matchedClause: clause,
        reason: "negated-performance-complaint",
      };
    }
  }

  return {
    confidence: "ambiguous",
    intent: "needs-agent-judgment",
    matchedClause: clause || null,
    reason: "needs-semantic-judgment",
  };
}

// This classifier is a deterministic guard, not a replacement for semantic
// agent judgment. It resolves only high-confidence runtime complaints,
// optimization requests, product commands, and local negations. Unrecognized
// wording remains needs-agent-judgment; it does not silently become ordinary.
export function classifyToolcraftPerformanceRequest(
  request: string,
): ToolcraftPerformanceRequestClassification {
  let ordinaryResult: ToolcraftPerformanceRequestClassification | null = null;
  let judgmentResult: ToolcraftPerformanceRequestClassification | null = null;

  for (const clause of splitRequestClauses(request)) {
    const classification = classifyClause(clause);
    if (classification.intent === "performance-iteration") {
      return classification;
    }
    if (classification.intent === "needs-agent-judgment") {
      judgmentResult ??= classification;
    } else {
      ordinaryResult ??= classification;
    }
  }

  return (
    judgmentResult ??
    ordinaryResult ?? {
      confidence: "ambiguous",
      intent: "needs-agent-judgment",
      matchedClause: null,
      reason: "needs-semantic-judgment",
    }
  );
}

export function validateToolcraftPerformanceRequestEvidence(
  request: string,
  evidence: string,
): ToolcraftPerformanceRequestEvidenceResult {
  const evidenceMatch = validateToolcraftPerformanceRequestEvidenceMatch(
    request,
    evidence,
  );
  if (!evidenceMatch.valid) return evidenceMatch;
  const { normalizedEvidence, normalizedRequest } = evidenceMatch;

  const requestClassification = classifyToolcraftPerformanceRequest(
    normalizedRequest,
  );
  const evidenceClassification = classifyToolcraftPerformanceRequest(
    normalizedEvidence,
  );

  if (requestClassification.intent === "ordinary-product-work") {
    return {
      evidenceClassification,
      normalizedEvidence,
      normalizedRequest,
      reason: "request-high-confidence-ordinary",
      requestClassification,
      valid: false,
    };
  }
  if (evidenceClassification.intent === "ordinary-product-work") {
    return {
      evidenceClassification,
      normalizedEvidence,
      normalizedRequest,
      reason: "evidence-high-confidence-ordinary",
      requestClassification,
      valid: false,
    };
  }

  return {
    evidenceClassification,
    normalizedEvidence,
    normalizedRequest,
    reason:
      evidenceClassification.intent === "needs-agent-judgment"
        ? "valid-agent-judgment-evidence"
        : "valid-performance-iteration-evidence",
    requestClassification,
    valid: true,
  };
}
