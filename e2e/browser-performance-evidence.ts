import { test } from "@playwright/test";

import {
  TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME,
  TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_CONTENT_TYPE,
  decodeToolcraftBrowserPerformanceEvidenceBody,
} from "../src/app/test-evidence/browser-performance-contract";

export async function attachToolcraftBrowserPerformanceEvidence(
  body: string,
): Promise<void> {
  const decoded = decodeToolcraftBrowserPerformanceEvidenceBody(body);
  if (!decoded.ok) {
    throw new Error(
      `Cannot attach malformed Toolcraft browser performance evidence: ${decoded.error}`,
    );
  }
  await test.info().attach(TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME, {
    body,
    contentType: TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_CONTENT_TYPE,
  });
}
