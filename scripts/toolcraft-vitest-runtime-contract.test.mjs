import assert from "node:assert/strict";
import test from "node:test";

import {
  TOOLCRAFT_VITEST_RUNTIME_ACCEPTANCE_SELECTION_ENV,
  TOOLCRAFT_VITEST_RUNTIME_MARKER_FILE_NAMES,
  TOOLCRAFT_VITEST_RUNTIME_REQUIREMENTS_ANNOTATION_TYPE,
  evaluateToolcraftVitestRuntimeEvidence,
  getToolcraftProductTestProcessArgs,
  getToolcraftProductTestProcessEnvironment,
  parseToolcraftVitestRuntimeAcceptanceSelection,
  parseToolcraftVitestRuntimeRequirements,
  selectToolcraftVitestRuntimeRequirements,
  serializeToolcraftVitestRuntimeAcceptanceSelection,
  serializeToolcraftVitestRuntimeRequirements,
} from "./toolcraft-vitest-runtime-contract.mjs";

const requirement = {
  kind: "acceptance",
  requirementId: "appearance.opacity",
  testName: "opacity changes product output",
};
const unrelatedRequirement = {
  kind: "acceptance",
  requirementId: "material.host",
  testName: "keeps the baseline material extension inactive",
};

function requiredTest(overrides = {}) {
  return {
    expectedFailure: false,
    filePath: "src/app/app-schema.test.ts",
    name: requirement.testName,
    owner: "product",
    state: "passed",
    ...overrides,
  };
}

test("product-test process args execute only planned files and gate runtime evidence on a planned marker", () => {
  assert.deepEqual(
    getToolcraftProductTestProcessArgs([
      "src/app/app-schema.test.ts",
      "src/features/focused-output.test.tsx",
    ]),
    [
      "run",
      "src/app/app-schema.test.ts",
      "src/features/focused-output.test.tsx",
      "--passWithNoTests",
      "--reporter=default",
    ],
  );

  for (const markerFileName of TOOLCRAFT_VITEST_RUNTIME_MARKER_FILE_NAMES) {
    const markerPath = `src/app/${markerFileName}`;
    assert.deepEqual(
      getToolcraftProductTestProcessArgs([
        markerPath,
        "src/app/app-schema.test.ts",
      ]),
      [
        "run",
        markerPath,
        "src/app/app-schema.test.ts",
        "--passWithNoTests",
        "--reporter=default",
        "--reporter=./scripts/toolcraft-vitest-runtime-evidence-reporter.mjs",
      ],
    );
  }
});

test("product-test process environment distinguishes full and targeted proof", () => {
  const inherited = {
    KEEP_ME: "yes",
    [TOOLCRAFT_VITEST_RUNTIME_ACCEPTANCE_SELECTION_ENV]: "forged",
  };
  const full = getToolcraftProductTestProcessEnvironment(null, inherited);
  const targeted = getToolcraftProductTestProcessEnvironment([], inherited);

  assert.deepEqual(full, { KEEP_ME: "yes" });
  assert.deepEqual(
    parseToolcraftVitestRuntimeAcceptanceSelection(
      targeted[TOOLCRAFT_VITEST_RUNTIME_ACCEPTANCE_SELECTION_ENV],
    ),
    [],
  );
  assert.equal(
    inherited[TOOLCRAFT_VITEST_RUNTIME_ACCEPTANCE_SELECTION_ENV],
    "forged",
  );
});

test("round-trips runtime requirements through a typed annotation", () => {
  assert.deepEqual(
    parseToolcraftVitestRuntimeRequirements({
      message: serializeToolcraftVitestRuntimeRequirements([requirement]),
      type: TOOLCRAFT_VITEST_RUNTIME_REQUIREMENTS_ANNOTATION_TYPE,
    }),
    [requirement],
  );
});

test("round-trips the protected canonical acceptance selection", () => {
  const serialized = serializeToolcraftVitestRuntimeAcceptanceSelection([
    "appearance.opacity",
  ]);

  assert.equal(
    TOOLCRAFT_VITEST_RUNTIME_ACCEPTANCE_SELECTION_ENV,
    "TOOLCRAFT_VITEST_RUNTIME_ACCEPTANCE_SELECTION",
  );
  assert.deepEqual(
    parseToolcraftVitestRuntimeAcceptanceSelection(serialized),
    ["appearance.opacity"],
  );
  assert.throws(
    () => serializeToolcraftVitestRuntimeAcceptanceSelection([
      "material.host",
      "appearance.opacity",
    ]),
    /sorted and unique/iu,
  );
  assert.throws(
    () => parseToolcraftVitestRuntimeAcceptanceSelection(
      '{"acceptanceIds":["appearance.opacity","appearance.opacity"],"version":1}',
    ),
    /sorted and unique/iu,
  );
  const sparse = [];
  sparse.length = 1;
  assert.throws(
    () => serializeToolcraftVitestRuntimeAcceptanceSelection(sparse),
    /sorted and unique/iu,
  );
});

test("selects only signed targeted acceptance requirements and fails closed", () => {
  const requirements = [requirement, unrelatedRequirement];

  assert.deepEqual(
    selectToolcraftVitestRuntimeRequirements(requirements, undefined),
    requirements,
  );
  assert.deepEqual(
    selectToolcraftVitestRuntimeRequirements(
      requirements,
      serializeToolcraftVitestRuntimeAcceptanceSelection([
        "appearance.opacity",
      ]),
    ),
    [requirement],
  );
  assert.throws(
    () => selectToolcraftVitestRuntimeRequirements(
      requirements,
      serializeToolcraftVitestRuntimeAcceptanceSelection([
        "reference.flash-events",
      ]),
    ),
    /unknown acceptance requirement.*reference\.flash-events/iu,
  );
});

test("a selected reference requirement still requires its exact product test", () => {
  const referenceRequirement = {
    kind: "acceptance",
    requirementId: "reference.flash-events",
    testName: "reference flash events change product output",
  };
  const selected = selectToolcraftVitestRuntimeRequirements(
    [referenceRequirement, unrelatedRequirement],
    serializeToolcraftVitestRuntimeAcceptanceSelection([
      "reference.flash-events",
    ]),
  );

  assert.match(
    evaluateToolcraftVitestRuntimeEvidence({
      requirements: selected,
      tests: [],
    })[0],
    /Missing required automated test.*reference flash events/iu,
  );
});

test("accepts one passed product-owned test", () => {
  assert.deepEqual(
    evaluateToolcraftVitestRuntimeEvidence({
      requirements: [requirement],
      tests: [requiredTest()],
    }),
    [],
  );
});

test("rejects missing, duplicate, framework-owned, and skipped tests", () => {
  assert.match(
    evaluateToolcraftVitestRuntimeEvidence({
      requirements: [requirement],
      tests: [],
    })[0],
    /Missing required automated test/u,
  );
  assert.match(
    evaluateToolcraftVitestRuntimeEvidence({
      requirements: [requirement],
      tests: [requiredTest(), requiredTest({ filePath: "src/product.test.ts" })],
    })[0],
    /Duplicate required automated test/u,
  );
  assert.match(
    evaluateToolcraftVitestRuntimeEvidence({
      requirements: [requirement],
      tests: [requiredTest({ owner: "framework" })],
    })[0],
    /Missing required automated test/u,
  );
  assert.match(
    evaluateToolcraftVitestRuntimeEvidence({
      requirements: [requirement],
      tests: [requiredTest({ state: "skipped" })],
    })[0],
    /must finish with status "passed"/u,
  );
});

test("rejects expected-failure tests even when Vitest reports them as passed", () => {
  assert.match(
    evaluateToolcraftVitestRuntimeEvidence({
      requirements: [requirement],
      tests: [requiredTest({ expectedFailure: true })],
    })[0],
    /must not use expected-failure mode/u,
  );
});
