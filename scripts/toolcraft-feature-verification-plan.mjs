import {
  isToolcraftBrowserProofBudget,
  isToolcraftBrowserProofFile,
  isToolcraftBrowserProofTestName,
  validateToolcraftBrowserProofRelations,
} from "../src/app/acceptance/browser-proof-policy.mjs";

export const TOOLCRAFT_FEATURE_VERIFICATION_PLAN_VERSION = 2;

const planKeys = ["acceptanceIds", "scenarios", "version"];
const scenarioKeys = ["acceptanceIds", "budget", "file", "testName"];
const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

function isPlainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function getExactKeyErrors(value, expected, label) {
  if (!isPlainObject(value)) return [`${label} must be a plain object.`];
  const expectedSet = new Set(expected);
  const ownKeys = Reflect.ownKeys(value);
  const unknown = ownKeys
    .filter((key) => typeof key !== "string" || !expectedSet.has(key))
    .map(String)
    .sort(compareCodeUnits);
  const missing = expected.filter(
    (key) => !Object.prototype.hasOwnProperty.call(value, key),
  );
  return [
    ...(unknown.length > 0
      ? [`${label} contains unknown fields: ${unknown.join(", ")}.`]
      : []),
    ...(missing.length > 0
      ? [`${label} is missing required fields: ${missing.join(", ")}.`]
      : []),
  ];
}

function validateCanonicalStringArray(value, label) {
  if (!Array.isArray(value)) {
    return [`${label} must be an array.`];
  }
  const errors = [];
  if (Object.getOwnPropertySymbols(value).length > 0) {
    errors.push(`${label} contains symbol fields.`);
  }
  if (value.length === 0) errors.push(`${label} must be non-empty.`);
  if (
    !value.every(
      (entry) =>
        typeof entry === "string" &&
        entry.length > 0 &&
        entry.trim() === entry,
    )
  ) {
    errors.push(`${label} must contain trimmed non-empty strings.`);
  }
  if (new Set(value).size !== value.length) {
    errors.push(`${label} must contain unique values.`);
  }
  if (
    value.every((entry) => typeof entry === "string") &&
    value.some(
      (entry, index) =>
        entry !== [...value].sort(compareCodeUnits)[index],
    )
  ) {
    errors.push(`${label} must be sorted by code unit.`);
  }
  return errors;
}

function validateScenario(value, index) {
  const label = `Toolcraft feature verification plan scenario ${index}`;
  const errors = getExactKeyErrors(value, scenarioKeys, label);
  if (!isPlainObject(value)) return { errors };

  errors.push(
    ...validateCanonicalStringArray(
      value.acceptanceIds,
      `${label}.acceptanceIds`,
    ),
  );
  if (!isToolcraftBrowserProofBudget(value.budget)) {
    errors.push(`${label}.budget must be "extended-io" or "standard".`);
  }
  if (!isToolcraftBrowserProofFile(value.file)) {
    errors.push(
      `${label}.file must be a normalized POSIX relative e2e/**/*.spec.ts path.`,
    );
  }
  if (!isToolcraftBrowserProofTestName(value.testName)) {
    errors.push(`${label}.testName must be a trimmed non-blank string.`);
  }

  if (
    errors.length === 0 &&
    Array.isArray(value.acceptanceIds) &&
    isToolcraftBrowserProofBudget(value.budget) &&
    isToolcraftBrowserProofFile(value.file) &&
    isToolcraftBrowserProofTestName(value.testName)
  ) {
    return {
      errors,
      scenario: {
        acceptanceIds: [...value.acceptanceIds],
        budget: value.budget,
        file: value.file,
        testName: value.testName,
      },
    };
  }
  return { errors };
}

function getMembershipErrors(acceptanceIds, scenarios) {
  if (!Array.isArray(acceptanceIds)) return [];
  const topLevelIds = new Set(
    acceptanceIds.filter((value) => typeof value === "string"),
  );
  const membershipCounts = new Map();
  const outsideIds = new Set();

  for (const scenario of scenarios) {
    for (const id of scenario.acceptanceIds) {
      if (!topLevelIds.has(id)) outsideIds.add(id);
      membershipCounts.set(id, (membershipCounts.get(id) ?? 0) + 1);
    }
  }

  const errors = [];
  if (outsideIds.size > 0) {
    errors.push(
      `Toolcraft feature verification plan scenario memberships contain ids outside top-level acceptanceIds: ${[...outsideIds].sort(compareCodeUnits).join(", ")}.`,
    );
  }
  for (const id of [...topLevelIds].sort(compareCodeUnits)) {
    if (membershipCounts.get(id) !== 1) {
      errors.push(
        `Toolcraft feature verification plan acceptance id "${id}" must appear in exactly one scenario membership.`,
      );
    }
  }
  return errors;
}

function getIdentityErrors(scenarios) {
  const relations = validateToolcraftBrowserProofRelations(scenarios);
  const errors = [];
  for (const { files, testName } of relations.fileConflicts) {
    errors.push(
      `Browser scenario test name "${testName}" points to different files: ${files.join(", ")}.`,
    );
  }
  for (const { budgets, file, testName } of relations.budgetConflicts) {
    errors.push(
      `Browser scenario identity "${file}" / "${testName}" has conflicting budgets: ${budgets.join(", ")}.`,
    );
  }
  for (const { budget, file, testName } of relations.duplicateIdentities) {
    errors.push(
      `Browser plan contains duplicate scenario identity "${file}" / "${testName}" / "${budget}".`,
    );
  }
  return errors;
}

function freezePlan(acceptanceIds, scenarios) {
  const frozenScenarios = scenarios
    .map((scenario) =>
      Object.freeze({
        acceptanceIds: Object.freeze([...scenario.acceptanceIds]),
        budget: scenario.budget,
        file: scenario.file,
        testName: scenario.testName,
      }),
    )
    .sort(
      (left, right) =>
        compareCodeUnits(left.file, right.file) ||
        compareCodeUnits(left.testName, right.testName) ||
        compareCodeUnits(left.budget, right.budget),
    );
  return Object.freeze({
    acceptanceIds: Object.freeze([...acceptanceIds]),
    scenarios: Object.freeze(frozenScenarios),
    version: TOOLCRAFT_FEATURE_VERIFICATION_PLAN_VERSION,
  });
}

export function validateToolcraftFeatureVerificationPlan(value) {
  const errors = getExactKeyErrors(
    value,
    planKeys,
    "Toolcraft feature verification plan",
  );
  if (!isPlainObject(value)) {
    return Object.freeze({ errors: Object.freeze(errors.sort(compareCodeUnits)) });
  }

  if (value.version !== TOOLCRAFT_FEATURE_VERIFICATION_PLAN_VERSION) {
    errors.push(
      `Toolcraft feature verification plan.version must be ${TOOLCRAFT_FEATURE_VERIFICATION_PLAN_VERSION}.`,
    );
  }
  errors.push(
    ...validateCanonicalStringArray(
      value.acceptanceIds,
      "Toolcraft feature verification plan.acceptanceIds",
    ),
  );
  if (!Array.isArray(value.scenarios)) {
    errors.push("Toolcraft feature verification plan.scenarios must be an array.");
  } else {
    if (Object.getOwnPropertySymbols(value.scenarios).length > 0) {
      errors.push("Toolcraft feature verification plan.scenarios contains symbol fields.");
    }
    if (value.scenarios.length === 0) {
      errors.push("Toolcraft feature verification plan.scenarios must be non-empty.");
    }
  }

  const scenarioResults = Array.isArray(value.scenarios)
    ? value.scenarios.map(validateScenario)
    : [];
  for (const result of scenarioResults) errors.push(...result.errors);
  const validScenarios = scenarioResults.flatMap(({ scenario }) =>
    scenario ? [scenario] : [],
  );
  if (validScenarios.length === scenarioResults.length) {
    errors.push(
      ...getMembershipErrors(value.acceptanceIds, validScenarios),
      ...getIdentityErrors(validScenarios),
    );
  }

  const frozenErrors = Object.freeze([...errors].sort(compareCodeUnits));
  if (frozenErrors.length > 0) return Object.freeze({ errors: frozenErrors });

  return Object.freeze({
    errors: frozenErrors,
    plan: freezePlan(value.acceptanceIds, validScenarios),
  });
}

function assertValidPlan(value) {
  const validation = validateToolcraftFeatureVerificationPlan(value);
  if (validation.errors.length > 0) {
    throw new Error(
      `Invalid Toolcraft feature verification plan:\n${validation.errors.join("\n")}`,
    );
  }
  return validation.plan;
}

export function parseToolcraftFeatureVerificationPlanSource(source) {
  if (typeof source !== "string" || source.trim().length === 0) {
    throw new Error(
      "Toolcraft feature verification plan source must contain exactly one JSON value.",
    );
  }
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new Error(
      "Toolcraft feature verification plan source must contain valid JSON as exactly one JSON value.",
      { cause: error },
    );
  }
  return assertValidPlan(value);
}
