import type { ToolcraftExportRequestEvidence } from "./acceptance/types";

/** Synthetic primary messages for framework tests only; never product permission. */
export function exportRequestFixture(
  messageText: string,
): ToolcraftExportRequestEvidence {
  return {
    source: "user-message",
    messageRef: "synthetic-export-contract-test/user-message-1",
    messageText,
    quote: messageText,
  };
}
