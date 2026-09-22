import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import spawn from "cross-spawn";

import { installToolcraftPlaywrightTestShim } from "./playwright-test-shim-fixture.mjs";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function createFixture() {
  const rootDir = mkdtempSync(path.join(tmpdir(), "toolcraft-playwright-shim-"));
  mkdirSync(path.join(rootDir, "node_modules"), { recursive: true });
  symlinkSync(
    realpathSync(path.join(projectDir, "node_modules", "cross-spawn")),
    path.join(rootDir, "node_modules", "cross-spawn"),
    process.platform === "win32" ? "junction" : "dir",
  );
  return rootDir;
}

function invokeShim(shim, args) {
  return spawn.sync(
    process.execPath,
    [shim.shimPath, shim.configPath, ...args],
    { encoding: "utf8" },
  );
}

test("POSIX and Windows launchers execute the same shared Playwright shim", (t) => {
  const rootDir = createFixture();
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));
  const listReport = { errors: [], suites: [] };
  const shim = installToolcraftPlaywrightTestShim({ listReport, rootDir });

  const posixLauncher = readFileSync(shim.posixLauncherPath, "utf8");
  const windowsLauncher = readFileSync(shim.windowsLauncherPath, "utf8");
  for (const launcher of [posixLauncher, windowsLauncher]) {
    assert.match(launcher, new RegExp(shim.shimPath.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    assert.match(launcher, new RegExp(shim.configPath.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  assert.match(posixLauncher, /"\$@"/u);
  assert.match(windowsLauncher, /%\*/u);
  assert.doesNotMatch(windowsLauncher, /node_modules[/\\]\.bin[/\\]playwright/u);

  const install = invokeShim(shim, ["install", "chromium"]);
  assert.equal(install.status, 0, install.stderr);
  const list = invokeShim(shim, ["test", "--list", "--reporter=json"]);
  assert.equal(list.status, 0, list.stderr);
  assert.deepEqual(JSON.parse(list.stdout), listReport);

  const events = readFileSync(shim.eventsPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(events, [
    { args: ["install", "chromium"], event: "install-skipped" },
    { args: ["test", "--list", "--reporter=json"], event: "list-report" },
  ]);
});
