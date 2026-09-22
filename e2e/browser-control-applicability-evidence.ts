import { expectToolcraftSelectorState } from "./browser-control-value-observation";
import { expect } from "@playwright/test";

import {
  getToolcraftApplicabilityRequirementId,
  type ToolcraftControlApplicabilityCase,
} from "../src/app/app-acceptance";
import {
  countToolcraftControlOwnersByTarget,
} from "./browser-control-target-helpers";
import {
  assertToolcraftBrowserActionForSession,
  getToolcraftBrowserActionTarget,
  getToolcraftBrowserProofPage,
  runToolcraftBrowserAction,
  type ToolcraftBrowserAction,
  type ToolcraftBrowserProofSession,
} from "./browser-proof-session";
import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";

export async function expectToolcraftControlApplicabilityState(
  session: ToolcraftBrowserProofSession,
  selectBranch: ToolcraftBrowserAction,
  applicabilityCase: ToolcraftControlApplicabilityCase,
  options: { baseRequirementId: string; timeoutMs?: number },
): Promise<void> {
  const selectorTarget = getToolcraftBrowserActionTarget(selectBranch)?.trim();
  expect(
    selectorTarget,
    "Control-applicability evidence requires a target-scoped selector action.",
  ).toBe(applicabilityCase.selectorTarget);
  assertToolcraftBrowserActionForSession(session, selectBranch);

  const page = await getToolcraftBrowserProofPage(session);
  await runToolcraftBrowserAction(selectBranch);
  await expectToolcraftSelectorState(page, applicabilityCase);
  await expect
    .poll(
      () => countToolcraftControlOwnersByTarget(page, applicabilityCase.target),
      {
        message: `Control "${applicabilityCase.target}" should be ${applicabilityCase.expectation} for ${applicabilityCase.selectorTarget}=${JSON.stringify(applicabilityCase.selectorValue)}.`,
        timeout: options.timeoutMs ?? 5_000,
      },
    )
    .toBe(applicabilityCase.expectation === "hidden" ? 0 : 1);

  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType:
      applicabilityCase.expectation === "hidden"
        ? "control-applicability-hidden"
        : "control-applicability-visible",
    requirementId: getToolcraftApplicabilityRequirementId(
      options.baseRequirementId,
      applicabilityCase,
    ),
    target: applicabilityCase.target,
  });
}
