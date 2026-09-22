import { defineConfig, devices } from "@playwright/test";

import { findAvailablePort, readPreferredPort } from "./scripts/toolcraft-port.mjs";
import { parseToolcraftFeatureVerificationPlanSource } from "./scripts/toolcraft-feature-verification-plan.mjs";

const resolvedTestPortEnvName = "TOOLCRAFT_RESOLVED_TEST_PORT";
const resolvedTestPort = Number(process.env[resolvedTestPortEnvName]);
const preferredTestPort = readPreferredPort([
  resolvedTestPortEnvName,
  "TOOLCRAFT_TEST_PORT",
  "TOOLCRAFT_PORT",
  "PORT",
]);
const testPort =
  Number.isInteger(resolvedTestPort) && resolvedTestPort > 0 && resolvedTestPort <= 65_535
    ? resolvedTestPort
    : await findAvailablePort(preferredTestPort);
const testBaseUrl = `http://localhost:${testPort}`;
const browserServerMode =
  process.env.TOOLCRAFT_BROWSER_SERVER_MODE === "preview" ? "preview" : "dev";
const featureVerificationPlanSource =
  process.env.TOOLCRAFT_FEATURE_VERIFICATION_PLAN;
if (featureVerificationPlanSource !== undefined) {
  parseToolcraftFeatureVerificationPlanSource(featureVerificationPlanSource);
}
const browserExecutionLedgerValues = {
  directory: process.env.TOOLCRAFT_BROWSER_EXECUTION_LEDGER_DIRECTORY,
  nonce: process.env.TOOLCRAFT_BROWSER_EXECUTION_LEDGER_NONCE,
};
const hasAnyBrowserExecutionLedgerValue =
  Object.values(browserExecutionLedgerValues).some(Boolean);
const hasAllBrowserExecutionLedgerValues =
  Object.values(browserExecutionLedgerValues).every(Boolean);
if (
  hasAnyBrowserExecutionLedgerValue &&
  !hasAllBrowserExecutionLedgerValues
) {
  throw new Error(
    "Toolcraft browser execution ledger requires nonce and directory together.",
  );
}
const browserExecutionLedger = hasAllBrowserExecutionLedgerValues
  ? {
      nonce: browserExecutionLedgerValues.nonce!,
      directory: browserExecutionLedgerValues.directory!,
    }
  : undefined;
const performanceReportValues = {
  nonce: process.env.TOOLCRAFT_PERFORMANCE_REPORT_NONCE,
  path: process.env.TOOLCRAFT_PERFORMANCE_REPORT_PATH,
  sourceHash: process.env.TOOLCRAFT_PERFORMANCE_REPORT_SOURCE_HASH,
};
const hasAnyPerformanceReportValue = Object.values(performanceReportValues).some(Boolean);
const hasAllPerformanceReportValues = Object.values(performanceReportValues).every(Boolean);
if (hasAnyPerformanceReportValue && !hasAllPerformanceReportValues) {
  throw new Error(
    "Toolcraft protected performance reporting requires nonce, path, and source hash together.",
  );
}
const checkpointReport = hasAllPerformanceReportValues
  ? {
      nonce: performanceReportValues.nonce!,
      path: performanceReportValues.path!,
      sourceHash: performanceReportValues.sourceHash!,
    }
  : undefined;
const targetedPerformanceReportValues = {
  fixtureResolutionMode:
    process.env.TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE,
  fixtureSelector: process.env.TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR,
  nonce: process.env.TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_NONCE,
  passIds: process.env.TOOLCRAFT_TARGETED_PERFORMANCE_PASS_IDS,
  path: process.env.TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_PATH,
  pathIds: process.env.TOOLCRAFT_TARGETED_PERFORMANCE_PATH_IDS,
  requestAuthorityHash:
    process.env.TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH,
  sourceHash: process.env.TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_SOURCE_HASH,
};
const targetedPerformanceAuthorityValues = [
  targetedPerformanceReportValues.nonce,
  targetedPerformanceReportValues.passIds,
  targetedPerformanceReportValues.path,
  targetedPerformanceReportValues.pathIds,
  targetedPerformanceReportValues.requestAuthorityHash,
  targetedPerformanceReportValues.sourceHash,
];
const hasAnyTargetedPerformanceReportValue =
  targetedPerformanceReportValues.fixtureResolutionMode ===
    "strict-development" ||
  targetedPerformanceReportValues.fixtureSelector === "development" ||
  targetedPerformanceAuthorityValues.some(Boolean);
const hasAllTargetedPerformanceReportValues = Object.values(
  targetedPerformanceReportValues,
).every(Boolean);
if (
  hasAnyTargetedPerformanceReportValue &&
  !hasAllTargetedPerformanceReportValues
) {
  throw new Error(
    "Toolcraft targeted performance reporting requires fixture selector, fixture resolution mode, nonce, pass ids, path ids, path, request authority hash, and source hash together.",
  );
}
if (
  hasAllTargetedPerformanceReportValues &&
  (
    targetedPerformanceReportValues.fixtureResolutionMode !==
      "strict-development" ||
    targetedPerformanceReportValues.fixtureSelector !== "development" ||
    !/^[a-f0-9]{64}$/u.test(
      targetedPerformanceReportValues.requestAuthorityHash!,
    )
  )
) {
  throw new Error(
    "Toolcraft targeted performance reporting requires strict development fixtures and canonical request authority.",
  );
}
const targetedPerformanceReport = hasAllTargetedPerformanceReportValues
  ? {
      nonce: targetedPerformanceReportValues.nonce!,
      fixtureResolutionMode:
        targetedPerformanceReportValues.fixtureResolutionMode!,
      fixtureSelector: targetedPerformanceReportValues.fixtureSelector!,
      passIds: JSON.parse(targetedPerformanceReportValues.passIds!) as string[],
      path: targetedPerformanceReportValues.path!,
      pathIds: JSON.parse(targetedPerformanceReportValues.pathIds!) as string[],
      requestAuthorityHash:
        targetedPerformanceReportValues.requestAuthorityHash!,
      sourceHash: targetedPerformanceReportValues.sourceHash!,
    }
  : undefined;
process.env[resolvedTestPortEnvName] = String(testPort);

if (!resolvedTestPort && testPort !== preferredTestPort) {
  console.error(
    `[toolcraft] Browser test port ${preferredTestPort} is busy; using ${testPort} instead.`,
  );
}

export default defineConfig({
  forbidOnly: true,
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  reporter: [
    ["list"],
    [
      "./e2e/browser-runtime-evidence-reporter.ts",
      {
        browserExecutionLedger,
        checkpointReport,
        targetedPerformanceReport,
      },
    ],
    ...(featureVerificationPlanSource === undefined
      ? []
      : [["./e2e/toolcraft-feature-verification-reporter.ts"]] as const),
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: testBaseUrl,
    viewport: { height: 720, width: 1280 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm exec -- vite ${browserServerMode} --host 127.0.0.1 --port ${testPort} --strictPort`,
    env: {
      VITE_TOOLCRAFT_BROWSER_PROOF_FIXTURES: "unavailable-resource",
    },
    reuseExistingServer: false,
    timeout: 60_000,
    url: testBaseUrl,
  },
});
