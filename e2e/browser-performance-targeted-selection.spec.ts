import { expect, test } from "@playwright/test";
import type { ToolcraftPerformancePath } from "@/toolcraft/runtime";

import { fakeTestCase } from "./browser-runtime-evidence-reporter-test-fixtures";
import {
  evaluateToolcraftTargetedPerformanceSelection,
  type ToolcraftTargetedPerformanceReportTarget,
} from "./browser-performance-reporter-evaluation";
import { getToolcraftPerformancePathTestName } from "./performance-path-adapter-matrix";

function pathFixture(
  id: string,
  invalidates: readonly string[],
): ToolcraftPerformancePath {
  return {
    id,
    interaction: "control-change",
    invalidates,
    preparationInvalidates: [],
    profile: "interactive-discrete",
    retainedAccesses: [],
    runsOn: [],
    targets: [`target.${id}`],
    workloadDimensions: [],
  };
}

const compositePath = pathFixture("path-composite", ["composite"]);
const passlessPath = pathFixture("path-passless", []);
const canonicalPaths = [compositePath, passlessPath];

function target(
  pathIds: readonly string[],
  passIds: readonly string[],
): ToolcraftTargetedPerformanceReportTarget {
  return {
    fixtureResolutionMode: "strict-development",
    fixtureSelector: "development",
    nonce: "targeted-nonce",
    passIds,
    path: "/unused/report.json",
    pathIds,
    requestAuthorityHash: "b".repeat(64),
    sourceHash: "a".repeat(64),
  };
}

function evaluate(
  paths: readonly ToolcraftPerformancePath[],
  reportTarget: ToolcraftTargetedPerformanceReportTarget,
) {
  return evaluateToolcraftTargetedPerformanceSelection({
    canonicalPaths,
    expectedPaths: paths,
    selectedTests: paths.map((performancePath) =>
      fakeTestCase({ title: getToolcraftPerformancePathTestName(performancePath) }),
    ),
    target: reportTarget,
  });
}

test("targeted selection accepts an exact pass-bearing path tuple", () => {
  expect(
    evaluate([compositePath], target([compositePath.id], ["composite"])).errors,
  ).toEqual([]);
});

test("targeted selection keeps the signed path when one pass has several paths", () => {
  const sibling = pathFixture("path-composite-sibling", ["composite"]);
  const evaluation = evaluateToolcraftTargetedPerformanceSelection({
    canonicalPaths: [compositePath, sibling],
    expectedPaths: [compositePath],
    selectedTests: [
      fakeTestCase({ title: getToolcraftPerformancePathTestName(compositePath) }),
    ],
    target: target([compositePath.id], ["composite"]),
  });

  expect(evaluation.errors).toEqual([]);
  expect(evaluation.paths.map(({ id }) => id)).toEqual([compositePath.id]);
});

test("targeted selection accepts an exact passless path tuple", () => {
  expect(evaluate([passlessPath], target([passlessPath.id], [])).errors).toEqual(
    [],
  );
});

test("targeted selection rejects duplicate and unknown canonical path ids", () => {
  expect(
    evaluate(
      [compositePath],
      target([compositePath.id, compositePath.id], ["composite"]),
    ).errors.join("\n"),
  ).toMatch(/unique canonical path ids/iu);
  expect(
    evaluate([compositePath], target(["path-unknown"], ["composite"])).errors.join(
      "\n",
    ),
  ).toMatch(/unknown canonical paths/iu);
});

test("targeted selection rejects duplicate and unknown renderer pass ids", () => {
  expect(
    evaluate(
      [compositePath],
      target([compositePath.id], ["composite", "composite"]),
    ).errors.join("\n"),
  ).toMatch(/unique renderer pass ids/iu);
  expect(
    evaluate([compositePath], target([compositePath.id], ["unknown"])).errors.join(
      "\n",
    ),
  ).toMatch(/passes without canonical paths/iu);
});

test("targeted selection requires the exact union of selected path invalidations", () => {
  expect(
    evaluate([compositePath], target([compositePath.id], [])).errors.join("\n"),
  ).toMatch(/exactly match selected path invalidations/iu);
  expect(
    evaluate(
      [passlessPath],
      target([passlessPath.id], ["composite"]),
    ).errors.join("\n"),
  ).toMatch(/exactly match selected path invalidations/iu);
});

test("targeted selection rejects requestless or full-certification targets", () => {
  const valid = target([compositePath.id], ["composite"]);
  for (const invalid of [
    { ...valid, requestAuthorityHash: null },
    { ...valid, requestAuthorityHash: "not-a-hash" },
    {
      ...valid,
      fixtureResolutionMode: "full-certification",
      fixtureSelector: "maximum",
    },
  ]) {
    expect(
      evaluate(
        [compositePath],
        invalid as unknown as ToolcraftTargetedPerformanceReportTarget,
      ).errors.join("\n"),
    ).toMatch(/strict development fixtures.*canonical request authority/iu);
  }
});
