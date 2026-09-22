import assert from "node:assert/strict";
import test from "node:test";

import { evaluateToolcraftProductBoundary } from "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from "./toolcraft-product-boundary-test-fixtures.mjs";

function authorityViolations(result) {
  return result.violations.filter(
    (violation) => violation.kind === "direct-playwright-evidence-authority",
  );
}

test("rejects every direct Playwright test authority import shape", async (context) => {
  const rootDir = await createFixture(context, {
    "e2e/app-controls.spec.ts": `
      import playwrightDefault from "@playwright/test";
      import * as playwright from "@playwright/test";
      import { test as productTest, type TestInfo } from "@playwright/test";
      void playwrightDefault;
      void playwright;
      void productTest;
      void (undefined as unknown as TestInfo);
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(authorityViolations(result).length, 4);
});

test("allows assertion and inert Playwright types without exposing TestInfo", async (context) => {
  const rootDir = await createFixture(context, {
    "e2e/app-controls.spec.ts": `
      import { expect, type Download, type Page } from "@playwright/test";
      void expect;
      void (undefined as unknown as Download);
      void (undefined as unknown as Page);
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(authorityViolations(result), []);
});

test("rejects require, dynamic import, import-equals, and re-export authority", async (context) => {
  const rootDir = await createFixture(context, {
    "e2e/app-controls.spec.ts": `
      import playwright = require("@playwright/test");
      export { test } from "@playwright/test";
      const required = require("@playwright/test");
      const loaded = import("@playwright/" + "test");
      void playwright;
      void required;
      void loaded;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(authorityViolations(result).length, 4);
});

test("rejects Playwright authority imported through package subpaths", async (context) => {
  const rootDir = await createFixture(context, {
    "e2e/app-controls.spec.ts": `
      import * as reporter from "@playwright/test/reporter";
      const loaded = import("@playwright/test/internal");
      void reporter;
      void loaded;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(authorityViolations(result).length, 2);
});

test("rejects a product-owned local wrapper around Playwright authority", async (context) => {
  const rootDir = await createFixture(context, {
    "e2e/app-controls.spec.ts": `
      import { wrappedTest } from "./product-test-authority";
      void wrappedTest;
    `,
    "e2e/product-test-authority.ts": `
      import { test as base } from "@playwright/test";
      export const wrappedTest = base;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(authorityViolations(result).length, 1);
});
