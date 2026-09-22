import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  createProtectedRunnerFixture,
  fixtureFunctionalTestName,
  fixturePerformanceTestName,
  readPlaywrightShimEvents,
} from "./run-browser-performance-test-helpers.mjs";
import { getToolcraftCheckpointBundlePath } from "./toolcraft-checkpoint-paths.mjs";

export const functionalTestName = fixtureFunctionalTestName;
export const performanceTestName = fixturePerformanceTestName;

export function createDeliveryFixture(
  playwrightListReport = {
    errors: [],
    suites: [
      {
        specs: [
          {
            tags: [],
            tests: [{ projectName: "" }],
            title: functionalTestName,
          },
          {
            tags: [],
            tests: [{ projectName: "" }],
            title: performanceTestName,
          },
        ],
        title: "app-controls.spec.ts",
      },
    ],
  },
  deliveryCatalog,
) {
  const rootDir = createProtectedRunnerFixture(
    playwrightListReport,
    deliveryCatalog,
  );
  rmSync(path.join(rootDir, "src", "app", "app.test.ts"));
  mkdirSync(path.join(rootDir, "src", "app"), { recursive: true });
  writeFileSync(
    path.join(rootDir, "src", "app", "renderer.ts"),
    "export const renderer = 1;\n",
  );
  writeFileSync(
    path.join(rootDir, "src", "app", "schema.ts"),
    "export const schema = 1;\n",
  );
  writeFileSync(
    path.join(rootDir, "src", "app", "schema.test.ts"),
    "export const schemaTest = true;\n",
  );
  writeFileSync(
    path.join(rootDir, "src", "app", "app-composition.tsx"),
    'export { value } from "../app";\nexport { renderer } from "./renderer";\n',
  );
  writeFileSync(
    path.join(rootDir, "src", "app", "app-schema.ts"),
    'export { schema } from "./schema";\n',
  );
  writeFileSync(
    path.join(rootDir, "src", "app", "app-acceptance-data.ts"),
    "export const acceptanceData = true;\n",
  );
  writeFileSync(
    path.join(rootDir, "src", "app", "app-performance.ts"),
    "export const performance = true;\n",
  );
  writeFileSync(
    path.join(rootDir, "scripts", "record-delivery-event.mjs"),
    [
      'import { appendFile, mkdir } from "node:fs/promises";',
      'import path from "node:path";',
      'const dir = path.join(process.cwd(), ".toolcraft");',
      "await mkdir(dir, { recursive: true });",
      'await appendFile(path.join(dir, "delivery-events.jsonl"), `${JSON.stringify({ event: process.argv[2] })}\\n`);',
      "",
    ].join("\n"),
  );
  writeFileSync(
    path.join(rootDir, "scripts", "check-toolcraft-integrity.mjs"),
    'process.argv[2] = "integrity"; await import("./record-delivery-event.mjs");\n',
  );
  writeFileSync(
    path.join(rootDir, "package.json"),
    `${JSON.stringify({
      name: "toolcraft-delivery-fixture",
      private: true,
      scripts: {
        "ai:check": "node scripts/record-delivery-event.mjs ai-check",
        build: "node scripts/record-delivery-event.mjs build",
        "docs:check": "node scripts/record-delivery-event.mjs docs-check",
        "test:delivery": "node scripts/record-delivery-event.mjs test-delivery",
      },
      type: "module",
    })}\n`,
  );
  return rootDir;
}

export function removeDeliveryFixture(rootDir) {
  rmSync(rootDir, { force: true, recursive: true });
}

export function readDeliveryEvents(rootDir) {
  const eventPath = path.join(rootDir, ".toolcraft", "delivery-events.jsonl");
  try {
    return readFileSync(eventPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line).event);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function getCompletedFixtureEvents(rootDir, fixtureSelector) {
  return readPlaywrightShimEvents(rootDir).filter(
    (event) =>
      event.event === "completed" && event.fixtureSelector === fixtureSelector,
  );
}

export function assertNoPerformanceAuthority(rootDir) {
  const bundlePath = getToolcraftCheckpointBundlePath(rootDir);
  if (!existsSync(bundlePath)) return;
  const bundle = readJson(bundlePath);
  assert.equal(bundle.performanceBaseline, null);
  assert.equal(bundle.currentPerformance, null);
}

export function installConditionalPlaywrightFailure(rootDir, condition) {
  const fakePlaywrightPath = path.join(
    rootDir,
    "node_modules",
    ".toolcraft-playwright-test-shim",
    "conditional-playwright.mjs",
  );
  writeFileSync(
    fakePlaywrightPath,
    [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      `const shouldFail = ${condition};`,
      "process.exitCode = shouldFail ? 1 : 0;",
      "",
    ].join("\n"),
  );
  if (process.platform !== "win32") chmodSync(fakePlaywrightPath, 0o755);
  const configPath = path.join(
    rootDir,
    "node_modules",
    ".toolcraft-playwright-test-shim",
    "config.json",
  );
  const config = readJson(configPath);
  config.realPlaywrightBin = fakePlaywrightPath;
  writeFileSync(configPath, JSON.stringify(config));
}
