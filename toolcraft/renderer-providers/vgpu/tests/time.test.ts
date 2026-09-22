import type { Clock } from "vgpu";
import { describe, expect, it, vi } from "vitest";

import {
  advanceToolcraftVgpuAutonomousClock,
  syncToolcraftVgpuClock,
} from "../../../../src/toolcraft/integrations/vgpu/index";

function createClockDouble() {
  return { advance: vi.fn() } as unknown as Clock;
}

describe("Toolcraft VGPU time", () => {
  it("advances from the prior submitted timeline baseline", () => {
    const clock = createClockDouble();

    expect(
      syncToolcraftVgpuClock(clock, {
        previousSeconds: 1.25,
        seconds: 1.5,
      }),
    ).toEqual({
      discontinuity: null,
      previousSeconds: 1.5,
      timelineSeconds: 1.5,
    });
    expect(clock.advance).toHaveBeenCalledWith(0.25);
  });

  it("uses zero for repeated time and starts a new baseline without wall time", () => {
    const clock = createClockDouble();

    expect(
      syncToolcraftVgpuClock(clock, {
        previousSeconds: null,
        seconds: 3,
      }),
    ).toEqual({
      discontinuity: null,
      previousSeconds: 3,
      timelineSeconds: 3,
    });
    expect(
      syncToolcraftVgpuClock(clock, {
        previousSeconds: 3,
        seconds: 3,
      }),
    ).toEqual({
      discontinuity: null,
      previousSeconds: 3,
      timelineSeconds: 3,
    });
    expect(clock.advance).toHaveBeenNthCalledWith(1, 0);
    expect(clock.advance).toHaveBeenNthCalledWith(2, 0);
  });

  it("reports a backward scrub while replacing the submitted baseline", () => {
    const clock = createClockDouble();

    const scrubbed = syncToolcraftVgpuClock(clock, {
      previousSeconds: 4,
      seconds: 1.5,
    });
    const resumed = syncToolcraftVgpuClock(clock, {
      previousSeconds: scrubbed.previousSeconds,
      seconds: 2,
    });

    expect(scrubbed).toEqual({
      discontinuity: "backward",
      previousSeconds: 1.5,
      timelineSeconds: 1.5,
    });
    expect(resumed).toEqual({
      discontinuity: null,
      previousSeconds: 2,
      timelineSeconds: 2,
    });
    expect(clock.advance).toHaveBeenNthCalledWith(1, 0);
    expect(clock.advance).toHaveBeenNthCalledWith(2, 0.5);
  });

  it("accumulates skipped preview time until a frame is submitted", () => {
    const clock = createClockDouble();

    const first = syncToolcraftVgpuClock(clock, {
      previousSeconds: null,
      seconds: 1,
    });
    const submittedAfterCoalescing = syncToolcraftVgpuClock(clock, {
      previousSeconds: first.previousSeconds,
      seconds: 1.75,
    });

    expect(submittedAfterCoalescing.timelineSeconds).toBe(1.75);
    expect(clock.advance).toHaveBeenNthCalledWith(2, 0.75);
    expect(clock.advance).toHaveBeenCalledTimes(2);
  });

  it("keeps autonomous deltas explicit and validates every clock input", () => {
    const clock = createClockDouble();

    advanceToolcraftVgpuAutonomousClock(clock, 1 / 60);
    expect(clock.advance).toHaveBeenCalledWith(1 / 60);

    for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        advanceToolcraftVgpuAutonomousClock(clock, invalid),
      ).toThrow(RangeError);
      expect(() =>
        syncToolcraftVgpuClock(clock, {
          previousSeconds: null,
          seconds: invalid,
        }),
      ).toThrow(RangeError);
      expect(() =>
        syncToolcraftVgpuClock(clock, {
          previousSeconds: invalid,
          seconds: 1,
        }),
      ).toThrow(RangeError);
    }
  });
});
