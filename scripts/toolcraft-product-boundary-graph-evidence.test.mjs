import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createToolcraftLocalDependencyGraph } from "./toolcraft-local-dependency-graph.mjs";
import { evaluateToolcraftProductBoundary } from "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from "./toolcraft-product-boundary-test-fixtures.mjs";
import { createToolcraftDefaultSourceAliases } from "./toolcraft-product-dependency-resolution.mjs";
import { collectToolcraftSourceInventory } from "./toolcraft-source-inventory.mjs";

function assertDeeplyImmutable(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  if (Array.isArray(value)) {
    assert.throws(() => value.push("forged"));
  } else {
    assert.throws(() => {
      value.__forged = true;
    });
  }
  for (const nestedValue of Object.values(value)) {
    assertDeeplyImmutable(nestedValue, seen);
  }
}

function assertContainsNoCompilerNodes(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(
    typeof value.kind === "number" && typeof value.getStart === "function",
    false,
  );
  for (const nestedValue of Object.values(value)) {
    assertContainsNoCompilerNodes(nestedValue, seen);
  }
}

test("rejects type-only test imports while accepting external type imports", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/fixture.test.ts": "export type Fixture = string;\n",
    "src/product/type-imports.ts": `
      import type { ReactNode } from "react";
      import type { Fixture } from "../features/fixture.test";
      export type Product = Fixture | ReactNode;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map(({ kind }) => kind),
    ["production-test-import"],
  );
  assert.match(result.violations[0].message, /\.\.\/features\/fixture\.test/u);
});

test("rejects test import types while accepting external import types", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/fixture.fixtures.ts": "export type Support = string;\n",
    "src/features/fixture.test.ts": "export type Fixture = string;\n",
    "src/product/import-types.ts": `
      export type TestFixture = import("../features/fixture.test").Fixture;
      export type TestSupport = import("../features/fixture.fixtures").Support;
      export type External = import("react").ReactNode;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map(({ kind }) => kind),
    ["production-test-import", "production-test-import"],
  );
  assert.match(result.violations[0].message, /fixture\.test/u);
  assert.match(result.violations[1].message, /fixture\.fixtures/u);
});

test("rejects JavaScript JSDoc import types for tests and test support", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/fixture.fixtures.js": "export const support = true;\n",
    "src/features/fixture.test.js": "export const fixture = true;\n",
    "src/product/import-types.js": [
      '/** @typedef {import("../features/fixture.test").Fixture} TestFixture */',
      "export const testFixture = null;",
      '/** @typedef {import("./production").Production} Production */',
      "export const productionType = null;",
      '/** @typedef {import("react").ReactNode} External */',
      "export const externalType = null;",
    ].join("\n"),
    "src/product/import-types.mjs": [
      '/** @typedef {import("../features/fixture.fixtures").Support} TestSupport */',
      '/** @typedef {import("react").ReactNode} External */',
      "export const testSupport = null;",
    ].join("\n"),
    "src/product/production.js": "export const production = true;\n",
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map(({ kind, repoPath }) => ({ kind, repoPath })),
    [
      {
        kind: "production-test-import",
        repoPath: "src/product/import-types.js",
      },
      {
        kind: "production-test-import",
        repoPath: "src/product/import-types.mjs",
      },
    ],
  );
  assert.match(result.violations[0].message, /fixture\.test/u);
  assert.match(result.violations[1].message, /fixture\.fixtures/u);
});

test("uses immutable graph boundary facts without source filesystem reads", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/cached.tsx": `
      import { ToolcraftApp } from "@/toolcraft/runtime/react";
      export const Cached = ToolcraftApp;
    `,
  });
  const inventory = await collectToolcraftSourceInventory({
    includeResourceFiles: true,
    rootDir,
    sourceRoots: ["src"],
  });
  const localDependencyGraph = await createToolcraftLocalDependencyGraph({
    aliases: createToolcraftDefaultSourceAliases(rootDir),
    entries: inventory.entries,
    rootDir,
  });
  await fs.rm(path.join(rootDir, "src/features/cached.tsx"));

  const firstResult = await evaluateToolcraftProductBoundary({
    inventory,
    localDependencyGraph,
    protectedFilePaths: [],
    rootDir,
  });
  const sourceRecord = localDependencyGraph.sourceRecords.get(
    "src/features/cached.tsx",
  );
  assertContainsNoCompilerNodes(sourceRecord);
  assertDeeplyImmutable(sourceRecord);
  const secondResult = await evaluateToolcraftProductBoundary({
    inventory,
    localDependencyGraph,
    protectedFilePaths: [],
    rootDir,
  });

  assert.deepEqual(
    firstResult.violations.map(({ kind }) => kind),
    ["runtime-surface"],
  );
  assert.deepEqual(secondResult, firstResult);
});
