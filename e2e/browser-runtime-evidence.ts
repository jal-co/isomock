import { test } from "@playwright/test";

import {
  TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_ATTACHMENT_NAME,
  TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_CONTENT_TYPE,
  serializeToolcraftBrowserRuntimeEvidence,
  type ToolcraftBrowserRuntimeEvidenceType,
} from "../src/app/test-evidence/browser-runtime-contract";

export async function attachToolcraftBrowserRuntimeEvidence({
  evidenceType,
  requirementId,
  target,
}: {
  evidenceType: ToolcraftBrowserRuntimeEvidenceType;
  requirementId: string;
  target?: string;
}): Promise<void> {
  await test.info().attach(TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_ATTACHMENT_NAME, {
    body: serializeToolcraftBrowserRuntimeEvidence({
      evidenceType,
      requirementId,
      target,
    }),
    contentType: TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_CONTENT_TYPE,
  });
}
