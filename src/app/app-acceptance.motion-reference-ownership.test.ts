import { describe, expect, it } from "vitest";

import {
  createMotionReferenceAcceptance,
  createMotionReferenceBehavior,
  createMotionReferenceInput,
  createTimedMotionReferenceStudy,
  getMotionReferenceErrors,
  motionReferenceAcceptance,
  motionReferenceId,
} from "./app-acceptance.motion-reference-test-utils";

describe("Toolcraft motion reference acceptance ownership", () => {
  it("requires one exact reverse acceptance coverage record", () => {
    const input = createMotionReferenceInput();

    expect(
      getMotionReferenceErrors([input], [
        createMotionReferenceAcceptance({ motionReferenceCoverage: [] }),
      ]),
    ).toContain(
      'motion reference behavior "delayed-retarget" acceptance "reference.anchor-retarget" must own exactly one reverse coverage pair; found 0.',
    );

    const duplicateOwner = createMotionReferenceAcceptance({
      id: "reference.anchor-retarget-duplicate",
    });
    expect(
      getMotionReferenceErrors(
        [input],
        [motionReferenceAcceptance, duplicateOwner],
      ),
    ).toContain(
      'motion reference behavior "delayed-retarget" coverage pair has 2 acceptance owners; expected exactly one.',
    );
  });

  it("rejects dangling reverse acceptance coverage", () => {
    const danglingAcceptance = createMotionReferenceAcceptance({
      id: "reference.dangling-motion",
      motionReferenceCoverage: [
        { behaviorId: "missing-behavior", referenceId: motionReferenceId },
      ],
    });

    expect(
      getMotionReferenceErrors(
        [createMotionReferenceInput()],
        [motionReferenceAcceptance, danglingAcceptance],
      ),
    ).toContain(
      `acceptance "reference.dangling-motion" has dangling motion reference coverage for "${motionReferenceId}" behavior "missing-behavior".`,
    );
  });

  it("never selects a representative from ambiguous acceptance ids", () => {
    const valid = createMotionReferenceAcceptance();
    const malformed = createMotionReferenceAcceptance({
      automated: false,
      automatedTestName: "",
      browser: false,
      expectedObservable: "",
      motionReferenceCoverage: [],
    });
    const expected = [
      'motion reference behavior "delayed-retarget" acceptance "reference.anchor-retarget" must describe its observable result.',
      'motion reference behavior "delayed-retarget" acceptance "reference.anchor-retarget" must have automated coverage.',
      'motion reference behavior "delayed-retarget" acceptance "reference.anchor-retarget" must have browser coverage.',
      'motion reference behavior "delayed-retarget" acceptanceId "reference.anchor-retarget" resolves to 2 acceptance rows; expected exactly one.',
    ];

    expect(
      getMotionReferenceErrors(
        [createMotionReferenceInput()],
        [valid, malformed],
      ),
    ).toEqual(expected);
    expect(
      getMotionReferenceErrors(
        [createMotionReferenceInput()],
        [malformed, valid],
      ),
    ).toEqual(expected);
  });

  it("does not let delimiter-shaped coverage pairs hide dangling ownership", () => {
    const ownedReferenceId = "motion-reference-v1-control\u0000suffix" as const;
    const danglingReferenceId = "motion-reference-v1-control" as const;
    const ownedBehaviorId = "tail";
    const danglingBehaviorId = "suffix\u0000tail";
    const ownedAcceptance = createMotionReferenceAcceptance({
      id: "reference.control-owner",
      motionReferenceCoverage: [
        { behaviorId: ownedBehaviorId, referenceId: ownedReferenceId },
      ],
    });
    const danglingAcceptance = createMotionReferenceAcceptance({
      id: "reference.control-dangling",
      motionReferenceCoverage: [
        { behaviorId: danglingBehaviorId, referenceId: danglingReferenceId },
      ],
    });
    const behavior = createMotionReferenceBehavior({
      acceptanceId: ownedAcceptance.id,
      id: ownedBehaviorId,
    });
    const study = createTimedMotionReferenceStudy({ behaviorId: ownedBehaviorId });
    const input = createMotionReferenceInput({
      behaviors: [behavior],
      referenceId: ownedReferenceId,
      studies: [study],
    });

    expect(
      getMotionReferenceErrors([input], [ownedAcceptance, danglingAcceptance]),
    ).toContain(
      `acceptance "reference.control-dangling" has dangling motion reference coverage for "${danglingReferenceId}" behavior "${danglingBehaviorId}".`,
    );
  });
});
