import {
  isToolcraftBrowserProofBudget,
  isToolcraftBrowserProofFile,
  isToolcraftBrowserProofTestName,
  type ToolcraftBrowserProofBudget,
  validateToolcraftBrowserProofRelations,
} from "./browser-proof-policy.mjs";
import type { ToolcraftComponentAcceptance } from "./types";

export type ToolcraftFeatureBrowserScenario = Readonly<{
  acceptanceIds: readonly string[];
  budget: ToolcraftBrowserProofBudget;
  file: `e2e/${string}.spec.ts`;
  testName: string;
}>;

type CompiledBrowserProofCatalog = Readonly<{
  errors: readonly string[];
  scenarios: readonly ToolcraftFeatureBrowserScenario[];
}>;

const descriptorKeys = ["budget", "file", "testName"] as const;

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExtendedIoSemantics(entry: ToolcraftComponentAcceptance): boolean {
  return (
    ["exported-bytes", "media-lifecycle", "persistence-state"].includes(
      entry.evidence,
    ) ||
    entry.exportArtifactCoverage !== undefined ||
    entry.mediaLifecycleCoverage !== undefined ||
    entry.modelImportCoverage !== undefined ||
    entry.persistenceCoverage !== undefined
  );
}

function compileToolcraftBrowserProofCatalog(
  entries: readonly ToolcraftComponentAcceptance[],
): CompiledBrowserProofCatalog {
  const errors: string[] = [];
  const validRows: Array<{
    acceptanceId: string;
    budget: ToolcraftBrowserProofBudget;
    file: `e2e/${string}.spec.ts`;
    testName: string;
  }> = [];

  for (const [index, entry] of entries.entries()) {
    if (entry.browser === false) {
      continue;
    }

    const label = `Acceptance row "${entry.id || index}" browser proof`;
    const descriptor: unknown = entry.browser;
    if (!isRecord(descriptor)) {
      errors.push(`${label} must be false or an exact descriptor object.`);
      continue;
    }

    const actualKeys = Reflect.ownKeys(descriptor);
    const unknownKeys = actualKeys
      .filter(
        (key) =>
          typeof key !== "string" ||
          !descriptorKeys.includes(key as (typeof descriptorKeys)[number]),
      )
      .map(String)
      .sort(compareCodeUnits);
    const missingKeys = descriptorKeys.filter(
      (key) => !Object.prototype.hasOwnProperty.call(descriptor, key),
    );
    if (unknownKeys.length > 0) {
      errors.push(
        `${label} contains unknown descriptor keys: ${unknownKeys.join(", ")}.`,
      );
    }
    if (missingKeys.length > 0) {
      errors.push(
        `${label} is missing descriptor keys: ${missingKeys.join(", ")}.`,
      );
    }

    const { budget, file, testName } = descriptor;
    if (!isToolcraftBrowserProofBudget(budget)) {
      errors.push(`${label}.budget must be "extended-io" or "standard".`);
    }
    if (!isToolcraftBrowserProofFile(file)) {
      errors.push(
        `${label}.file must be a normalized POSIX relative e2e/**/*.spec.ts path.`,
      );
    }
    if (!isToolcraftBrowserProofTestName(testName)) {
      errors.push(`${label}.testName must be a trimmed non-blank string.`);
    }
    if (
      budget === "extended-io" &&
      !hasExtendedIoSemantics(entry)
    ) {
      errors.push(
        `${label} uses extended-io without matching semantic I/O evidence or export, media, model, or persistence coverage.`,
      );
    }

    if (
      unknownKeys.length === 0 &&
      missingKeys.length === 0 &&
      isToolcraftBrowserProofBudget(budget) &&
      isToolcraftBrowserProofFile(file) &&
      isToolcraftBrowserProofTestName(testName)
    ) {
      validRows.push({
        acceptanceId: entry.id,
        budget,
        file,
        testName,
      });
    }
  }

  const relations = validateToolcraftBrowserProofRelations(validRows);
  for (const { files, testName } of relations.fileConflicts) {
    errors.push(
      `Browser proof test name "${testName}" points to different files: ${files.join(", ")}.`,
    );
  }
  for (const { budgets, file, testName } of relations.budgetConflicts) {
    errors.push(
      `Browser proof identity "${file}" / "${testName}" has conflicting budgets: ${budgets.join(", ")}.`,
    );
  }

  const scenarios = relations.groups
    .map(
      ({
        budget,
        file,
        rowIndexes,
        testName,
      }): ToolcraftFeatureBrowserScenario =>
        Object.freeze({
          acceptanceIds: Object.freeze(
            [
              ...new Set(
                rowIndexes.map((rowIndex) => validRows[rowIndex].acceptanceId),
              ),
            ].sort(compareCodeUnits),
          ),
          budget,
          file,
          testName,
        }),
    )
    .sort(
      (left, right) =>
        compareCodeUnits(left.file, right.file) ||
        compareCodeUnits(left.testName, right.testName) ||
        compareCodeUnits(left.budget, right.budget),
    );

  return Object.freeze({
    errors: Object.freeze([...errors].sort(compareCodeUnits)),
    scenarios: Object.freeze(scenarios),
  });
}

export function getToolcraftBrowserProofErrors(
  entries: readonly ToolcraftComponentAcceptance[],
): readonly string[] {
  return compileToolcraftBrowserProofCatalog(entries).errors;
}

export function groupToolcraftBrowserProofScenarios(
  entries: readonly ToolcraftComponentAcceptance[],
): readonly ToolcraftFeatureBrowserScenario[] {
  const catalog = compileToolcraftBrowserProofCatalog(entries);
  if (catalog.errors.length > 0) {
    throw new Error(catalog.errors.join("\n"));
  }
  return catalog.scenarios;
}

export function getToolcraftBrowserProofBudgetForTestName(
  entries: readonly ToolcraftComponentAcceptance[],
  testName: string,
): ToolcraftBrowserProofBudget {
  const catalog = compileToolcraftBrowserProofCatalog(entries);
  if (catalog.errors.length > 0) {
    throw new Error(catalog.errors.join("\n"));
  }
  return (
    catalog.scenarios.find((scenario) => scenario.testName === testName)
      ?.budget ?? "standard"
  );
}
