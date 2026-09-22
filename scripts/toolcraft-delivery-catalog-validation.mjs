import { decodeToolcraftPerformancePathId } from "../src/toolcraft/runtime/testing/performance-path-codec.mjs";
import {
  isToolcraftBrowserProofFile,
  validateToolcraftBrowserProofRelations,
} from "../src/app/acceptance/browser-proof-policy.mjs";

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasSymbolKeys(value) {
  return Object.getOwnPropertySymbols(value).length > 0;
}

export function isToolcraftCanonicalCatalogFile(value) {
  return isToolcraftBrowserProofFile(value);
}

function isTrimmedString(value) {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(compareCodeUnits);
}

function exactKeys(value, expected, label, errors) {
  const expectedSet = new Set(expected);
  const unknown = Reflect.ownKeys(value)
    .filter((key) => typeof key !== "string" || !expectedSet.has(key))
    .map(String)
    .sort(compareCodeUnits);
  const missing = expected.filter(
    (key) => !Object.prototype.hasOwnProperty.call(value, key),
  );
  if (unknown.length > 0) {
    errors.push(`${label} contains unknown fields: ${unknown.join(", ")}.`);
  }
  if (missing.length > 0) {
    errors.push(`${label} is missing required fields: ${missing.join(", ")}.`);
  }
}

function normalizeCatalogAcceptance(value, index, errors) {
  const label = `Delivery catalog acceptance row at index ${index}`;
  if (!isRecord(value)) {
    errors.push(`${label} must be an object.`);
    return undefined;
  }
  exactKeys(
    value,
    ["acceptanceId", "contractHash", "domainId", "file", "testName"],
    label,
    errors,
  );
  for (const key of ["acceptanceId", "domainId", "file", "testName"]) {
    if (!isTrimmedString(value[key])) {
      errors.push(`${label}.${key} must be a trimmed string.`);
    }
  }
  const expectedDomain = isTrimmedString(value.acceptanceId)
    ? value.acceptanceId.split(".")[0]
    : undefined;
  if (!isTrimmedString(expectedDomain) || value.domainId !== expectedDomain) {
    errors.push(`${label}.domainId must equal its acceptance id namespace.`);
  }
  if (!/^[a-f0-9]{64}$/u.test(value.contractHash)) {
    errors.push(`${label}.contractHash must be a lowercase SHA-256 hash.`);
  }
  if (
    isTrimmedString(value.file) &&
    !isToolcraftCanonicalCatalogFile(value.file)
  ) {
    errors.push(
      `${label}.file must be a canonical app-root e2e/**/*.spec.ts path.`,
    );
  }
  if (
    ![value.acceptanceId, value.domainId, value.file, value.testName].every(
      isTrimmedString,
    ) ||
    !isToolcraftCanonicalCatalogFile(value.file)
  ) {
    return undefined;
  }
  return Object.freeze({
    acceptanceId: value.acceptanceId,
    contractHash: value.contractHash,
    domainId: value.domainId,
    file: value.file,
    testName: value.testName,
  });
}

function normalizeCatalogPerformance(value, index, errors) {
  const label = `Delivery catalog performance row at index ${index}`;
  if (!isRecord(value)) {
    errors.push(`${label} must be an object.`);
    return undefined;
  }
  exactKeys(value, ["passIds", "pathId", "testName"], label, errors);
  if (Array.isArray(value.passIds) && hasSymbolKeys(value.passIds)) {
    errors.push(`${label}.passIds contains symbol fields.`);
  }
  if (
    !Array.isArray(value.passIds) ||
    !value.passIds.every(isTrimmedString) ||
    new Set(value.passIds).size !== value.passIds.length
  ) {
    errors.push(`${label}.passIds must be a unique string array.`);
    return undefined;
  }
  if (!isTrimmedString(value.pathId)) {
    errors.push(`${label}.pathId must be a trimmed string.`);
  }
  if (!isTrimmedString(value.testName)) {
    errors.push(`${label}.testName must be a trimmed string.`);
  }
  const signature = decodeToolcraftPerformancePathId(value.pathId);
  if (!signature) {
    errors.push(`${label}.pathId is a malformed canonical path.`);
  } else if (
    JSON.stringify(uniqueSorted(value.passIds)) !==
    JSON.stringify(uniqueSorted(signature.invalidates))
  ) {
    errors.push(
      `${label}.passIds does not match the invalidated passes encoded by its path.`,
    );
  }
  if (
    isTrimmedString(value.pathId) &&
    value.testName !== `browser perf: toolcraft path ${value.pathId}`
  ) {
    errors.push(`${label}.testName must name its exact canonical path.`);
  }
  if (!isTrimmedString(value.pathId) || !isTrimmedString(value.testName)) {
    return undefined;
  }
  return Object.freeze({
    passIds: Object.freeze(uniqueSorted(value.passIds)),
    pathId: value.pathId,
    testName: value.testName,
  });
}

function addDuplicateErrors(rows, key, label, errors) {
  const counts = new Map();
  for (const row of rows) {
    counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
  }
  for (const [value, count] of [...counts].sort(([left], [right]) =>
    compareCodeUnits(left, right),
  )) {
    if (count > 1) {
      errors.push(`Delivery catalog has duplicate ${label} "${value}".`);
    }
  }
}

function addCatalogTestIdentityErrors(acceptance, performance, errors) {
  const relations = validateToolcraftBrowserProofRelations(acceptance, {
    reservedTestNames: performance.map(({ testName }) => testName),
  });
  for (const { files, testName } of relations.fileConflicts) {
    errors.push(
      `Delivery catalog acceptance test name "${testName}" points to different files: ${files.join(", ")}.`,
    );
  }
  for (const testName of relations.reservedTestNameCollisions) {
    errors.push(
      `Delivery catalog acceptance/performance test name collision: "${testName}".`,
    );
  }
}

export function validateToolcraftDeliveryCatalog(value) {
  const errors = [];
  if (!isRecord(value)) {
    return { errors: ["Delivery catalog must be an object."] };
  }
  exactKeys(
    value,
    ["acceptance", "performance", "version"],
    "Delivery catalog",
    errors,
  );
  if (value.version !== 2) {
    errors.push("Delivery catalog.version must be 2.");
  }
  if (!Array.isArray(value.acceptance)) {
    errors.push("Delivery catalog.acceptance must be an array.");
  }
  if (!Array.isArray(value.performance)) {
    errors.push("Delivery catalog.performance must be an array.");
  }
  if (Array.isArray(value.acceptance) && hasSymbolKeys(value.acceptance)) {
    errors.push("Delivery catalog.acceptance contains symbol fields.");
  }
  if (Array.isArray(value.performance) && hasSymbolKeys(value.performance)) {
    errors.push("Delivery catalog.performance contains symbol fields.");
  }
  if (!Array.isArray(value.acceptance) || !Array.isArray(value.performance)) {
    return { errors };
  }
  const acceptance = value.acceptance.flatMap((row, index) => {
    const normalized = normalizeCatalogAcceptance(row, index, errors);
    return normalized ? [normalized] : [];
  });
  const performance = value.performance.flatMap((row, index) => {
    const normalized = normalizeCatalogPerformance(row, index, errors);
    return normalized ? [normalized] : [];
  });
  addDuplicateErrors(acceptance, "acceptanceId", "acceptance id", errors);
  addDuplicateErrors(performance, "pathId", "performance path id", errors);
  addCatalogTestIdentityErrors(acceptance, performance, errors);
  const domainsByFile = new Map();
  for (const row of acceptance) {
    if (!domainsByFile.has(row.file)) {
      domainsByFile.set(row.file, new Set());
    }
    domainsByFile.get(row.file).add(row.domainId);
  }
  for (const [file, domains] of domainsByFile) {
    if (domains.size > 1) {
      errors.push(
        `Delivery catalog browser file "${file}" contains acceptance domains ${[...domains].sort(compareCodeUnits).join(", ")}; each file must contain one acceptance domain.`,
      );
    }
  }
  return {
    errors,
    ...(errors.length === 0
      ? {
          catalog: Object.freeze({
            acceptance: Object.freeze(
              [...acceptance].sort((left, right) =>
                compareCodeUnits(left.acceptanceId, right.acceptanceId),
              ),
            ),
            performance: Object.freeze(
              [...performance].sort((left, right) =>
                compareCodeUnits(left.pathId, right.pathId),
              ),
            ),
            version: 2,
          }),
        }
      : {}),
  };
}
