import type { Suite, TestCase } from "@playwright/test/reporter";

import {
  TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_ATTACHMENT_NAME,
  TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_CONTENT_TYPE,
  type ToolcraftBrowserRuntimeRequirement,
} from "../src/app/test-evidence/browser-runtime-contract";

export function fakeTestCase({
  expectedStatus = "passed",
  file = "/product/e2e/app-controls.spec.ts",
  results = [],
  title,
}: {
  expectedStatus?: TestCase["expectedStatus"];
  file?: string;
  results?: TestCase["results"];
  title: string;
}): TestCase {
  return {
    expectedStatus,
    location: { column: 1, file, line: 1 },
    results,
    title,
  } as TestCase;
}

export function fakeSuite(tests: TestCase[]): Suite {
  return { allTests: () => tests } as Suite;
}

export function passedResultWithEvidence(
  requirement: ToolcraftBrowserRuntimeRequirement,
): TestCase["results"][number] {
  return {
    attachments: [
      {
        body: Buffer.from(
          JSON.stringify({
            evidenceType: requirement.evidenceType,
            requirementId: requirement.requirementId,
            ...(requirement.target === undefined
              ? {}
              : { target: requirement.target }),
            version: 2,
          }),
        ),
        contentType: TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_CONTENT_TYPE,
        name: TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_ATTACHMENT_NAME,
      },
    ],
    retry: 0,
    status: "passed",
  } as TestCase["results"][number];
}
