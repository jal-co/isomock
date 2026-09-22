export const toolcraftBrowserProofBudgetValues = Object.freeze([
  "extended-io",
  "standard",
]);

export const TOOLCRAFT_BROWSER_PROOF_TIMEOUT_MS = Object.freeze({
  "extended-io": 120_000,
  standard: 30_000,
});

export function isToolcraftBrowserProofBudget(value) {
  return toolcraftBrowserProofBudgetValues.includes(value);
}

export function isToolcraftBrowserProofFile(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("e2e/") ||
    !value.endsWith(".spec.ts") ||
    value.includes("\\")
  ) {
    return false;
  }

  return value
    .split("/")
    .every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function isToolcraftBrowserProofTestName(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value
  );
}

const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

function freezeRelationEntries(entries) {
  return Object.freeze(
    entries.map((entry) => {
      for (const value of Object.values(entry)) {
        if (Array.isArray(value)) Object.freeze(value);
      }
      return Object.freeze(entry);
    }),
  );
}

function requireRelationalRow(row, index) {
  if (
    typeof row !== "object" ||
    row === null ||
    Array.isArray(row) ||
    !isToolcraftBrowserProofFile(row.file) ||
    !isToolcraftBrowserProofTestName(row.testName) ||
    (row.budget !== undefined && !isToolcraftBrowserProofBudget(row.budget))
  ) {
    throw new Error(
      `Toolcraft browser proof relational row ${index} must contain a canonical file, test name, and optional budget.`,
    );
  }
}

function getOrCreate(map, key, create) {
  const current = map.get(key);
  if (current !== undefined) return current;
  const value = create();
  map.set(key, value);
  return value;
}

export function validateToolcraftBrowserProofRelations(
  rows,
  { reservedTestNames = [] } = {},
) {
  if (!Array.isArray(rows) || !Array.isArray(reservedTestNames)) {
    throw new Error(
      "Toolcraft browser proof relational validation requires row and reserved-title arrays.",
    );
  }
  rows.forEach(requireRelationalRow);
  if (new Set(rows.map(({ budget }) => budget === undefined)).size > 1) {
    throw new Error(
      "Toolcraft browser proof relational rows must consistently include or omit budgets.",
    );
  }
  if (!reservedTestNames.every(isToolcraftBrowserProofTestName)) {
    throw new Error(
      "Toolcraft browser proof reserved test names must be trimmed non-blank strings.",
    );
  }

  const filesByTestName = new Map();
  const budgetsByFileAndTestName = new Map();
  const groupsByFileAndTestName = new Map();

  for (const [rowIndex, row] of rows.entries()) {
    getOrCreate(filesByTestName, row.testName, () => new Set()).add(row.file);

    const budgetsByTestName = getOrCreate(
      budgetsByFileAndTestName,
      row.file,
      () => new Map(),
    );
    if (row.budget !== undefined) {
      getOrCreate(budgetsByTestName, row.testName, () => new Set()).add(
        row.budget,
      );
    }

    const groupsByTestName = getOrCreate(
      groupsByFileAndTestName,
      row.file,
      () => new Map(),
    );
    const groupsByBudget = getOrCreate(
      groupsByTestName,
      row.testName,
      () => new Map(),
    );
    getOrCreate(groupsByBudget, row.budget, () => []).push(rowIndex);
  }

  const fileConflicts = [...filesByTestName]
    .filter(([, files]) => files.size > 1)
    .map(([testName, files]) => ({
      files: [...files].sort(compareCodeUnits),
      testName,
    }))
    .sort((left, right) => compareCodeUnits(left.testName, right.testName));
  const budgetConflicts = [];
  const groups = [];
  for (const [file, groupsByTestName] of groupsByFileAndTestName) {
    const budgetsByTestName = budgetsByFileAndTestName.get(file);
    for (const [testName, groupsByBudget] of groupsByTestName) {
      const budgets = budgetsByTestName?.get(testName);
      if (budgets !== undefined && budgets.size > 1) {
        budgetConflicts.push({
          budgets: [...budgets].sort(compareCodeUnits),
          file,
          testName,
        });
      }
      for (const [budget, rowIndexes] of groupsByBudget) {
        groups.push({ budget, file, rowIndexes: [...rowIndexes], testName });
      }
    }
  }
  const compareIdentity = (left, right) =>
    compareCodeUnits(left.file, right.file) ||
    compareCodeUnits(left.testName, right.testName) ||
    compareCodeUnits(left.budget ?? "", right.budget ?? "");
  budgetConflicts.sort(compareIdentity);
  groups.sort(compareIdentity);
  const duplicateIdentities = groups
    .filter(({ rowIndexes }) => rowIndexes.length > 1)
    .map((group) => ({
      ...group,
      count: group.rowIndexes.length,
    }));
  const reserved = new Set(reservedTestNames);
  const reservedTestNameCollisions = [...filesByTestName.keys()]
    .filter((testName) => reserved.has(testName))
    .sort(compareCodeUnits);

  return Object.freeze({
    budgetConflicts: freezeRelationEntries(budgetConflicts),
    duplicateIdentities: freezeRelationEntries(duplicateIdentities),
    fileConflicts: freezeRelationEntries(fileConflicts),
    groups: freezeRelationEntries(groups),
    reservedTestNameCollisions: Object.freeze(reservedTestNameCollisions),
  });
}
