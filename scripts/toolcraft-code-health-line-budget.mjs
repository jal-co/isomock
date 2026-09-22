export const defaultTestFilePatterns = [
  /\.test\.[cm]?[jt]sx?$/u,
  /\.spec\.[cm]?[jt]sx?$/u,
];

export function getLineCount(source) {
  if (source.length === 0) return 0;
  return source.replace(/(?:\r\n|\r|\n)$/u, "").split(/\r\n|\r|\n/u).length;
}

export function isTestFile(
  repoPath,
  testFilePatterns = defaultTestFilePatterns,
) {
  return matchesToolcraftPathPatterns(repoPath, testFilePatterns);
}

export function matchesToolcraftPathPatterns(repoPath, patterns) {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(repoPath);
  });
}

export function getLineBudgetViolations(
  repoPath,
  lineCount,
  {
    globalLineBudget,
    productionFile = false,
    scopedLineBudgets = [],
    testFilePatterns = defaultTestFilePatterns,
    testLineBudget,
  },
) {
  const violations = [];
  const testFile =
    !productionFile && isTestFile(repoPath, testFilePatterns);
  if (globalLineBudget && lineCount > globalLineBudget.maxLines) {
    violations.push({
      lineCount,
      maxLines: globalLineBudget.maxLines,
      reason: globalLineBudget.reason,
      repoPath,
      scope: "global",
    });
  }
  if (testLineBudget && testFile && lineCount > testLineBudget.maxLines) {
    violations.push({
      lineCount,
      maxLines: testLineBudget.maxLines,
      reason: testLineBudget.reason,
      repoPath,
      scope: "test-file",
    });
  }
  const scopedBudget = testFile ? undefined : scopedLineBudgets
    .filter(
      (budget) =>
        (budget.prefix && repoPath.startsWith(budget.prefix)) ||
        (budget.pathPattern &&
          matchesToolcraftPathPatterns(repoPath, [budget.pathPattern])),
    )
    .sort(
      (left, right) =>
        (right.priority ?? 0) - (left.priority ?? 0) ||
        (right.prefix?.length ?? 0) - (left.prefix?.length ?? 0) ||
        left.maxLines - right.maxLines,
    )[0];
  if (scopedBudget && lineCount > scopedBudget.maxLines) {
    violations.push({
      lineCount,
      maxLines: scopedBudget.maxLines,
      reason: scopedBudget.reason,
      repoPath,
      scope: scopedBudget.scope ?? scopedBudget.prefix ?? "path-pattern",
    });
  }
  return violations;
}
