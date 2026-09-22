import assert from "node:assert/strict";
import test from "node:test";

import {
  TOOLCRAFT_FEATURE_VERIFICATION_PLAN_VERSION,
  parseToolcraftFeatureVerificationPlanSource,
  validateToolcraftFeatureVerificationPlan,
} from "./toolcraft-feature-verification-plan.mjs";

const validPlan = () => ({
  acceptanceIds: ["material.layer"],
  scenarios: [
    {
      acceptanceIds: ["material.layer"],
      budget: "standard",
      file: "e2e/product-material.spec.ts",
      testName: "browser: material layer",
    },
  ],
  version: 2,
});

test("normalizes a canonical deeply frozen version-2 plan", () => {
  const validation = validateToolcraftFeatureVerificationPlan(validPlan());

  assert.deepEqual(validation.errors, []);
  assert.deepEqual(validation.plan, validPlan());
  assert.equal(TOOLCRAFT_FEATURE_VERIFICATION_PLAN_VERSION, 2);
  assert.equal(Object.isFrozen(validation.plan), true);
  assert.equal(Object.isFrozen(validation.plan.acceptanceIds), true);
  assert.equal(Object.isFrozen(validation.plan.scenarios), true);
  assert.equal(Object.isFrozen(validation.plan.scenarios[0]), true);
  assert.equal(Object.isFrozen(validation.plan.scenarios[0].acceptanceIds), true);
});

test("sorts scenarios deterministically by exact browser identity", () => {
  const validation = validateToolcraftFeatureVerificationPlan({
    acceptanceIds: ["Alpha", "zeta"],
    scenarios: [
      {
        acceptanceIds: ["zeta"],
        budget: "standard",
        file: "e2e/zeta.spec.ts",
        testName: "browser: zeta",
      },
      {
        acceptanceIds: ["Alpha"],
        budget: "standard",
        file: "e2e/alpha.spec.ts",
        testName: "browser: Alpha",
      },
    ],
    version: 2,
  });

  assert.deepEqual(
    validation.plan.scenarios.map(({ file }) => file),
    ["e2e/alpha.spec.ts", "e2e/zeta.spec.ts"],
  );
});

test("requires exact top-level and scenario keys and version 2", () => {
  for (const [value, pattern] of [
    [null, /must be a plain object/iu],
    [Object.create({ version: 2 }), /must be a plain object/iu],
    [{ ...validPlan(), extra: true }, /unknown fields: extra/iu],
    [{ acceptanceIds: [], scenarios: [] }, /missing required fields: version/iu],
    [{ ...validPlan(), version: 1 }, /version must be 2/iu],
    [
      {
        ...validPlan(),
        scenarios: [{ ...validPlan().scenarios[0], extra: true }],
      },
      /scenario 0.*unknown fields: extra/iu,
    ],
    [
      { ...validPlan(), scenarios: [{ acceptanceIds: ["material.layer"] }] },
      /scenario 0.*missing required fields/iu,
    ],
  ]) {
    assert.match(
      validateToolcraftFeatureVerificationPlan(value).errors.join("\n"),
      pattern,
    );
  }
});

test("requires sorted unique canonical acceptance memberships", () => {
  const symbolArray = ["material.layer"];
  symbolArray[Symbol("hidden")] = true;
  for (const [value, pattern] of [
    [{ ...validPlan(), acceptanceIds: [] }, /acceptanceIds must be non-empty/iu],
    [
      { ...validPlan(), acceptanceIds: ["material.layer", "material.layer"] },
      /acceptanceIds must contain unique/iu,
    ],
    [
      { ...validPlan(), acceptanceIds: [" material.layer"] },
      /acceptanceIds must contain trimmed/iu,
    ],
    [
      { ...validPlan(), acceptanceIds: ["zeta", "Alpha"] },
      /acceptanceIds must be sorted/iu,
    ],
    [{ ...validPlan(), acceptanceIds: symbolArray }, /symbol fields/iu],
    [
      {
        acceptanceIds: ["Alpha", "zeta"],
        scenarios: [
          { ...validPlan().scenarios[0], acceptanceIds: ["zeta", "Alpha"] },
        ],
        version: 2,
      },
      /scenario 0\.acceptanceIds must be sorted/iu,
    ],
  ]) {
    assert.match(
      validateToolcraftFeatureVerificationPlan(value).errors.join("\n"),
      pattern,
    );
  }
});

test("validates scenario file, budget, and title", () => {
  for (const [scenario, pattern] of [
    [{ ...validPlan().scenarios[0], budget: "slow" }, /budget/iu],
    [{ ...validPlan().scenarios[0], file: "app.spec.ts" }, /e2e/iu],
    [{ ...validPlan().scenarios[0], file: "nested/app.spec.ts" }, /e2e/iu],
    [{ ...validPlan().scenarios[0], file: "tests/app.spec.ts" }, /normalized/iu],
    [{ ...validPlan().scenarios[0], file: "e2e/../app.spec.ts" }, /normalized/iu],
    [{ ...validPlan().scenarios[0], testName: " " }, /testName.*non-blank/iu],
  ]) {
    assert.match(
      validateToolcraftFeatureVerificationPlan({
        ...validPlan(),
        scenarios: [scenario],
      }).errors.join("\n"),
      pattern,
    );
  }
});

test("requires an exact acceptance membership partition", () => {
  for (const [value, pattern] of [
    [
      {
        acceptanceIds: ["material.layer", "material.opacity"],
        scenarios: validPlan().scenarios,
        version: 2,
      },
      /material\.opacity.*exactly one scenario/iu,
    ],
    [
      {
        ...validPlan(),
        scenarios: [
          {
            ...validPlan().scenarios[0],
            acceptanceIds: ["material.layer", "material.opacity"],
          },
        ],
      },
      /outside.*material\.opacity/iu,
    ],
    [
      {
        ...validPlan(),
        scenarios: [validPlan().scenarios[0], validPlan().scenarios[0]],
      },
      /material\.layer.*exactly one scenario/iu,
    ],
  ]) {
    assert.match(
      validateToolcraftFeatureVerificationPlan(value).errors.join("\n"),
      pattern,
    );
  }
});

test("rejects conflicting or duplicate browser scenario identities", () => {
  const base = validPlan().scenarios[0];
  for (const [scenarios, pattern] of [
    [
      [base, { ...base, acceptanceIds: ["material.opacity"], file: "e2e/other.spec.ts" }],
      /test name.*different files/iu,
    ],
    [
      [base, { ...base, acceptanceIds: ["material.opacity"], budget: "extended-io" }],
      /identity.*conflicting budgets/iu,
    ],
    [
      [base, { ...base, acceptanceIds: ["material.opacity"] }],
      /duplicate scenario identity/iu,
    ],
  ]) {
    assert.match(
      validateToolcraftFeatureVerificationPlan({
        acceptanceIds: ["material.layer", "material.opacity"],
        scenarios,
        version: 2,
      }).errors.join("\n"),
      pattern,
    );
  }
});

test("parses exactly one validated JSON value", () => {
  const source = JSON.stringify(validPlan());
  assert.deepEqual(parseToolcraftFeatureVerificationPlanSource(source), validPlan());
  assert.deepEqual(
    parseToolcraftFeatureVerificationPlanSource(`\n ${source}\t`),
    validPlan(),
  );

  for (const [sourceValue, pattern] of [
    ["", /exactly one JSON value/iu],
    ["not-json", /valid JSON/iu],
    [`${source}\n${source}`, /exactly one JSON value/iu],
    [JSON.stringify({ ...validPlan(), version: 1 }), /version must be 2/iu],
  ]) {
    assert.throws(
      () => parseToolcraftFeatureVerificationPlanSource(sourceValue),
      pattern,
    );
  }
});
