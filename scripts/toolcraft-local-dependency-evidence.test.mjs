import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createToolcraftLocalDependencyGraph,
  getToolcraftProductionCycleViolations,
} from "./toolcraft-local-dependency-graph.mjs";
import { collectToolcraftSourceInventory } from "./toolcraft-source-inventory.mjs";

async function withGraphFixture(files, assertion) {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-local-dependency-evidence-"),
  );
  try {
    for (const [repoPath, source] of Object.entries(files)) {
      const filePath = path.join(rootDir, repoPath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, source);
    }
    const inventory = await collectToolcraftSourceInventory({
      includeResourceFiles: true,
      rootDir,
      sourceRoots: ["src"],
    });
    await assertion(
      await createToolcraftLocalDependencyGraph({
        entries: inventory.entries,
        rootDir,
      }),
    );
  } finally {
    await fs.rm(rootDir, { force: true, recursive: true });
  }
}

test("type-only imports remain boundary evidence without changing graph edges", async () => {
  await withGraphFixture(
    {
      "src/fixture.test.ts": "export type Fixture = string;\n",
      "src/product.ts": [
        'import type { ReactNode } from "react";',
        'import type { Fixture } from "./fixture.test";',
        "export type Product = Fixture | ReactNode;",
      ].join("\n"),
    },
    (graph) => {
      assert.deepEqual(graph.forward.get("src/product.ts"), []);
      assert.deepEqual(graph.reverse.get("src/fixture.test.ts"), []);
      assert.deepEqual(getToolcraftProductionCycleViolations(graph), []);
      assert.deepEqual(
        graph.moduleImports.filter(
          ({ importerRepoPath }) => importerRepoPath === "src/product.ts",
        ),
        [
          {
            category: "static-import",
            column: 32,
            importerRepoPath: "src/product.ts",
            line: 1,
            resolution: "external",
            specifier: "react",
            typeOnly: true,
          },
          {
            category: "static-import",
            column: 30,
            importerRepoPath: "src/product.ts",
            line: 2,
            resolution: "resolved",
            resolvedRepoPath: "src/fixture.test.ts",
            specifier: "./fixture.test",
            typeOnly: true,
          },
        ],
      );
    },
  );
});

test("records import-type evidence without adding dependency edges", async () => {
  await withGraphFixture(
    {
      "src/fixture.fixtures.ts": "export type Support = string;\n",
      "src/fixture.test.ts": "export type Fixture = string;\n",
      "src/product.ts": [
        'export type TestFixture = import("./fixture.test").Fixture;',
        'export type TestSupport = import("./fixture.fixtures").Support;',
        'export type External = import("react").ReactNode;',
      ].join("\n"),
    },
    (graph) => {
      assert.deepEqual(graph.forward.get("src/product.ts"), []);
      assert.deepEqual(graph.reverse.get("src/fixture.fixtures.ts"), []);
      assert.deepEqual(graph.reverse.get("src/fixture.test.ts"), []);
      assert.deepEqual(getToolcraftProductionCycleViolations(graph), []);
      assert.deepEqual(
        graph.moduleImports.filter(
          ({ importerRepoPath }) => importerRepoPath === "src/product.ts",
        ),
        [
          {
            category: "import-type",
            column: 34,
            importerRepoPath: "src/product.ts",
            line: 1,
            resolution: "resolved",
            resolvedRepoPath: "src/fixture.test.ts",
            specifier: "./fixture.test",
            typeOnly: true,
          },
          {
            category: "import-type",
            column: 34,
            importerRepoPath: "src/product.ts",
            line: 2,
            resolution: "resolved",
            resolvedRepoPath: "src/fixture.fixtures.ts",
            specifier: "./fixture.fixtures",
            typeOnly: true,
          },
          {
            category: "import-type",
            column: 31,
            importerRepoPath: "src/product.ts",
            line: 3,
            resolution: "external",
            specifier: "react",
            typeOnly: true,
          },
        ],
      );
    },
  );
});

test("records unique JSDoc import types without adding dependency edges", async () => {
  await withGraphFixture(
    {
      "src/fixture.fixtures.js": "export const support = true;\n",
      "src/fixture.test.js": "export const fixture = true;\n",
      "src/product.js": [
        '/** @typedef {import("./fixture.test").Fixture} TestFixture */',
        "export const testFixture = null;",
        '/** @typedef {import("./production").Production} Production */',
        "export const productionType = null;",
        '/** @typedef {import("react").ReactNode} External */',
        "export const externalType = null;",
      ].join("\n"),
      "src/product.mjs": [
        '/** @typedef {import("./fixture.fixtures").Support} TestSupport */',
        '/** @typedef {import("react").ReactNode} External */',
        "export const testSupport = null;",
      ].join("\n"),
      "src/production.js": "export const production = true;\n",
    },
    (graph) => {
      assert.deepEqual(graph.forward.get("src/product.js"), []);
      assert.deepEqual(graph.forward.get("src/product.mjs"), []);
      assert.deepEqual(graph.reverse.get("src/fixture.fixtures.js"), []);
      assert.deepEqual(graph.reverse.get("src/fixture.test.js"), []);
      assert.deepEqual(graph.reverse.get("src/production.js"), []);
      assert.deepEqual(getToolcraftProductionCycleViolations(graph), []);
      assert.deepEqual(
        graph.moduleImports.filter(
          ({ importerRepoPath }) => importerRepoPath === "src/product.js",
        ),
        [
          {
            category: "jsdoc-import-type",
            column: 22,
            importerRepoPath: "src/product.js",
            line: 1,
            resolution: "resolved",
            resolvedRepoPath: "src/fixture.test.js",
            specifier: "./fixture.test",
            typeOnly: true,
          },
          {
            category: "jsdoc-import-type",
            column: 22,
            importerRepoPath: "src/product.js",
            line: 3,
            resolution: "resolved",
            resolvedRepoPath: "src/production.js",
            specifier: "./production",
            typeOnly: true,
          },
          {
            category: "jsdoc-import-type",
            column: 22,
            importerRepoPath: "src/product.js",
            line: 5,
            resolution: "external",
            specifier: "react",
            typeOnly: true,
          },
        ],
      );
      assert.deepEqual(
        graph.moduleImports.filter(
          ({ importerRepoPath }) => importerRepoPath === "src/product.mjs",
        ),
        [
          {
            category: "jsdoc-import-type",
            column: 22,
            importerRepoPath: "src/product.mjs",
            line: 1,
            resolution: "resolved",
            resolvedRepoPath: "src/fixture.fixtures.js",
            specifier: "./fixture.fixtures",
            typeOnly: true,
          },
          {
            category: "jsdoc-import-type",
            column: 22,
            importerRepoPath: "src/product.mjs",
            line: 2,
            resolution: "external",
            specifier: "react",
            typeOnly: true,
          },
        ],
      );
    },
  );
});

test("captures static, dynamic, and require evidence with source locations", async () => {
  await withGraphFixture(
    {
      "src/dynamic.ts": [
        'import("./lazy");',
        'require("./required");',
        'export { value } from "./exported";',
      ].join("\n"),
      "src/exported.ts": "export const value = true;\n",
      "src/lazy.ts": "export const lazy = true;\n",
      "src/required.ts": "export const required = true;\n",
    },
    (graph) => {
      const evidence = graph.moduleImports.filter(
        ({ importerRepoPath }) => importerRepoPath === "src/dynamic.ts",
      );
      assert.deepEqual(
        evidence.map(({ category, specifier }) => ({ category, specifier })),
        [
          { category: "dynamic-import", specifier: "./lazy" },
          { category: "require", specifier: "./required" },
          { category: "static-export", specifier: "./exported" },
        ],
      );
      assert.equal(
        evidence.every(({ column, line }) => column > 0 && line > 0),
        true,
      );
      assert.deepEqual(graph.forward.get("src/dynamic.ts"), [
        "src/exported.ts",
        "src/lazy.ts",
        "src/required.ts",
      ]);
    },
  );
});

test("captures conservatively evaluated constant-call semantic strings", async () => {
  await withGraphFixture(
    {
      "src/product.ts": [
        'const parts = (["constant", "Value"] as const);',
        'const key = (parts as readonly string[]).join("-");',
        "export const value = key;",
      ].join("\n"),
    },
    (graph) => {
      assert.deepEqual(
        graph.sourceRecords.get("src/product.ts").semanticFacts.staticStrings,
        ["-", "Value", "constant", "constant-Value"],
      );
    },
  );
});

test("does not evaluate mutable or cyclic const-array bindings", async () => {
  await withGraphFixture(
    {
      "src/product.ts": [
        'const mutable = ["constant", "Value"];',
        'mutable.push("changed");',
        'const mutated = mutable.join("-");',
        'const aliasedSource = ["constant", "Value"];',
        "const alias = aliasedSource;",
        'alias.push("changed");',
        'const aliased = aliasedSource.join("-");',
        'const dynamicMutable = ["constant", "Value"];',
        'const mutation = "push";',
        'dynamicMutable[mutation]("changed");',
        'const dynamicallyMutated = dynamicMutable.join("-");',
        "const first = second;",
        "const second = first;",
        'const cyclic = first.join("-");',
        "export { aliased, cyclic, dynamicallyMutated, mutated };",
      ].join("\n"),
    },
    (graph) => {
      const staticStrings =
        graph.sourceRecords.get("src/product.ts").semanticFacts.staticStrings;
      assert.equal(staticStrings.includes("constant-Value"), false);
    },
  );
});

test("records exported runtime bindings without private lookalikes", async () => {
  await withGraphFixture(
    {
      "src/product.ts": [
        "const privateWriter = async () => true;",
        "const implementation = async () => privateWriter();",
        "export const writeToolcraftCheckpointBundle = implementation;",
        "export { privateWriter as aliasedWriter };",
      ].join("\n"),
    },
    (graph) => {
      assert.deepEqual(
        graph.sourceRecords.get("src/product.ts")
          .semanticFacts.exportedRuntimeBindings,
        ["aliasedWriter", "writeToolcraftCheckpointBundle"],
      );
    },
  );
});

test("records exact static imported call targets without dynamic members", async () => {
  await withGraphFixture(
    {
      "src/checkpoint.ts":
        "export async function writeToolcraftCheckpointBundle() {}\n",
      "src/product.ts": [
        'import fs from "node:fs/promises";',
        'import { appendFile as append } from "node:fs/promises";',
        'import * as checkpoint from "./checkpoint";',
        'const method = "writeToolcraftCheckpointBundle";',
        "export async function run(filePath: string) {",
        '  await fs["writeFile"](filePath, "value");',
        '  await append(filePath, "value");',
        "  await checkpoint.writeToolcraftCheckpointBundle();",
        "  await checkpoint[method]();",
        "}",
      ].join("\n"),
    },
    (graph) => {
      const facts =
        graph.sourceRecords.get("src/product.ts").semanticFacts;
      const callerIds = new Set(
        facts.importedCallTargets.map(
          ({ callerCallableId }) => callerCallableId,
        ),
      );
      assert.equal(callerIds.size, 1);
      assert.deepEqual(facts.exportedCallableBindings, [
        {
          callableId: [...callerIds][0],
          exportedName: "run",
        },
      ]);
      assert.deepEqual(
        facts.importedCallTargets.map(
          ({ callerCallableId: _callerCallableId, ...target }) =>
            target,
        ),
        [
          {
            callerExportNames: ["run"],
            importedName: "default",
            localName: "fs",
            memberPath: "writeFile",
            operation: "writeFile",
            specifier: "node:fs/promises",
          },
          {
            callerExportNames: ["run"],
            importedName: "appendFile",
            localName: "append",
            memberPath: "",
            operation: "appendFile",
            specifier: "node:fs/promises",
          },
          {
            callerExportNames: ["run"],
            importedName: "*",
            localName: "checkpoint",
            memberPath: "writeToolcraftCheckpointBundle",
            operation: "writeToolcraftCheckpointBundle",
            specifier: "./checkpoint",
          },
        ],
      );
    },
  );
});

test("records shadow-safe local calls by exact callable identity", async () => {
  await withGraphFixture(
    {
      "src/product.ts": [
        'import fs from "node:fs/promises";',
        "function writeTarget(filePath: string, contents: string) {",
        "  return fs.writeFile(filePath, contents);",
        "}",
        "export function persistTarget(filePath: string, contents: string) {",
        "  return writeTarget(filePath, contents);",
        "}",
        "export function readTarget(filePath: string) {",
        "  const writeTarget = () => fs.readFile(filePath);",
        "  return writeTarget();",
        "}",
      ].join("\n"),
    },
    (graph) => {
      const facts =
        graph.sourceRecords.get("src/product.ts").semanticFacts;
      const exportsByName = new Map(
        facts.exportedCallableBindings.map(
          ({ callableId, exportedName }) =>
            [exportedName, callableId],
        ),
      );
      const privateWriterId = facts.importedCallTargets.find(
        ({ operation }) => operation === "writeFile",
      ).callerCallableId;
      assert.deepEqual(
        facts.localCallTargets.find(
          ({ callerCallableId }) =>
            callerCallableId === exportsByName.get("persistTarget"),
        ),
        {
          calleeCallableId: privateWriterId,
          callerCallableId: exportsByName.get("persistTarget"),
        },
      );
      assert.notEqual(
        facts.localCallTargets.find(
          ({ callerCallableId }) =>
            callerCallableId === exportsByName.get("readTarget"),
        ).calleeCallableId,
        privateWriterId,
      );
    },
  );
});
