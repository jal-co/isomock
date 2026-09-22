import { expect, test } from "@playwright/test";

import { assertToolcraftVideoPacketSchedule } from "./video-artifact-inspection";

const schedule = Object.freeze([
  Object.freeze({ durationSeconds: 1 / 30, index: 0, timeSeconds: 0 }),
  Object.freeze({ durationSeconds: 1 / 30, index: 1, timeSeconds: 1 / 30 }),
]);

test("accepts real packet timings that match the runtime schedule", () => {
  expect(() =>
    assertToolcraftVideoPacketSchedule({
      packetTimings: schedule,
      schedule,
      timeResolution: 90_000,
    }),
  ).not.toThrow();
});

test("rejects synthetic or dropped packet counts", () => {
  expect(() =>
    assertToolcraftVideoPacketSchedule({
      packetTimings: schedule.slice(0, 1),
      schedule,
      timeResolution: 90_000,
    }),
  ).toThrow("contains 1 packets; runtime scheduled 2");
});

test("rejects packet timestamps that do not match runtime time", () => {
  expect(() =>
    assertToolcraftVideoPacketSchedule({
      packetTimings: [
        schedule[0]!,
        { durationSeconds: 1 / 30, timeSeconds: 2 / 30 },
      ],
      schedule,
      timeResolution: 90_000,
    }),
  ).toThrow("packet 1 timestamp");
});

test("rejects packet durations that do not match runtime cadence", () => {
  expect(() =>
    assertToolcraftVideoPacketSchedule({
      packetTimings: [
        schedule[0]!,
        { durationSeconds: 2 / 30, timeSeconds: 1 / 30 },
      ],
      schedule,
      timeResolution: 90_000,
    }),
  ).toThrow("packet 1 duration");
});

test("rejects missing timing authority", () => {
  expect(() =>
    assertToolcraftVideoPacketSchedule({
      packetTimings: schedule,
      schedule,
      timeResolution: 0,
    }),
  ).toThrow("positive time resolution");
});
