import {
  chmodSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

function getShimSource() {
  return `import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import spawn from "cross-spawn";

const [configPath, ...args] = process.argv.slice(2);
const config = JSON.parse(readFileSync(configPath, "utf8"));
const record = (event) => appendFileSync(
  config.eventsPath,
  JSON.stringify({
    args,
    event,
    ...(process.env.TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR
      ? { fixtureSelector: process.env.TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR }
      : {}),
    ...(process.env.TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE
      ? { fixtureResolutionMode: process.env.TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE }
      : {}),
  }) + "\\n",
);

if (args[0] === "install") {
  record("install-skipped");
  process.exit(0);
}
if (
  args.includes("--list") &&
  args.some((arg) => arg.includes("toolcraft-delivery-catalog-reporter")) &&
  config.deliveryCatalog !== undefined
) {
  record("delivery-catalog");
  process.stdout.write(JSON.stringify(config.deliveryCatalog) + "\\n");
  process.exit(0);
}
if (args.includes("--list") && config.listReport !== undefined) {
  record("list-report");
  process.stdout.write(JSON.stringify(config.listReport));
  process.exit(0);
}
if (config.realPlaywrightBin) {
  record("delegated");
  const result = spawn.sync(config.realPlaywrightBin, args, { stdio: "inherit" });
  process.exit(result.status ?? 1);
}
record("completed");
if (
  process.env.TOOLCRAFT_PERFORMANCE_REPORT_PATH &&
  process.env.TOOLCRAFT_PERFORMANCE_REPORT_NONCE &&
  process.env.TOOLCRAFT_PERFORMANCE_REPORT_SOURCE_HASH
) {
  const canonicalize = (value) => Array.isArray(value)
    ? value.map(canonicalize)
    : typeof value === "object" && value !== null
      ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonicalize(entry)]))
      : value;
  const hash = (value) => createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
  const paths = [{ id: "initial", interaction: "initial-render", profile: "initial-render" }];
  const metrics = {
    droppedFrameCount: 0,
    droppedFrameRatio: 0,
    durationMs: 1,
    frameGapP50Ms: 16,
    frameGapP95Ms: 16,
    frameGapP99Ms: 16,
    longTaskCount: 0,
    longTaskMaxMs: 0,
    maxFrameGapMs: 16,
    sampleCount: 3,
  };
  const measurements = ["cold", "warm", "sustained"].map((phase) => ({
    evidenceType: "performance-measurement-metrics",
    kind: "interaction",
    metrics,
    pathId: "initial",
    phase,
    profile: "initial-render",
    profileCatalogVersion: 1,
    version: 1,
  }));
  const report = {
    environment: {
      browser: { name: "chromium", version: "test" },
      calibration: { durationMs: 1, iterations: 1 },
      cpuThrottling: { mode: "none", rate: 1 },
      evidenceType: "performance-environment",
      hardwareConcurrency: 4,
      version: 1,
      viewport: { height: 720, width: 1280 },
    },
    generatedAt: new Date().toISOString(),
    matrixHash: hash(paths),
    measurements,
    nonce: process.env.TOOLCRAFT_PERFORMANCE_REPORT_NONCE,
    paths,
    pipelineSummaries: [],
    profileCatalogVersion: 1,
    sourceHash: process.env.TOOLCRAFT_PERFORMANCE_REPORT_SOURCE_HASH,
    status: "passed",
    version: 1,
  };
  mkdirSync(path.dirname(process.env.TOOLCRAFT_PERFORMANCE_REPORT_PATH), { recursive: true });
  writeFileSync(process.env.TOOLCRAFT_PERFORMANCE_REPORT_PATH, JSON.stringify(report));
}
if (
  process.env.TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_PATH &&
  process.env.TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_NONCE &&
  process.env.TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_SOURCE_HASH &&
  process.env.TOOLCRAFT_TARGETED_PERFORMANCE_PASS_IDS &&
  process.env.TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH
) {
  const testNames = (config.listReport?.suites ?? [])
    .flatMap((suite) => suite.specs ?? [])
    .map((spec) => spec.title)
    .filter((title) => title.startsWith("browser perf:"));
  const metrics = {
    droppedFrameCount: 0,
    droppedFrameRatio: 0,
    durationMs: 10,
    frameGapP50Ms: 10,
    frameGapP95Ms: 16,
    frameGapP99Ms: 16,
    longTaskCount: 0,
    longTaskMaxMs: 0,
    maxFrameGapMs: 16,
    sampleCount: 3,
  };
  const measurements = ["cold", "warm", "sustained"].map((phase) => ({
    evidenceType: "performance-measurement-metrics",
    kind: "interaction",
    metrics,
    pathId: config.deliveryCatalog.performance[0].pathId,
    phase,
    profile: "interactive-discrete",
    profileCatalogVersion: 1,
    version: 1,
  }));
  const targetedReport = {
    fixtureResolutionMode: process.env.TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE,
    fixtureSelector: process.env.TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR,
    nonce: process.env.TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_NONCE,
    measurements,
    performancePassIds: JSON.parse(process.env.TOOLCRAFT_TARGETED_PERFORMANCE_PASS_IDS).sort(),
    performancePathIds: [config.deliveryCatalog.performance[0].pathId],
    requestAuthorityHash: process.env.TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH,
    sourceHash: process.env.TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_SOURCE_HASH,
    testNames: testNames.sort(),
    version: 3,
  };
  mkdirSync(path.dirname(process.env.TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_PATH), { recursive: true });
  writeFileSync(
    process.env.TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_PATH,
    JSON.stringify(targetedReport),
  );
}
`;
}

export function installToolcraftPlaywrightTestShim({
  deliveryCatalog,
  listReport,
  realPlaywrightBin,
  rootDir,
}) {
  const binDir = path.join(rootDir, "node_modules", ".bin");
  const shimDir = path.join(rootDir, "node_modules", ".toolcraft-playwright-test-shim");
  const shimPath = path.join(shimDir, "playwright-shim.mjs");
  const configPath = path.join(shimDir, "config.json");
  const eventsPath = path.join(shimDir, "events.jsonl");
  mkdirSync(binDir, { recursive: true });
  mkdirSync(shimDir, { recursive: true });
  writeFileSync(shimPath, getShimSource());
  writeFileSync(
    configPath,
    JSON.stringify({ deliveryCatalog, eventsPath, listReport, realPlaywrightBin }),
  );

  const posixLauncherPath = path.join(binDir, "playwright");
  const windowsLauncherPath = path.join(binDir, "playwright.cmd");
  writeFileSync(
    posixLauncherPath,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(shimPath)} ${JSON.stringify(configPath)} "$@"\n`,
  );
  chmodSync(posixLauncherPath, 0o755);
  writeFileSync(
    windowsLauncherPath,
    `@echo off\r\n${JSON.stringify(process.execPath)} ${JSON.stringify(shimPath)} ${JSON.stringify(configPath)} %*\r\nexit /b %errorlevel%\r\n`,
  );

  return {
    configPath,
    eventsPath,
    posixLauncherPath,
    shimPath,
    windowsLauncherPath,
  };
}
