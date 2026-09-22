import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  getToolcraftPlaywrightProjectRoot,
} from "./playwright-containing-file.mjs";

test("derives one app project root independently of Playwright testDir", () => {
  const appRoot = path.resolve("/toolcraft/app");
  assert.equal(
    getToolcraftPlaywrightProjectRoot({
      configFile: path.join(appRoot, "playwright.config.ts"),
      rootDir: path.join(appRoot, "e2e"),
    }),
    appRoot,
  );
});

test("rejects every non-absolute Playwright configFile consistently", () => {
  for (const configFile of [undefined, false, "", "playwright.config.ts"]) {
    assert.throws(
      () => getToolcraftPlaywrightProjectRoot({ configFile }),
      /Toolcraft Playwright project root requires an absolute configFile\./u,
    );
  }
});
