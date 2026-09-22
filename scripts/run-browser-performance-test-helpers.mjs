import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import spawn from "cross-spawn";

import { installToolcraftPlaywrightTestShim } from "./playwright-test-shim-fixture.mjs";
import {
  TOOLCRAFT_DELIVERY_VERIFICATION_NARRATIVE,
} from "./toolcraft-performance-authority-policy.mjs";
import {
  copyGeneratedRuntimeFixtureModuleClosure,
  copyRelativeModuleClosure,
} from "./toolcraft-fixture-module-closure.mjs";
import { getToolcraftCheckpointBundlePath } from "./toolcraft-checkpoint-paths.mjs";
import { writePassedCheckpointFixture as writeCanonicalCheckpointFixture } from "./toolcraft-verification-receipt-test-helpers.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
export const projectDir = path.dirname(scriptsDir);
export const runnerPath = path.join(scriptsDir, "run-browser-performance.mjs");
export const fixturePerformancePathId =
  "performance-path:%5B%22interactive-discrete%22%2C%22control-change%22%2C%5B%22composite%22%5D%2C%5B%5D%2C%5B%5D%2C%5B%22main%22%5D%2C%5B%5D%5D";
export const fixtureFunctionalTestName = "browser: focused acceptance";
export const fixturePerformanceTestName =
  `browser perf: toolcraft path ${fixturePerformancePathId}`;
const fixtureDeliveryCatalog = Object.freeze({
  acceptance: [{
    acceptanceId: "persistence.reload",
    contractHash:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    domainId: "persistence",
    file: "e2e/app-controls.spec.ts",
    testName: fixtureFunctionalTestName,
  }],
  performance: [{
    passIds: ["composite"],
    pathId: fixturePerformancePathId,
    testName: fixturePerformanceTestName,
  }],
  version: 2,
});

export function writePerformanceIterationWorklog(
  rootDir,
  requestId = "1",
  _testNames = fixturePerformanceTestName,
  _tier = 3,
) {
  const docsDir = path.join(rootDir, "docs", "toolcraft");
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(
    path.join(docsDir, "agent-worklog.md"),
    `# Agent Worklog

## Decision Trail

### Performance iteration ${requestId}
- Request: The app is still slow in performance request ${requestId}.
- Performance intent: performance-iteration
- Performance request evidence: "The app is still slow in performance request ${requestId}."
- Performance paths: ${JSON.stringify([fixturePerformancePathId])}
- Verification: ${TOOLCRAFT_DELIVERY_VERIFICATION_NARRATIVE}

## Verification
Protected receipts own commands, selectors, measurements, and pass/fail evidence.
`,
  );
}

export function copyLocalModuleClosure(destinationDir, entryFileNames) {
  copyRelativeModuleClosure({
    destinationRoot: destinationDir,
    entryModulePaths: entryFileNames,
    followParentImports: false,
    sourceRoot: scriptsDir,
  });
}

export function installToolcraftRuntimeFixtureDependency(rootDir) {
  const generatedRuntimeDir = path.join(
    projectDir,
    "src",
    "toolcraft",
    "runtime",
  );
  if (existsSync(generatedRuntimeDir)) {
    const fixtureRuntimeDir = path.join(rootDir, "src", "toolcraft", "runtime");
    copyGeneratedRuntimeFixtureModuleClosure({
      destinationRoot: fixtureRuntimeDir,
      sourceRoot: generatedRuntimeDir,
    });
    return;
  }

  mkdirSync(path.join(rootDir, "node_modules", "@repo"), { recursive: true });
  symlinkSync(
    realpathSync(path.join(projectDir, "..", "packages", "toolcraft-runtime")),
    path.join(rootDir, "node_modules", "@repo", "toolcraft-runtime"),
    process.platform === "win32" ? "junction" : "dir",
  );
}

export function createVerificationFixture(prefix) {
  const rootDir = mkdtempSync(path.join(tmpdir(), `toolcraft-${prefix}-`));
  mkdirSync(path.join(rootDir, "src", "app"), { recursive: true });
  mkdirSync(path.join(rootDir, "src", "toolcraft"), { recursive: true });
  writeFileSync(
    path.join(rootDir, "src", "app.ts"),
    "export const value = 1;\n",
  );
  writeFileSync(path.join(rootDir, "src", "app", "app.test.ts"),
    "export const appTest = true;\n");
  writeFileSync(
    path.join(rootDir, "src", "toolcraft", ".toolcraft-manifest.json"),
    '{"protectedFiles":{}}\n',
  );
  return rootDir;
}

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function readCheckpointBundle(rootDir) {
  return readJson(getToolcraftCheckpointBundlePath(rootDir));
}

export function readPlaywrightShimEvents(rootDir) {
  const eventsPath = path.join(
    rootDir,
    "node_modules/.toolcraft-playwright-test-shim/events.jsonl",
  );
  return readFileSync(eventsPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function readProofInvocations(rootDir) {
  const eventsPath = path.join(rootDir, ".toolcraft", "proof-events.jsonl");
  const scriptEvents = existsSync(eventsPath)
    ? readFileSync(eventsPath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
  const playwrightEventsPath = path.join(
    rootDir,
    "node_modules/.toolcraft-playwright-test-shim/events.jsonl",
  );
  const playwrightEvents = existsSync(playwrightEventsPath)
    ? readPlaywrightShimEvents(rootDir)
        .filter((event) => event.event === "completed")
        .map(() => "playwright-full-performance")
    : [];
  return [...scriptEvents, ...playwrightEvents];
}

export function mutateSourceDuringPerformanceMatrix(rootDir) {
  const shimPath = path.join(
    rootDir,
    "node_modules/.toolcraft-playwright-test-shim/playwright-shim.mjs",
  );
  const source = readFileSync(shimPath, "utf8");
  writeFileSync(
    shimPath,
    source.replace(
      'record("completed");',
      `record("completed");
writeFileSync(
  path.join(process.cwd(), "src", "app.ts"),
  "export const value = 'mutated-during-matrix';\\\\n",
);`,
    ),
  );
}

export function failPerformanceMatrix(rootDir) {
  const shimPath = path.join(
    rootDir,
    "node_modules/.toolcraft-playwright-test-shim/playwright-shim.mjs",
  );
  const source = readFileSync(shimPath, "utf8");
  writeFileSync(
    shimPath,
    source.replace(
      'record("completed");',
      'record("completed");\nprocess.exit(1);',
    ),
  );
}

export const writePassedCheckpointFixture = writeCanonicalCheckpointFixture;

export function createProtectedRunnerFixture(
  playwrightListReport = {
    errors: [],
    suites: [
      {
        title: "app-controls.spec.ts",
        specs: [
          {
            title: fixtureFunctionalTestName,
            tags: [],
            tests: [{ projectName: "" }],
          },
          {
            title: fixturePerformanceTestName,
            tags: [],
            tests: [{ projectName: "" }],
          },
        ],
      },
    ],
  },
  deliveryCatalog = fixtureDeliveryCatalog,
) {
  const rootDir = createVerificationFixture("protected-runner");
  const fixtureScriptsDir = path.join(rootDir, "scripts");
  const binDir = path.join(rootDir, "node_modules", ".bin");
  mkdirSync(fixtureScriptsDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  copyLocalModuleClosure(fixtureScriptsDir, ["run-browser-performance.mjs"]);
  const browserProofPolicyPath = path.join(
    rootDir,
    "src/app/acceptance/browser-proof-policy.mjs",
  );
  mkdirSync(path.dirname(browserProofPolicyPath), { recursive: true });
  writeFileSync(
    browserProofPolicyPath,
    readFileSync(
      path.join(
        projectDir,
        "src/app/acceptance/browser-proof-policy.mjs",
      ),
      "utf8",
    ),
  );
  writeFileSync(
    path.join(fixtureScriptsDir, "check-toolcraft-integrity.mjs"),
    "process.exitCode = 0;\n",
  );
  writeFileSync(
    path.join(fixtureScriptsDir, "noop.mjs"),
    "process.exitCode = 0;\n",
  );
  writeFileSync(
    path.join(rootDir, "package.json"),
    `${JSON.stringify({
      name: "toolcraft-protected-runner-fixture",
      scripts: {
        "ai:check": "node scripts/noop.mjs",
        build: "node scripts/noop.mjs",
        "docs:check": "node scripts/noop.mjs",
        "test:delivery": "node scripts/noop.mjs",
      },
    })}\n`,
  );
  for (const packageName of [
    "@playwright", "cross-spawn",
    "postcss",
    "postcss-selector-parser",
  ]) {
    symlinkSync(
      realpathSync(path.join(projectDir, "node_modules", packageName)),
      path.join(rootDir, "node_modules", packageName),
      process.platform === "win32" ? "junction" : "dir",
    );
  }
  installToolcraftRuntimeFixtureDependency(rootDir);
  installToolcraftPlaywrightTestShim({
    deliveryCatalog,
    listReport: playwrightListReport,
    rootDir,
  });
  const performanceTestName = (playwrightListReport.suites ?? [])
    .flatMap((suite) => suite.specs ?? [])
    .map((spec) => spec.title)
    .find((title) => title.startsWith("browser perf:"));
  if (performanceTestName) {
    writePerformanceIterationWorklog(rootDir, "1", performanceTestName);
  }
  for (const binary of ["tsc", "vite", "vitest"]) {
    const binaryPath = path.join(
      binDir,
      process.platform === "win32" ? `${binary}.cmd` : binary,
    );
    writeFileSync(
      binaryPath,
      process.platform === "win32"
        ? "@echo off\r\nexit /b 0\r\n"
        : "#!/usr/bin/env node\nprocess.exitCode = 0;\n",
    );
    if (process.platform !== "win32") chmodSync(binaryPath, 0o755);
  }
  return rootDir;
}

export function invokeRunner(rootDir, fileName, args = [], env = process.env) {
  return spawn.sync(
    process.execPath,
    [path.join(rootDir, "scripts", fileName), ...args],
    { cwd: rootDir, encoding: "utf8", env, timeout: 10_000 },
  );
}

export function runProtectedRunner(rootDir, args = []) {
  const result = invokeRunner(rootDir, "run-browser-performance.mjs", args);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}
