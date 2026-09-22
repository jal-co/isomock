function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function collectSuiteTitles(suite, parentTitles, collected) {
  const suiteTitles = suite.title ? [...parentTitles, suite.title] : parentTitles;
  for (const spec of suite.specs ?? []) {
    for (const playwrightTest of spec.tests ?? []) {
      const projectName = playwrightTest.projectName ?? "";
      const titlePath = [
        ...(projectName ? [`[${projectName}]`] : []),
        ...suiteTitles,
        spec.title,
      ];
      const grepTitle = [
        projectName,
        ...suiteTitles,
        spec.title,
        ...(spec.tags ?? []),
      ].join(" ");
      collected.push({
        fullTitle: titlePath.join(" › "),
        grepTitle,
        leafTitle: spec.title,
      });
    }
  }
  for (const childSuite of suite.suites ?? []) {
    collectSuiteTitles(childSuite, suiteTitles, collected);
  }
}

export function collectToolcraftPlaywrightTestTitles(report) {
  if (!report || typeof report !== "object" || !Array.isArray(report.suites)) {
    throw new Error("Playwright list report must contain a suites array.");
  }
  if (Array.isArray(report.errors) && report.errors.length > 0) {
    throw new Error("Playwright list report contains collection errors.");
  }
  const collected = [];
  for (const suite of report.suites) {
    collectSuiteTitles(suite, [], collected);
  }
  return collected.sort((left, right) =>
    compareCodeUnits(left.fullTitle, right.fullTitle),
  );
}

export function resolveToolcraftPlaywrightTestTitles(
  availableTitles,
  requestedTitles,
) {
  const selected = [];
  for (const requestedTitle of requestedTitles) {
    const fullMatches = availableTitles.filter(
      ({ fullTitle }) => fullTitle === requestedTitle,
    );
    const matches =
      fullMatches.length > 0
        ? fullMatches
        : availableTitles.filter(({ leafTitle }) => leafTitle === requestedTitle);
    if (matches.length === 0) {
      throw new Error(
        `Requested title "${requestedTitle}" did not match any Playwright test.`,
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `Requested title "${requestedTitle}" matched ${matches.length} Playwright tests; use one exact full title: ${matches.map(({ fullTitle }) => fullTitle).join(", ")}.`,
      );
    }
    if (selected.some(({ grepTitle }) => grepTitle === matches[0].grepTitle)) {
      throw new Error(
        `Playwright test "${matches[0].fullTitle}" was requested more than once.`,
      );
    }
    selected.push(matches[0]);
  }
  return selected;
}

export function getToolcraftPlaywrightExactGrepPattern(selections) {
  if (selections.length === 0) {
    throw new Error("At least one resolved Playwright test is required.");
  }
  return `^(?:${selections
    .map(({ grepTitle }) => escapeRegularExpression(grepTitle))
    .join("|")})$`;
}
