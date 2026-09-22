import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  agentWorklogPath,
  createAgentWorklogFixture,
  getAgentWorklogValidationErrors,
  readToolcraftDoc,
} from "./app-acceptance.worklog-test-utils";
import {
  TOOLCRAFT_DELIVERY_VERIFICATION_NARRATIVE,
} from "../../scripts/toolcraft-performance-authority-policy.mjs";

function appendDecisionTrailIteration(
  worklog: string,
  trailFields: NonNullable<
    Parameters<typeof createAgentWorklogFixture>[0]
  >["trailFields"],
): string {
  const fixture = createAgentWorklogFixture({
    trailFields,
    trailHeading: "Delivery 2 - Later product edit",
  });
  const latestIteration = /## Decision Trail\n\n([\s\S]*?)\n\n## Evidence/u.exec(
    fixture,
  )?.[1];
  if (!latestIteration) throw new Error("Expected a rendered decision-trail iteration.");
  return worklog.replace("\n## Evidence", `\n${latestIteration}\n\n## Evidence`);
}

describe("starter acceptance worklog contract", () => {
  it("does not treat fenced Decision Trail headings as iterations", () => {
    const worklog = createAgentWorklogFixture().replace(
      "\n## Evidence",
      `
\`\`\`md
### Not a delivery iteration
- Request: Forged request.
- Source reviewed: forged-reference.mp4 video reference.
\`\`\`

## Evidence`,
    );

    expect(getAgentWorklogValidationErrors(worklog)).toEqual([]);
  });

  it("rejects duplicate Decision Trail sections", () => {
    const worklog = `${createAgentWorklogFixture()}

## Decision Trail

### Delivery 2 - Duplicate section
- Request: Forged request.
`;

    expect(getAgentWorklogValidationErrors(worklog)).toContain(
      "agent-worklog.md must include exactly one Decision Trail section.",
    );
  });

  it("rejects unscoped content before the first Decision Trail iteration", () => {
    const worklog = createAgentWorklogFixture().replace(
      "## Decision Trail\n",
      "## Decision Trail\n\nUnscoped authority prose.\n",
    );

    expect(getAgentWorklogValidationErrors(worklog)).toContain(
      "agent-worklog.md Decision Trail cannot contain content before its first iteration heading.",
    );
  });

  it("keeps an implementation worklog available for generated app decisions", () => {
    expect(
      existsSync(agentWorklogPath),
      "Generated apps must include docs/toolcraft/agent-worklog.md so implementation decisions and evidence survive the chat context.",
    ).toBe(true);
  });

  it("documents control selection inventory and custom built-in fit checks", () => {
    const coreControlSelection = readToolcraftDoc("core/control-selection.md");
    const componentRules = readToolcraftDoc("component-rules.md");
    const acceptanceTesting = readToolcraftDoc("acceptance-testing.md");

    expect(coreControlSelection).toContain("Control Selection Inventory");
    expect(coreControlSelection).toContain("Product need:");
    expect(coreControlSelection).toContain("Candidate built-ins checked:");
    expect(coreControlSelection).toContain("Best built-in:");
    expect(coreControlSelection).toContain("Rejected alternatives:");
    expect(coreControlSelection).toContain("Target:");
    expect(coreControlSelection).toContain("Custom Control Gate");

    expect(componentRules).toContain("Control Decision Catalog");
    expect(componentRules).toContain("core/control-selection.md");

    expect(acceptanceTesting).toContain("wrong-substitution");
    expect(acceptanceTesting).toContain("built-in fit check");
    expect(acceptanceTesting).toContain("builtInFitCheck");
  });

  it("reports video wording as an unregistered input when typed references are empty", () => {
    const worklog = createAgentWorklogFixture({
      evidenceLines: [
        "- Source reviewed: user prompt, ref.mp4, src/app/product-renderer.tsx.",
        "- Contract applied: Toolcraft workflow.",
      ],
      trailFields: {
        "Reference inputs": "/fixtures/reference-motion/ref.mp4 video reference.",
        "Source/reference checked": "User prompt and /fixtures/reference-motion/ref.mp4 video.",
      },
    });

    expect(
      getAgentWorklogValidationErrors(worklog, { motionReferences: [] }),
    ).toContain(
      "agent-worklog.md cites a video reference, screen recording, GIF, extracted frames, or contact sheet, but appTransferMode.referenceInputs registers no motion reference input.",
    );
  });

  it("requires one exact typed summary for each timed motion-reference study", () => {
    const motionReference = {
      contactSheetPath:
        "src/app/reference-studies/study-main/contact-sheet.png",
      referenceId:
        "motion-reference-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      requiresRealTimeReview: true,
      requiresSlowedReview: true,
      sourceSha256:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      studyId: "study-main",
      timingMode: "seconds" as const,
    };
    const worklog = createAgentWorklogFixture({
      evidenceLines: [
        "- Source reviewed: user prompt, ref.mp4, extracted frames, src/app/product-renderer.tsx.",
        "- Contract applied: Toolcraft workflow and video-reference-analysis.",
      ],
      trailFields: {
        "Alternatives rejected": "Single screenshot implementation because the video behavior changes frame to frame.",
        "Contract rules applied": "video-reference-analysis and acceptance-product-observable.",
        "Reference inputs": "/fixtures/reference-motion/ref.mp4 video reference.",
        "Source/reference checked": "User prompt and /fixtures/reference-motion/ref.mp4 video.",
      },
    });

    expect(
      getAgentWorklogValidationErrors(worklog, {
        motionReferences: [motionReference],
      }),
    ).toEqual([
      expect.stringContaining('motion reference study "study-main"'),
    ]);

    const genericKeywords = worklog.replace(
      "## Decision Trail",
      [
        "### Video Reference Study",
        "- Evidence: storyboard frames and transition analysis from the contact sheet.",
        "",
        "## Decision Trail",
      ].join("\n"),
    );
    expect(
      getAgentWorklogValidationErrors(genericKeywords, {
        motionReferences: [motionReference],
      }),
    ).toEqual([
      expect.stringContaining('motion reference study "study-main"'),
    ]);

    const exactRecord = [
      "- Motion reference study:",
      `referenceId=${motionReference.referenceId};`,
      `studyId=${motionReference.studyId};`,
      `sourceSha256=${motionReference.sourceSha256};`,
      `timingMode=${motionReference.timingMode};`,
      `contactSheetPath=${motionReference.contactSheetPath};`,
      "review=real-time,slowed.",
    ].join(" ");
    for (const inexactRecord of [
      exactRecord.replace(
        motionReference.referenceId,
        `${motionReference.referenceId}x`,
      ),
      exactRecord.replace("studyId=study-main", "studyId=study-other"),
      exactRecord.replace(
        motionReference.sourceSha256,
        `c${motionReference.sourceSha256.slice(1)}`,
      ),
      exactRecord.replace("timingMode=seconds", "timingMode=ordinal"),
      exactRecord.replace(
        motionReference.contactSheetPath,
        "src/app/reference-studies/study-main/other-sheet.png",
      ),
      exactRecord.replace("review=real-time,slowed", "review=real-time"),
    ]) {
      expect(
        getAgentWorklogValidationErrors(`${worklog}\n${inexactRecord}`, {
          motionReferences: [motionReference],
        }),
      ).toEqual([
        expect.stringContaining('motion reference study "study-main"'),
      ]);
    }
    expect(
      getAgentWorklogValidationErrors(`${worklog}\n${exactRecord}`, {
        motionReferences: [motionReference],
      }),
    ).toEqual([]);
  });

  it("requires ordered-frame review for ordinal evidence and rejects timing review wording", () => {
    const motionReference = {
      contactSheetPath:
        "src/app/reference-studies/study-ordinal/contact-sheet.png",
      referenceId:
        "motion-reference-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      requiresRealTimeReview: false,
      requiresSlowedReview: false,
      sourceSha256:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      studyId: "study-ordinal",
      timingMode: "ordinal" as const,
    };
    const base = createAgentWorklogFixture();
    const timedWording = `${base}\n- Motion reference study: referenceId=${motionReference.referenceId}; studyId=${motionReference.studyId}; sourceSha256=${motionReference.sourceSha256}; timingMode=ordinal; contactSheetPath=${motionReference.contactSheetPath}; review=real-time,slowed.`;
    expect(
      getAgentWorklogValidationErrors(timedWording, {
        motionReferences: [motionReference],
      }),
    ).toEqual([
      expect.stringContaining('motion reference study "study-ordinal"'),
    ]);

    const ordinalRecord = timedWording.replace(
      "review=real-time,slowed",
      "review=ordered-frames",
    );
    expect(
      getAgentWorklogValidationErrors(ordinalRecord, {
        motionReferences: [motionReference],
      }),
    ).toEqual([]);
  });

  it("does not let one record satisfy two nested studies", () => {
    const referenceId =
      "motion-reference-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const sourceSha256 =
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const first = {
      contactSheetPath:
        "src/app/reference-studies/study-one/contact-sheet.png",
      referenceId,
      requiresRealTimeReview: true,
      requiresSlowedReview: false,
      sourceSha256,
      studyId: "study-one",
      timingMode: "seconds" as const,
    };
    const second = {
      ...first,
      contactSheetPath:
        "src/app/reference-studies/study-two/contact-sheet.png",
      studyId: "study-two",
    };
    const worklog = `${createAgentWorklogFixture()}\n- Motion reference study: referenceId=${referenceId}; studyId=study-one; sourceSha256=${sourceSha256}; timingMode=seconds; contactSheetPath=${first.contactSheetPath}; review=real-time.`;

    expect(
      getAgentWorklogValidationErrors(worklog, {
        motionReferences: [first, second],
      }),
    ).toEqual([
      expect.stringContaining('motion reference study "study-two"'),
    ]);
  });

  it("does not treat ordinary video export worklog evidence as a video reference", () => {
    const worklog = createAgentWorklogFixture({
      decisions: {
        Export: {
          decision: "Expose Export PNG and Export Video.",
          evidence: "src/app/export.ts.",
          reason: "Animated products need still and video output.",
        },
        Renderer: {
          decision: "Use Canvas 2D.",
          evidence: "src/app/product-renderer.tsx.",
          reason: "Product output is simple animated geometry.",
        },
        Timeline: {
          decision: "Use playback.",
          evidence: "src/app/app-schema.ts.",
          reason: "Export Video requires runtime timeline time.",
        },
      },
      evidenceLines: [
        "- Source reviewed: user prompt, app schema, export handler, browser export behavior.",
        "- Contract applied: Toolcraft workflow.",
      ],
      trailFields: {
        Decision: "Use Toolcraft export helpers.",
        "Reference inputs": "None.",
        "Source/reference checked": "User prompt, app schema, export handler, and browser export behavior.",
        "State/output mapping": "Runtime timeline state drives preview and export frames.",
        "User-visible result": "The product renders and exports video.",
      },
    });

    expect(getAgentWorklogValidationErrors(worklog)).toEqual([]);
  });

  it("rejects stale or incomplete product worklogs", () => {
    const errors = getAgentWorklogValidationErrors(
      createAgentWorklogFixture({ mode: "starter" }),
    );

    expect(errors).toContain(
      'agent-worklog.md Status must declare "Mode: product" before final delivery.',
    );
    expect(errors).toContain(
      'agent-worklog.md still declares "Mode: starter"; replace the starter template with product decisions.',
    );
  });

  it("accepts product worklogs with concrete decisions, evidence, verification, and risk state", () => {
    expect(getAgentWorklogValidationErrors(createAgentWorklogFixture())).toEqual([]);
  });

  it("keeps receipt-owned Run ledgers out of human-intent worklog fixtures", () => {
    expect(createAgentWorklogFixture()).not.toContain("- Run:");
  });

  it("ignores receipt-owned execution prose outside the Decision Trail", () => {
    const worklog = createAgentWorklogFixture({
      verificationLines: [
        "- Run: an obsolete command ledger entry.",
        "- Measurements: receipt-owned evidence.",
      ],
    });

    expect(getAgentWorklogValidationErrors(worklog)).toEqual([]);
  });

  it("accepts a later functional delivery with human intent and bare verification", () => {
    const worklog = appendDecisionTrailIteration(
      createAgentWorklogFixture({
        decisions: {
          Performance: {
            decision: "Use targeted renderer verification without repeating the full suite.",
            evidence: "Prior delivery anchor plus the current protected delivery receipt.",
            reason: "The user did not request performance work.",
          },
        },
      }),
      {
        "Alternatives rejected":
          "Repeating unrelated product work in the same delivery.",
        Decision:
          "Refine the renderer behavior and let protected planning derive proof.",
        Request: "Refine one renderer behavior in an already delivered app.",
        Risks: "Renderer responsiveness is covered by its targeted scenario.",
        "State/output mapping": "The changed renderer path updates product output directly.",
        "Task type": "Renderer update after the first working version.",
        "User-visible result": "The renderer behavior is corrected.",
        Verification: TOOLCRAFT_DELIVERY_VERIFICATION_NARRATIVE,
      },
    );

    expect(getAgentWorklogValidationErrors(worklog)).toEqual([]);
  });

  it("rejects product worklogs without an actionable decision trail", () => {
    const worklog = createAgentWorklogFixture({
      omitDecisionTrailFields: [
        "Alternatives rejected",
        "Contract rules applied",
        "Reference inputs",
        "Source/reference checked",
        "State/output mapping",
        "User-visible result",
      ],
    });

    expect(getAgentWorklogValidationErrors(worklog)).toEqual(
      expect.arrayContaining([
        'agent-worklog.md Decision Trail iteration "Delivery 1 - Product build" must include "User-visible result:".',
        'agent-worklog.md Decision Trail iteration "Delivery 1 - Product build" must include "Source/reference checked:".',
        'agent-worklog.md Decision Trail iteration "Delivery 1 - Product build" must include "Reference inputs:".',
        'agent-worklog.md Decision Trail iteration "Delivery 1 - Product build" must include "Contract rules applied:".',
        'agent-worklog.md Decision Trail iteration "Delivery 1 - Product build" must include "Alternatives rejected:".',
        'agent-worklog.md Decision Trail iteration "Delivery 1 - Product build" must include "State/output mapping:".',
      ]),
    );
  });
});
