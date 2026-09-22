import { describe, expect, it } from "vitest";

import {
  alternateMotionReferenceId,
  alternateMotionSourceSha256,
  createMotionReferenceBehavior,
  createMotionReferenceInput,
  createOrdinalMotionReferenceStudy,
  createPassiveMotionReferenceInput,
  createTimedMotionReferenceStudy,
  getMotionReferenceErrors,
  motionReferenceId,
  motionSourceSha256,
} from "./app-acceptance.motion-reference-test-utils";

describe("Toolcraft motion reference identity", () => {
  it("rejects duplicate semantic ids", () => {
    const input = createMotionReferenceInput();
    const study = input.studies[0];

    expect(
      getMotionReferenceErrors([
        {
          ...input,
          studies: [
            {
              ...study,
              phases: [
                study.phases[0],
                { ...study.phases[1], id: study.phases[0].id },
              ],
            },
          ],
        },
      ]),
    ).toContain(
      'motion reference study "study-main" phase id "phase-before" is duplicated.',
    );
  });

  it("rejects duplicate reference ids even when source identities differ", () => {
    expect(
      getMotionReferenceErrors([
        createMotionReferenceInput(),
        createPassiveMotionReferenceInput({
          referenceId: motionReferenceId,
          sourceSha256: alternateMotionSourceSha256,
        }),
      ]),
    ).toContain(`motion reference id "${motionReferenceId}" is duplicated.`);
  });

  it("reports mixed source identities canonically for every study permutation", () => {
    const primary = createTimedMotionReferenceStudy();
    const alternate = createTimedMotionReferenceStudy({
      framePrefix: "alternate-",
      pathId: "study-alternate",
      sourceBasename: "alternate.mp4",
      sourceSha256: alternateMotionSourceSha256,
      studyId: "study-alternate",
    });
    const forward = getMotionReferenceErrors([
      createMotionReferenceInput({ studies: [primary, alternate] }),
    ]);
    const reverse = getMotionReferenceErrors([
      createMotionReferenceInput({ studies: [alternate, primary] }),
    ]);

    expect(forward).toEqual(reverse);
    expect(forward).toContain(
      `motion reference "${motionReferenceId}" studies must share one sourceSha256; found ${motionSourceSha256}, ${alternateMotionSourceSha256}.`,
    );
  });

  it("rejects duplicate inputs for one source identity", () => {
    expect(
      getMotionReferenceErrors([
        createMotionReferenceInput(),
        createPassiveMotionReferenceInput({
          referenceId: alternateMotionReferenceId,
        }),
      ]),
    ).toContain(
      `motion reference sourceSha256 "${motionSourceSha256}" is declared by multiple reference inputs; merge their studies under one input.`,
    );
  });

  it("keeps duplicate study ids ambiguous in every input permutation", () => {
    const timed = createTimedMotionReferenceStudy({ pathId: "timed-study" });
    const ordinal = createOrdinalMotionReferenceStudy({
      framePrefix: "ordinal-",
      pathId: "ordinal-study",
    });
    const errors = [
      getMotionReferenceErrors([
        createMotionReferenceInput({ studies: [timed, ordinal] }),
      ]),
      getMotionReferenceErrors([
        createMotionReferenceInput({ studies: [ordinal, timed] }),
      ]),
    ];

    expect(errors[0]).toEqual(errors[1]);
    expect(errors[0]).toContain(
      'motion reference behavior "delayed-retarget" timing claim "duration" studyId "study-main" resolves to 2 studies; expected exactly one.',
    );
  });

  it("validates every duplicate behavior while relational uses remain ambiguous", () => {
    const valid = createMotionReferenceBehavior();
    const malformed = createMotionReferenceBehavior({ description: "" });
    const errors = [
      getMotionReferenceErrors([
        createMotionReferenceInput({ behaviors: [valid, malformed] }),
      ]),
      getMotionReferenceErrors([
        createMotionReferenceInput({ behaviors: [malformed, valid] }),
      ]),
    ];

    expect(errors[0]).toEqual(errors[1]);
    expect(errors[0]).toContain(
      `motion reference "${motionReferenceId}" behavior id "delayed-retarget" is duplicated.`,
    );
    expect(errors[0]).toContain(
      'motion reference behavior "delayed-retarget" must include a non-empty description.',
    );
    expect(errors[0]).toContain(
      'motion reference study "study-main" phase "phase-before" cites ambiguous behaviorId "delayed-retarget" with 2 definitions.',
    );
    expect(errors[0]).toContain(
      `acceptance "reference.anchor-retarget" motion reference coverage for "${motionReferenceId}" behavior "delayed-retarget" resolves to 2 behavior definitions; expected exactly one.`,
    );
  });

  it("keeps control characters in timing study ids collision-proof", () => {
    const controlStudyId = "study\u0000left";
    const studies = [
      createTimedMotionReferenceStudy({
        framePrefix: "control-",
        pathId: "control-study",
        studyId: controlStudyId,
      }),
      createTimedMotionReferenceStudy({
        framePrefix: "plain-",
        pathId: "plain-study",
        studyId: "study-right",
      }),
    ];
    const behavior = createMotionReferenceBehavior({
      timingClaims: [
        { claim: "duration", studyId: controlStudyId },
        { claim: "duration", studyId: "study-right" },
      ],
    });

    expect(
      getMotionReferenceErrors([
        createMotionReferenceInput({ behaviors: [behavior], studies }),
      ]),
    ).toEqual([]);
  });
});
