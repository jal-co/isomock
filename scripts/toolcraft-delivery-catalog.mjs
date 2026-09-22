import path from "node:path";

import {
  createToolcraftAcceptanceContractHash,
  deriveToolcraftAcceptanceDomainId,
} from "./toolcraft-functional-proof-primitives.mjs";
import {
  isToolcraftCanonicalCatalogFile,
  validateToolcraftDeliveryCatalog,
} from "./toolcraft-delivery-catalog-validation.mjs";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTrimmedString(value) {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

export function createToolcraftDeliveryCatalog({
  acceptance,
  availableTests,
  derivePerformancePaths,
  performance,
  performancePaths,
  rootDir,
  schema,
}) {
  const paths =
    performancePaths ??
    (typeof derivePerformancePaths === "function"
      ? derivePerformancePaths(schema, performance)
      : undefined);
  if (!Array.isArray(acceptance)) {
    throw new Error("Toolcraft acceptance input must be an array.");
  }
  if (!Array.isArray(paths)) {
    throw new Error("Canonical Toolcraft performance paths are required.");
  }
  if (!Array.isArray(availableTests)) {
    throw new Error("Toolcraft Playwright test metadata must be an array.");
  }
  const normalizedTests = availableTests.map((entry, index) => {
    if (
      !isRecord(entry) ||
      !isTrimmedString(entry.file) ||
      !isTrimmedString(entry.testName)
    ) {
      throw new Error(
        `Toolcraft Playwright test metadata at index ${index} is malformed.`,
      );
    }
    const file = path.isAbsolute(entry.file)
      ? path.relative(rootDir, entry.file).split(path.sep).join("/")
      : entry.file;
    if (!isToolcraftCanonicalCatalogFile(file)) {
      throw new Error(
        `Toolcraft Playwright test "${entry.testName}" must use a canonical app-root e2e/**/*.spec.ts file identity.`,
      );
    }
    return { file, testName: entry.testName };
  });
  const testsByIdentity = new Map();
  const testsByTitle = new Map();
  for (const entry of normalizedTests) {
    const identity = `${entry.file}\u0000${entry.testName}`;
    const identityMatches = testsByIdentity.get(identity) ?? [];
    identityMatches.push(entry);
    testsByIdentity.set(identity, identityMatches);
    const titleMatches = testsByTitle.get(entry.testName) ?? [];
    titleMatches.push(entry);
    testsByTitle.set(entry.testName, titleMatches);
  }
  const requireUniqueTestName = (testName) => {
    const matches = testsByTitle.get(testName) ?? [];
    if (matches.length === 0) {
      throw new Error(
        `Delivery catalog test "${testName}" is absent from the Playwright suite.`,
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `Delivery catalog test "${testName}" is ambiguous in the Playwright suite.`,
      );
    }
    return matches[0];
  };
  const requireExactAcceptanceTest = (file, testName) => {
    const matches = testsByIdentity.get(`${file}\u0000${testName}`) ?? [];
    if (matches.length === 0) {
      throw new Error(
        `Delivery catalog test "${testName}" is absent from its declared Playwright file "${file}".`,
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `Delivery catalog test "${testName}" appears ${matches.length} times in its declared Playwright file "${file}".`,
      );
    }
    return matches[0];
  };
  const catalogValue = {
    acceptance: acceptance
      .filter((entry) => entry.browser !== false)
      .map((entry) => {
        const matchedTest = requireExactAcceptanceTest(
          entry.browser.file,
          entry.browser.testName,
        );
        return {
          acceptanceId: entry.id,
          contractHash: createToolcraftAcceptanceContractHash(entry),
          domainId: deriveToolcraftAcceptanceDomainId(entry.id),
          file: matchedTest.file,
          testName: entry.browser.testName,
        };
      }),
    performance: paths.map((entry) => {
      const testName = `browser perf: toolcraft path ${entry.id}`;
      requireUniqueTestName(testName);
      return {
        passIds: [...entry.invalidates],
        pathId: entry.id,
        testName,
      };
    }),
    version: 2,
  };
  const validation = validateToolcraftDeliveryCatalog(catalogValue);
  if (validation.errors.length > 0) {
    throw new Error(validation.errors.join("\n"));
  }
  return validation.catalog;
}
