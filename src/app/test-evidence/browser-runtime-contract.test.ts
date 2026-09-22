import { describe, expect, it } from "vitest";

import {
  TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_ATTACHMENT_NAME,
  TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_CONTENT_TYPE,
  TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_TYPES,
  evaluateToolcraftBrowserRuntimeEvidence,
  parseToolcraftBrowserRuntimeEvidence,
  serializeToolcraftBrowserRuntimeEvidence,
  type ToolcraftBrowserRuntimeRequirement,
  type ToolcraftBrowserRuntimeTest,
} from "./browser-runtime-contract";

const requirement: ToolcraftBrowserRuntimeRequirement = {
  evidenceType: "product-observable-change",
  requirementId: "appearance.opacity",
  testName: "browser: opacity changes product output",
};

function evidenceAttachment(
  requirementId = requirement.requirementId,
  evidenceType: ToolcraftBrowserRuntimeRequirement["evidenceType"] =
    requirement.evidenceType,
  target?: string,
) {
  return {
    body: serializeToolcraftBrowserRuntimeEvidence({
      evidenceType,
      requirementId,
      target,
    }),
    contentType: TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_CONTENT_TYPE,
    name: TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_ATTACHMENT_NAME,
  };
}

function requiredTest(
  overrides: Partial<ToolcraftBrowserRuntimeTest> = {},
): ToolcraftBrowserRuntimeTest {
  return {
    expectedStatus: "passed",
    results: [
      {
        attachments: [evidenceAttachment()],
        retry: 0,
        status: "passed",
      },
    ],
    title: requirement.testName,
    ...overrides,
  };
}

describe("browser runtime acceptance evidence", () => {
  it("rejects evidence produced for a different schema target", () => {
    const targetRequirement = {
      ...requirement,
      target: "appearance.opacity",
    } as ToolcraftBrowserRuntimeRequirement & { target: string };
    const wrongTargetAttachment = {
      body: JSON.stringify({
        evidenceType: requirement.evidenceType,
        requirementId: requirement.requirementId,
        target: "appearance.color",
        version: 2,
      }),
      contentType: TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_CONTENT_TYPE,
      name: TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_ATTACHMENT_NAME,
    };

    expect(
      evaluateToolcraftBrowserRuntimeEvidence({
        requirements: [targetRequirement],
        tests: [
          requiredTest({
            results: [
              {
                attachments: [wrongTargetAttachment],
                retry: 0,
                status: "passed",
              },
            ],
          }),
        ],
      }),
    ).toContainEqual(expect.stringContaining('target "appearance.opacity"'));
  });

  it("round-trips every canonical runtime evidence type", () => {
    for (const evidenceType of TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_TYPES) {
      expect(
        parseToolcraftBrowserRuntimeEvidence(
          evidenceAttachment("runtime.round-trip", evidenceType),
        ),
      ).toEqual({
        evidenceType,
        requirementId: "runtime.round-trip",
        version: 2,
      });
    }
  });

  it("accepts one passed required test with matching structured evidence", () => {
    expect(
      evaluateToolcraftBrowserRuntimeEvidence({
        requirements: [requirement],
        tests: [requiredTest()],
      }),
    ).toEqual([]);
  });

  it("fails missing and duplicate required product tests", () => {
    expect(
      evaluateToolcraftBrowserRuntimeEvidence({
        requirements: [requirement],
        tests: [],
      }),
    ).toEqual([
      expect.stringContaining(
        `Missing required browser test "${requirement.testName}"`,
      ),
    ]);

    expect(
      evaluateToolcraftBrowserRuntimeEvidence({
        requirements: [requirement],
        tests: [requiredTest(), requiredTest()],
      }),
    ).toEqual([
      expect.stringContaining(
        `Duplicate required browser test "${requirement.testName}"`,
      ),
    ]);
  });

  it("fails when the required test expected or actually produced a non-passed status", () => {
    const expectedFailure = evaluateToolcraftBrowserRuntimeEvidence({
      requirements: [requirement],
      tests: [requiredTest({ expectedStatus: "failed" })],
    });
    const actualSkip = evaluateToolcraftBrowserRuntimeEvidence({
      requirements: [requirement],
      tests: [
        requiredTest({
          results: [
            {
              attachments: [evidenceAttachment()],
              retry: 0,
              status: "skipped",
            },
          ],
        }),
      ],
    });

    expect(expectedFailure).toContainEqual(
      expect.stringContaining('expected status "passed"'),
    );
    expect(actualSkip).toContainEqual(
      expect.stringContaining('actual status "passed"'),
    );
  });

  it("fails missing, malformed, and mismatched final evidence", () => {
    const candidates: ToolcraftBrowserRuntimeTest[] = [
      requiredTest({
        results: [{ attachments: [], retry: 0, status: "passed" }],
      }),
      requiredTest({
        results: [
          {
            attachments: [
              {
                body: "not-json",
                contentType: TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_CONTENT_TYPE,
                name: TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_ATTACHMENT_NAME,
              },
            ],
            retry: 0,
            status: "passed",
          },
        ],
      }),
      requiredTest({
        results: [
          {
            attachments: [evidenceAttachment("appearance.color")],
            retry: 0,
            status: "passed",
          },
        ],
      }),
    ];

    for (const candidate of candidates) {
      expect(
        evaluateToolcraftBrowserRuntimeEvidence({
          requirements: [requirement],
          tests: [candidate],
        }),
        JSON.stringify(candidate),
      ).toContainEqual(
        expect.stringContaining(
          `matching runtime evidence for requirement "${requirement.requirementId}"`,
        ),
      );
    }
  });

  it("uses only the final retry result and its evidence", () => {
    const failedRetryEvidenceOnly = requiredTest({
      results: [
        {
          attachments: [evidenceAttachment()],
          retry: 0,
          status: "failed",
        },
        { attachments: [], retry: 1, status: "passed" },
      ],
    });
    const finalRetryEvidence = requiredTest({
      results: [
        {
          attachments: [evidenceAttachment("wrong.requirement")],
          retry: 0,
          status: "failed",
        },
        {
          attachments: [evidenceAttachment()],
          retry: 1,
          status: "passed",
        },
      ],
    });

    expect(
      evaluateToolcraftBrowserRuntimeEvidence({
        requirements: [requirement],
        tests: [failedRetryEvidenceOnly],
      }),
    ).toContainEqual(
      expect.stringContaining(
        `matching runtime evidence for requirement "${requirement.requirementId}"`,
      ),
    );
    expect(
      evaluateToolcraftBrowserRuntimeEvidence({
        requirements: [requirement],
        tests: [finalRetryEvidence],
      }),
    ).toEqual([]);
  });
});
