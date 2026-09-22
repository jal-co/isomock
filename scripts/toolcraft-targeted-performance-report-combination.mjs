import {
  TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_VERSION,
  createToolcraftTargetedPerformanceReport,
  getToolcraftTargetedPerformanceReportError,
} from "./toolcraft-targeted-performance-report.mjs";

const compare = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

function isCanonicalTargets(value, { allowEmpty = false } = {}) {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every(
      (item) =>
        typeof item === "string" &&
        item.length > 0 &&
        item.trim() === item,
    ) &&
    value.every(
      (item, index) => index === 0 || compare(value[index - 1], item) < 0,
    )
  );
}

export function combineToolcraftTargetedPerformanceReports({
  nonce,
  performancePassIds,
  reports,
  requestAuthorityHash,
  sourceHash,
}) {
  const canonicalPassIds = Array.isArray(performancePassIds)
    ? [...performancePassIds].sort(compare)
    : [];
  if (
    !isCanonicalTargets(canonicalPassIds, { allowEmpty: true }) ||
    !Array.isArray(reports) ||
    reports.length === 0 ||
    reports.some(
      (report) =>
        getToolcraftTargetedPerformanceReportError(report) ||
        report.version !== TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_VERSION ||
        report.performancePathIds.length !== 1 ||
        report.testNames.length !== 1 ||
        report.fixtureResolutionMode !== reports[0].fixtureResolutionMode ||
        report.fixtureSelector !== reports[0].fixtureSelector ||
        report.requestAuthorityHash !== requestAuthorityHash ||
        report.sourceHash !== sourceHash ||
        !isCanonicalTargets(report.performancePassIds, { allowEmpty: true }),
    )
  ) {
    throw new Error(
      "Toolcraft serial targeted performance reports are malformed or inconsistent.",
    );
  }
  const pathIds = reports.map((report) => report.performancePathIds[0]);
  const testNames = reports.map((report) => report.testNames[0]);
  const reportPassIds = [
    ...new Set(reports.flatMap((report) => report.performancePassIds)),
  ].sort(compare);
  if (!isCanonicalTargets(pathIds) || !isCanonicalTargets(testNames)) {
    throw new Error(
      "Toolcraft serial targeted performance reports are not in canonical planned order.",
    );
  }
  if (JSON.stringify(reportPassIds) !== JSON.stringify(canonicalPassIds)) {
    throw new Error(
      "Toolcraft serial targeted performance reports are malformed or inconsistent with the canonical planned pass union.",
    );
  }
  return createToolcraftTargetedPerformanceReport({
    fixtureResolutionMode: reports[0].fixtureResolutionMode,
    fixtureSelector: reports[0].fixtureSelector,
    measurements: reports.flatMap((report) => report.measurements),
    nonce,
    performancePassIds: canonicalPassIds,
    performancePathIds: pathIds,
    requestAuthorityHash,
    sourceHash,
    testNames,
  });
}
