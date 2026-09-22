import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  appProductReadiness,
  appTransferMode,
} from "./app-acceptance";
import type { ToolcraftTransferMode } from "./app-acceptance";
import {
  createMotionReferenceBehavior,
  createMotionReferenceInput,
  createOrdinalMotionReferenceStudy,
  createTimedMotionReferenceStudy,
} from "./app-acceptance.motion-reference-test-utils";
import { schemaHasProductSurface } from "./app-acceptance.schema-test-utils";
import {
  agentWorklogPath,
  getAgentWorklogValidationErrors,
  type WorklogMotionReference,
} from "./app-acceptance.worklog-test-utils";

function getWorklogMotionReferences(
  transferMode: ToolcraftTransferMode,
): readonly WorklogMotionReference[] {
  return transferMode.referenceInputs.flatMap((referenceInput) =>
    referenceInput.studies.map((study) => {
      const requiresRealTimeReview =
        study.evidence.timingMode === "seconds";
      const requiresSlowedReview =
        requiresRealTimeReview &&
        (study.events.some(
          ({ classification }) => classification === "product-behavior",
        ) ||
          referenceInput.behaviors.some((behavior) =>
            behavior.timingClaims.some(
              (claim) => claim.studyId === study.studyId,
            ),
          ));

      return {
        contactSheetPath: study.evidence.contactSheet.path,
        referenceId: referenceInput.referenceId,
        requiresRealTimeReview,
        requiresSlowedReview,
        sourceSha256: study.evidence.sourceSha256,
        studyId: study.studyId,
        timingMode: study.evidence.timingMode,
      } satisfies WorklogMotionReference;
    }),
  );
}

const worklogMotionReferences = getWorklogMotionReferences(appTransferMode);

describe("Toolcraft product worklog", () => {
  it("derives real-time, slowed, and ordered-frame review requirements per nested study", () => {
    const transferMode: ToolcraftTransferMode = {
      animationIntent: { mode: "none" },
      mode: "new-toolcraft-app",
      referenceInputs: [
        createMotionReferenceInput({
          behaviors: [
            createMotionReferenceBehavior({
              timingClaims: [{ claim: "duration", studyId: "study-claim" }],
            }),
          ],
          studies: [
            createTimedMotionReferenceStudy({
              pathId: "study-event",
              studyId: "study-event",
            }),
            createTimedMotionReferenceStudy({
              pathId: "study-claim",
              studyId: "study-claim",
              withEvent: false,
            }),
            createTimedMotionReferenceStudy({
              pathId: "study-quiet",
              studyId: "study-quiet",
              withEvent: false,
            }),
            createOrdinalMotionReferenceStudy({
              pathId: "study-ordinal",
              studyId: "study-ordinal",
            }),
          ],
        }),
      ],
    };

    expect(
      getWorklogMotionReferences(transferMode).map(
        ({ requiresRealTimeReview, requiresSlowedReview, studyId, timingMode }) =>
          ({
            requiresRealTimeReview,
            requiresSlowedReview,
            studyId,
            timingMode,
          }),
      ),
    ).toEqual([
      {
        requiresRealTimeReview: true,
        requiresSlowedReview: true,
        studyId: "study-event",
        timingMode: "seconds",
      },
      {
        requiresRealTimeReview: true,
        requiresSlowedReview: true,
        studyId: "study-claim",
        timingMode: "seconds",
      },
      {
        requiresRealTimeReview: true,
        requiresSlowedReview: false,
        studyId: "study-quiet",
        timingMode: "seconds",
      },
      {
        requiresRealTimeReview: false,
        requiresSlowedReview: false,
        studyId: "study-ordinal",
        timingMode: "ordinal",
      },
    ]);
  });

  it("requires product apps to replace the starter worklog with decision evidence", () => {
    if (appProductReadiness.mode !== "product" && !schemaHasProductSurface()) {
      return;
    }

    expect(existsSync(agentWorklogPath)).toBe(true);
    expect(
      getAgentWorklogValidationErrors(readFileSync(agentWorklogPath, "utf8"), {
        motionReferences: worklogMotionReferences,
      }),
    ).toEqual([]);
  });
});
