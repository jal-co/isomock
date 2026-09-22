import { describe, expect, it } from "vitest";

import {
  createPerformanceIterationWorklogFixture as renderPerformanceIterationWorklogFixture,
} from "./app-acceptance.worklog-performance-intent-test-utils";
import {
  createAgentWorklogFixture,
  getAgentWorklogValidationErrors,
} from "./app-acceptance.worklog-test-utils";
import {
  TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND,
  TOOLCRAFT_DELIVERY_VERIFICATION_NARRATIVE,
} from "../../scripts/toolcraft-performance-authority-policy.mjs";

const createPerformanceIterationWorklogFixture = (
  options: Parameters<typeof renderPerformanceIterationWorklogFixture>[1],
) =>
  renderPerformanceIterationWorklogFixture(
    createAgentWorklogFixture,
    options,
  );

const foreignDeliveryCommand =
  TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND.startsWith("npm ")
    ? "pnpm verify:delivery"
    : "npm run verify:delivery";

describe("starter acceptance worklog command authority", () => {
  it("accepts a compact follow-up while retaining the initial product decisions", () => {
    const entry = `### Delivery 2 — Label correction
- Entry type: focused
- Change ID: label-correction
- Request: Rename the visible label.
- Changed owner: src/app/app-schema.ts
- User-visible result: The label is correct.
- Verification: pnpm test:feature -- label passed; text run recorded.
- Risks: None.
`;
    const worklog = createAgentWorklogFixture().replace("\n## Evidence", `\n${entry}\n## Evidence`);
    expect(getAgentWorklogValidationErrors(worklog)).toEqual([]);
    expect(getAgentWorklogValidationErrors(worklog.replace("- Changed owner: src/app/app-schema.ts\n", "")))
      .toContain('agent-worklog.md Decision Trail iteration "Delivery 2 — Label correction" must include "Changed owner:".');
    expect(getAgentWorklogValidationErrors(createAgentWorklogFixture().replace("- Request:", "- Entry type: focused\n- Change ID: first\n- Changed owner: src/app\n- Request:")))
      .toContain("agent-worklog.md must retain its initial delivery decision entry before adding focused follow-ups.");
  });

  it("accepts a bare delivery command in ordinary narrative verification", () => {
    const worklog = createAgentWorklogFixture({
      trailFields: {
        Verification: TOOLCRAFT_DELIVERY_VERIFICATION_NARRATIVE,
      },
      verificationLines: [
        "Protected receipts own executed commands, selectors, and measurements.",
      ],
    });

    expect(getAgentWorklogValidationErrors(worklog)).toEqual([]);
  });

  it("accepts a bare delivery command for domain-shaped performance authority without a matching Run", () => {
    const worklog = createPerformanceIterationWorklogFixture({
      request: "The canvas lags while dragging.",
    });

    expect(getAgentWorklogValidationErrors(worklog)).toEqual([]);
  });

  it.each([
    `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND} -- --tier=3.`,
    `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND} -- --reason=performance-iteration.`,
    `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND} -- --unit-test="src/app/product.test.ts".`,
    `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND} -- --browser-test="browser: exact title".`,
    `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND} -- --performance-test="browser perf: exact title".`,
    `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND} --foo.`,
    `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND} | tee proof.log.`,
    `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND} > proof.log.`,
    `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND} 2> proof.log.`,
    `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND} &`,
    `CI=1 ${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND}.`,
    `env CI=1 ${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND}.`,
    `${foreignDeliveryCommand} alongside ${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND}.`,
    `yarn verify:delivery alongside ${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND}.`,
    `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND} plus ${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND}.`,
    `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND} && pnpm test.`,
    `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND}; pnpm build.`,
    `sh -c \`${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND}\`.`,
  ])("accepts recorded commands as narrative, without execution authority: %s", (verification) => {
    const worklog = createAgentWorklogFixture({
      trailFields: { Verification: verification },
    });

    expect(getAgentWorklogValidationErrors(worklog)).toEqual([]);
  });

  it.each([
    "pnpm verify:perf.",
    "pnpm run verify:perf.",
    `One bare \`${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND}\` then \`pnpm verify:perf\`.`,
  ])("accepts full-performance command mentions as narrative only: %s", (verification) => {
    const worklog = createAgentWorklogFixture({
      trailFields: { Verification: verification },
    });

    expect(getAgentWorklogValidationErrors(worklog)).toEqual([]);
  });

  it("ignores command-like explanatory text outside Decision Trail Verification", () => {
    const worklog = createAgentWorklogFixture()
      .replace(
        "- Decision: Use SVG renderer with Toolcraft controls.",
        "- Decision: Protected planning derives selectors instead of reading --tier=3 prose.",
      )
      .replace(
        "- Alternatives rejected: Canvas output because vector output must stay crisp.",
        "- Alternatives rejected: Asking authors to record --performance-test selectors.",
      )
      .replace(
        "- Risks: None; browser and performance gates cover the touched surfaces.",
        "- Risks: Operators may separately authorize pnpm verify:perf outside delivery.",
      );

    expect(getAgentWorklogValidationErrors(worklog)).toEqual([]);
  });

  it("does not parse or match global Run entries", () => {
    const worklog = createAgentWorklogFixture({
      verificationLines: [
        '- Run: sh -c "untrusted shell-like prose"',
        "- Measurements: receipts own the numeric results.",
      ],
    });

    expect(getAgentWorklogValidationErrors(worklog)).toEqual([]);
  });
});
