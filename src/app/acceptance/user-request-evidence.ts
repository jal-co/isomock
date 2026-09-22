/** Primary-source context, not an authenticated host transcript. */
export type ToolcraftUserRequestEvidence = Readonly<{
  source: "user-message";
  messageRef: string;
  messageText: string;
  quote: string;
}>;

const evidenceKeys = ["source", "messageRef", "messageText", "quote"];

/** Validate supplied provenance and exact quotation; the agent must inspect the original. */
export function getToolcraftUserRequestEvidenceErrors(
  evidence: unknown,
): readonly string[] {
  if (
    typeof evidence !== "object" ||
    evidence === null ||
    Array.isArray(evidence) ||
    Object.keys(evidence).length !== evidenceKeys.length ||
    Object.keys(evidence).some((key) => !evidenceKeys.includes(key)) ||
    !("source" in evidence) ||
    evidence.source !== "user-message" ||
    !("messageRef" in evidence) ||
    typeof evidence.messageRef !== "string" ||
    !evidence.messageRef.trim() ||
    !("messageText" in evidence) ||
    typeof evidence.messageText !== "string" ||
    !evidence.messageText.trim() ||
    !("quote" in evidence) ||
    typeof evidence.quote !== "string" ||
    !evidence.quote.trim()
  ) {
    return ["requires structured user-message evidence with non-empty messageRef, messageText, and quote."];
  }

  if (!evidence.messageText.includes(evidence.quote)) {
    return ["quote must be an exact substring of messageText; an agent paraphrase or plan claim is not primary request evidence."];
  }

  return [];
}
