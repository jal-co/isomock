import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import spawn from "cross-spawn";

import {
  collectToolcraftPlaywrightTestTitles,
  getToolcraftPlaywrightExactGrepPattern,
  resolveToolcraftPlaywrightTestTitles,
} from "./playwright-test-title-selection.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playwrightBin = path.join(
  projectDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "playwright.cmd" : "playwright",
);

function createRealPlaywrightFixture({ projectName } = {}) {
  const rootDir = mkdtempSync(path.join(tmpdir(), "toolcraft-playwright-titles-"));
  mkdirSync(path.join(rootDir, "node_modules"), { recursive: true });
  symlinkSync(
    path.join(projectDir, "node_modules", "@playwright"),
    path.join(rootDir, "node_modules", "@playwright"),
    process.platform === "win32" ? "junction" : "dir",
  );
  writeFileSync(
    path.join(rootDir, "playwright.config.mjs"),
    projectName
      ? `export default { projects: [{ name: ${JSON.stringify(projectName)} }], testDir: "." };\n`
      : 'export default { testDir: "." };\n',
  );
  writeFileSync(
    path.join(rootDir, "titles.spec.mjs"),
    [
      'import { test } from "@playwright/test";',
      'test("browser: requested", () => {});',
      'test("prefix browser: requested", () => {});',
      'test.describe("suite one", () => test("shared leaf", () => {}));',
      'test.describe("suite two", () => test("shared leaf", () => {}));',
      'test.describe("suite one", () => test("unique suite leaf", () => {}));',
      "",
    ].join("\n"),
  );
  return rootDir;
}

function invokeRealPlaywright(rootDir, { grepPattern, list = false } = {}) {
  const args = ["test", "--reporter=json"];
  if (list) {
    args.push("--list");
  }
  if (grepPattern) {
    args.push("--grep", grepPattern);
  }
  const result = spawn.sync(playwrightBin, args, {
    cwd: rootDir,
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function listWithRealPlaywright(rootDir, grepPattern) {
  return invokeRealPlaywright(rootDir, { grepPattern, list: true });
}

test("unnamed Playwright project runs the exact selected leaf", (t) => {
  const rootDir = createRealPlaywrightFixture();
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));
  const titles = collectToolcraftPlaywrightTestTitles(listWithRealPlaywright(rootDir));
  const selections = resolveToolcraftPlaywrightTestTitles(titles, ["browser: requested"]);

  assert.equal(selections.length, 1);
  assert.equal(selections[0].leafTitle, "browser: requested");
  assert.doesNotMatch(selections[0].fullTitle, /prefix browser: requested/u);
  const grepPattern = getToolcraftPlaywrightExactGrepPattern(selections);
  const selectedReport = invokeRealPlaywright(rootDir, { grepPattern });
  assert.deepEqual(
    collectToolcraftPlaywrightTestTitles(selectedReport).map(({ leafTitle }) => leafTitle),
    ["browser: requested"],
  );
});

test("named Playwright project runs the exact selected leaf", (t) => {
  const rootDir = createRealPlaywrightFixture({ projectName: "chromium" });
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));
  const titles = collectToolcraftPlaywrightTestTitles(listWithRealPlaywright(rootDir));
  const selections = resolveToolcraftPlaywrightTestTitles(titles, ["browser: requested"]);

  const selectedReport = invokeRealPlaywright(rootDir, {
    grepPattern: getToolcraftPlaywrightExactGrepPattern(selections),
  });
  assert.deepEqual(
    collectToolcraftPlaywrightTestTitles(selectedReport).map(({ leafTitle }) => leafTitle),
    ["browser: requested"],
  );
});

test("full Playwright title runs one test inside a suite", (t) => {
  const rootDir = createRealPlaywrightFixture({ projectName: "chromium" });
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));
  const titles = collectToolcraftPlaywrightTestTitles(listWithRealPlaywright(rootDir));
  const expected = titles.find(({ leafTitle }) => leafTitle === "unique suite leaf");
  assert.ok(expected);

  const selections = resolveToolcraftPlaywrightTestTitles(titles, [expected.fullTitle]);
  const selectedReport = invokeRealPlaywright(rootDir, {
    grepPattern: getToolcraftPlaywrightExactGrepPattern(selections),
  });
  assert.deepEqual(
    collectToolcraftPlaywrightTestTitles(selectedReport).map(({ fullTitle }) => fullTitle),
    [expected.fullTitle],
  );
});

test("leaf resolution rejects zero and multiple exact matches", (t) => {
  const rootDir = createRealPlaywrightFixture({ projectName: "chromium" });
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));
  const titles = collectToolcraftPlaywrightTestTitles(listWithRealPlaywright(rootDir));

  assert.throws(
    () => resolveToolcraftPlaywrightTestTitles(titles, ["missing leaf"]),
    /did not match any Playwright test/u,
  );
  assert.throws(
    () => resolveToolcraftPlaywrightTestTitles(titles, ["shared leaf"]),
    /matched 2 Playwright tests/u,
  );
});
