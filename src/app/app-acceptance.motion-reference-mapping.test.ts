import { describe, expect, it } from "vitest";

import {
  createMotionReferenceInput,
  createOrdinalMotionReferenceStudy,
  getMotionReferenceErrors,
} from "./app-acceptance.motion-reference-test-utils";

describe("Toolcraft motion reference semantic coverage", () => {
  it("accepts one normalized input with exact behavior and acceptance ownership", () => {
    expect(getMotionReferenceErrors([createMotionReferenceInput()])).toEqual([]);
  });

  it("rejects phase gaps and overlaps across the ordered overview", () => {
    const input = createMotionReferenceInput();
    const study = input.studies[0];
    const [firstPhase, secondPhase] = study.phases;

    expect(
      getMotionReferenceErrors([
        {
          ...input,
          studies: [
            {
              ...study,
              phases: [{ ...firstPhase, toFrameId: "f0" }, secondPhase],
            },
          ],
        },
      ]),
    ).toContain(
      'motion reference study "study-main" phases must be contiguous; "phase-after" starts at overview index 2 after index 0.',
    );

    expect(
      getMotionReferenceErrors([
        {
          ...input,
          studies: [
            {
              ...study,
              phases: [{ ...firstPhase, toFrameId: "f2" }, secondPhase],
            },
          ],
        },
      ]),
    ).toContain(
      'motion reference study "study-main" phases must be contiguous; "phase-after" starts at overview index 2 after index 2.',
    );
  });

  it("rejects machine events without exactly one authored classification", () => {
    const input = createMotionReferenceInput();
    const study = input.studies[0];

    expect(
      getMotionReferenceErrors([
        { ...input, studies: [{ ...study, events: [] }] },
      ]),
    ).toContain(
      'motion reference study "study-main" evidence event "machine-retarget" must have exactly one authored event; found 0.',
    );
  });

  it("requires a non-empty reason for every nonproduct event", () => {
    const input = structuredClone(createMotionReferenceInput());
    Object.defineProperties(input.studies[0].events[0], {
      behaviorIds: { configurable: true, value: [] },
      classification: { configurable: true, value: "irrelevant-change" },
      reason: { configurable: true, value: "   " },
    });

    expect(getMotionReferenceErrors([input])).toContain(
      'motion reference study "study-main" event "event-retarget" classification "irrelevant-change" requires a non-empty reason.',
    );
  });

  it("requires every nonproduct event to have zero behavior ids", () => {
    const input = structuredClone(createMotionReferenceInput());
    Object.defineProperties(input.studies[0].events[0], {
      behaviorIds: { configurable: true, value: ["delayed-retarget"] },
      classification: { configurable: true, value: "irrelevant-change" },
      reason: {
        configurable: true,
        value: "The event is outside product scope.",
      },
    });

    expect(getMotionReferenceErrors([input])).toContain(
      'motion reference study "study-main" event "event-retarget" classification "irrelevant-change" must not cite behaviorIds.',
    );
  });

  it("rejects product events that cite unknown behavior ids", () => {
    const input = createMotionReferenceInput();
    const study = input.studies[0];

    expect(
      getMotionReferenceErrors([
        {
          ...input,
          studies: [
            {
              ...study,
              events: [
                {
                  behaviorIds: ["unknown-behavior"],
                  classification: "product-behavior",
                  evidenceEventId: "machine-retarget",
                  id: "event-retarget",
                },
              ],
            },
          ],
        },
      ]),
    ).toContain(
      'motion reference study "study-main" event "event-retarget" cites unknown behaviorId "unknown-behavior".',
    );
  });

  it("rejects timing claims owned by ordinal evidence", () => {
    expect(
      getMotionReferenceErrors([
        createMotionReferenceInput({
          studies: [createOrdinalMotionReferenceStudy()],
        }),
      ]),
    ).toContain(
      'motion reference behavior "delayed-retarget" timing claim "duration" must name a seconds-timed study; "study-main" is ordinal.',
    );
  });
});
