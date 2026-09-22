import { expect, test } from "@playwright/test";

import type { ToolcraftPerformanceCompiledFixturePlan } from "@/toolcraft/runtime";

import {
  TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR_ENV,
  TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV,
  TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH_ENV,
  readToolcraftPerformanceFixtureResolutionMode,
  readToolcraftPerformanceFixtureSelector,
  resolveToolcraftPerformanceFixtureSelector,
} from "./performance-fixture-selection";

const availablePlan = {
  development: {
    checkpoint: {
      kind: "development",
      normalizedPressure: 0.8,
      values: { count: 80 },
    },
    status: "available",
  },
  dimensionIds: ["count"],
  kind: "interactive",
  maximum: {
    kind: "interactive-max",
    normalizedPressure: 1,
    values: { count: 100 },
  },
  pathId: "performance-path:fixture-selection",
} as const satisfies ToolcraftPerformanceCompiledFixturePlan;

const unavailablePlan = {
  ...availablePlan,
  development: {
    reason: "No exact reachable vector has normalized pressure 0.8.",
    status: "unavailable",
  },
} as const satisfies ToolcraftPerformanceCompiledFixturePlan;

test("targeted fixture selection defaults to development", () => {
  expect(readToolcraftPerformanceFixtureSelector({})).toBe("development");
  expect(
    readToolcraftPerformanceFixtureSelector({
      [TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR_ENV]: "maximum",
    }),
  ).toBe("maximum");
});

test("measured fixture resolution requires an explicit mode", () => {
  expect(() =>
    readToolcraftPerformanceFixtureResolutionMode({}),
  ).toThrow(/must be strict-development or full-certification/iu);
  expect(() =>
    resolveToolcraftPerformanceFixtureSelector(availablePlan, "development"),
  ).toThrow(/must be strict-development or full-certification/iu);
  expect(() =>
    readToolcraftPerformanceFixtureResolutionMode({
      [TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV]:
        "strict-development",
    }),
  ).toThrow(/requires canonical request authority/iu);
  expect(
    readToolcraftPerformanceFixtureResolutionMode({
      [TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV]:
        "strict-development",
      [TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH_ENV]:
        "a".repeat(64),
    }),
  ).toBe("strict-development");
});

test("strict development fixture selection never falls back to maximum", () => {
  expect(
    resolveToolcraftPerformanceFixtureSelector(
      availablePlan,
      "development",
      { mode: "strict-development" },
    ),
  ).toBe("development");
  expect(() =>
    resolveToolcraftPerformanceFixtureSelector(
      unavailablePlan,
      "development",
      { mode: "strict-development" },
    ),
  ).toThrow(
    /performance-path:fixture-selection.*reachable bounded development fixture.*No exact reachable vector/iu,
  );
  expect(() =>
    resolveToolcraftPerformanceFixtureSelector(
      availablePlan,
      "maximum",
      { mode: "strict-development" },
    ),
  ).toThrow(/strict development fixture mode.*cannot select maximum/iu);
});

test("full certification explicitly selects only the maximum fixture", () => {
  expect(
    resolveToolcraftPerformanceFixtureSelector(
      unavailablePlan,
      "maximum",
      { mode: "full-certification" },
    ),
  ).toBe("maximum");
  expect(() =>
    resolveToolcraftPerformanceFixtureSelector(
      availablePlan,
      "development",
      { mode: "full-certification" },
    ),
  ).toThrow(/full certification.*requires maximum/iu);
});

test("protected iteration environment requires reachable development", () => {
  const previous =
    process.env[TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV];
  const previousAuthority =
    process.env[TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH_ENV];
  process.env[TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV] =
    "strict-development";
  process.env[TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH_ENV] =
    "a".repeat(64);
  try {
    expect(() =>
      resolveToolcraftPerformanceFixtureSelector(
        unavailablePlan,
        "development",
      ),
    ).toThrow(/requires a reachable bounded development fixture/iu);
    expect(
      resolveToolcraftPerformanceFixtureSelector(
        availablePlan,
        "development",
      ),
    ).toBe("development");
  } finally {
    if (previous === undefined) {
      delete process.env[TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV];
    } else {
      process.env[TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV] = previous;
    }
    if (previousAuthority === undefined) {
      delete process.env[
        TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH_ENV
      ];
    } else {
      process.env[
        TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH_ENV
      ] = previousAuthority;
    }
  }
});

test("fixture selection rejects unknown modes", () => {
  expect(() =>
    readToolcraftPerformanceFixtureSelector({
      [TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR_ENV]: "fast-ish",
    }),
  ).toThrow(/must be development or maximum/u);
  expect(() =>
    readToolcraftPerformanceFixtureResolutionMode({
      [TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV]: "default",
    }),
  ).toThrow(/must be strict-development or full-certification/iu);
});
