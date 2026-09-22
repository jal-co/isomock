export const TOOLCRAFT_VITEST_RUNTIME_EVIDENCE_VERSION = 1;
export const TOOLCRAFT_VITEST_RUNTIME_REQUIREMENTS_ANNOTATION_TYPE =
  "toolcraft.automated-runtime-requirements";
export const TOOLCRAFT_VITEST_RUNTIME_MARKER_TEST_NAME =
  "toolcraft: validate complete automated runtime coverage";
export const TOOLCRAFT_VITEST_RUNTIME_MARKER_FILE_NAMES = Object.freeze([
  "starter-automated-runtime-evidence.test.ts",
  "app-automated-runtime-evidence.test.ts",
]);
export const TOOLCRAFT_VITEST_RUNTIME_ACCEPTANCE_SELECTION_ENV =
  "TOOLCRAFT_VITEST_RUNTIME_ACCEPTANCE_SELECTION";
const TOOLCRAFT_VITEST_RUNTIME_EVIDENCE_REPORTER =
  "--reporter=./scripts/toolcraft-vitest-runtime-evidence-reporter.mjs";
const TOOLCRAFT_VITEST_RUNTIME_ACCEPTANCE_SELECTION_VERSION = 1;
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function getCanonicalAcceptanceIdsError(acceptanceIds) {
  if (
    !Array.isArray(acceptanceIds) ||
    Reflect.ownKeys(acceptanceIds).length !== acceptanceIds.length + 1 ||
    !Array.from(
      { length: acceptanceIds.length },
      (_, index) => Object.hasOwn(acceptanceIds, index),
    ).every(Boolean) ||
    acceptanceIds.some(
      (acceptanceId) =>
        typeof acceptanceId !== "string" ||
        acceptanceId.trim() !== acceptanceId ||
        acceptanceId.length === 0,
    ) ||
    acceptanceIds.some(
      (acceptanceId, index) =>
        index > 0 && compare(acceptanceIds[index - 1], acceptanceId) >= 0,
    )
  ) {
    return "Toolcraft runtime acceptance selection must be sorted and unique.";
  }
  return undefined;
}

export function getToolcraftProductTestProcessArgs(files) {
  const includesRuntimeMarker =
    TOOLCRAFT_VITEST_RUNTIME_MARKER_FILE_NAMES.some((fileName) =>
      files.includes(`src/app/${fileName}`),
    );
  return [
    "run",
    ...files,
    "--passWithNoTests",
    "--reporter=default",
    ...(includesRuntimeMarker
      ? [TOOLCRAFT_VITEST_RUNTIME_EVIDENCE_REPORTER]
      : []),
  ];
}

export function getToolcraftProductTestProcessEnvironment(
  acceptanceIds,
  inheritedEnvironment = process.env,
) {
  const environment = { ...inheritedEnvironment };
  if (acceptanceIds === null) {
    delete environment[TOOLCRAFT_VITEST_RUNTIME_ACCEPTANCE_SELECTION_ENV];
  } else {
    environment[TOOLCRAFT_VITEST_RUNTIME_ACCEPTANCE_SELECTION_ENV] =
      serializeToolcraftVitestRuntimeAcceptanceSelection(acceptanceIds);
  }
  return environment;
}

export function serializeToolcraftVitestRuntimeRequirements(requirements) {
  return JSON.stringify({
    requirements,
    version: TOOLCRAFT_VITEST_RUNTIME_EVIDENCE_VERSION,
  });
}

export function serializeToolcraftVitestRuntimeAcceptanceSelection(
  acceptanceIds,
) {
  const error = getCanonicalAcceptanceIdsError(acceptanceIds);
  if (error) throw new Error(error);
  return JSON.stringify({
    acceptanceIds,
    version: TOOLCRAFT_VITEST_RUNTIME_ACCEPTANCE_SELECTION_VERSION,
  });
}

export function parseToolcraftVitestRuntimeAcceptanceSelection(serialized) {
  let payload;
  try {
    payload = JSON.parse(serialized);
  } catch {
    throw new Error("Toolcraft runtime acceptance selection is malformed.");
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).length !== 2 ||
    !Object.hasOwn(payload, "acceptanceIds") ||
    !Object.hasOwn(payload, "version") ||
    payload.version !== TOOLCRAFT_VITEST_RUNTIME_ACCEPTANCE_SELECTION_VERSION
  ) {
    throw new Error("Toolcraft runtime acceptance selection is malformed.");
  }
  const error = getCanonicalAcceptanceIdsError(payload.acceptanceIds);
  if (error) throw new Error(error);
  return payload.acceptanceIds;
}

export function selectToolcraftVitestRuntimeRequirements(
  requirements,
  serializedSelection,
) {
  if (serializedSelection === undefined) return requirements;

  const acceptanceIds = parseToolcraftVitestRuntimeAcceptanceSelection(
    serializedSelection,
  );
  const acceptanceRequirements = new Map();
  for (const requirement of requirements) {
    if (requirement.kind !== "acceptance") continue;
    if (acceptanceRequirements.has(requirement.requirementId)) {
      throw new Error(
        `Duplicate Toolcraft acceptance requirement "${requirement.requirementId}".`,
      );
    }
    acceptanceRequirements.set(requirement.requirementId, requirement);
  }

  return acceptanceIds.map((acceptanceId) => {
    const requirement = acceptanceRequirements.get(acceptanceId);
    if (!requirement) {
      throw new Error(
        `Toolcraft runtime selection contains unknown acceptance requirement "${acceptanceId}".`,
      );
    }
    return requirement;
  });
}

export function parseToolcraftVitestRuntimeRequirements(annotation) {
  if (
    !annotation ||
    annotation.type !== TOOLCRAFT_VITEST_RUNTIME_REQUIREMENTS_ANNOTATION_TYPE
  ) {
    return undefined;
  }

  try {
    const payload = JSON.parse(annotation.message);
    if (
      payload?.version !== TOOLCRAFT_VITEST_RUNTIME_EVIDENCE_VERSION ||
      !Array.isArray(payload.requirements) ||
      payload.requirements.some(
        (requirement) =>
          !requirement ||
          !["acceptance", "performance"].includes(requirement.kind) ||
          typeof requirement.requirementId !== "string" ||
          !requirement.requirementId.trim() ||
          typeof requirement.testName !== "string" ||
          !requirement.testName.trim(),
      )
    ) {
      return undefined;
    }

    return payload.requirements;
  } catch {
    return undefined;
  }
}

export function evaluateToolcraftVitestRuntimeEvidence({ requirements, tests }) {
  const errors = [];

  for (const requirement of requirements) {
    const matchingTests = tests.filter(
      (test) =>
        test.owner === "product" && test.name === requirement.testName,
    );

    if (matchingTests.length === 0) {
      errors.push(
        `Missing required automated test "${requirement.testName}" for ${requirement.kind} requirement "${requirement.requirementId}".`,
      );
      continue;
    }

    if (matchingTests.length > 1) {
      errors.push(
        `Duplicate required automated test "${requirement.testName}" for ${requirement.kind} requirement "${requirement.requirementId}". Each requirement needs one product-owned test.`,
      );
      continue;
    }

    const [test] = matchingTests;
    if (test.expectedFailure) {
      errors.push(
        `Required automated test "${requirement.testName}" must not use expected-failure mode in ${test.filePath}.`,
      );
      continue;
    }
    if (test.state !== "passed") {
      errors.push(
        `Required automated test "${requirement.testName}" must finish with status "passed"; received "${test.state}" in ${test.filePath}.`,
      );
    }
  }

  return errors;
}
