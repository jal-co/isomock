import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { evaluateGeneratedCodeHealth } from "./check-toolcraft-code-health.mjs";
import {
  codeHealthPassed,
  getLineBudgetViolations,
} from "./toolcraft-code-health-core.mjs";
import { createToolcraftLocalDependencyGraph } from "./toolcraft-local-dependency-graph.mjs";
import { collectToolcraftSourceInventory } from "./toolcraft-source-inventory.mjs";

async function withFixture(files, assertion, prepare = async () => undefined) {
  const fixtureRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-code-health-"),
  );

  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const filePath = path.join(fixtureRoot, relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, source);
    }

    await prepare(fixtureRoot);
    await assertion(await evaluateGeneratedCodeHealth(fixtureRoot));
  } finally {
    await fs.rm(fixtureRoot, { force: true, recursive: true });
  }
}

test("generated code health rejects oversized product source", async () => {
  await withFixture(
    { "src/app/app-schema.ts": "export const value = 1;\n".repeat(1001) },
    (result) => {
      assert.equal(result.lineBudgetViolations.length > 0, true);
      assert.match(result.lineBudgetViolations[0].repoPath, /app-schema\.ts$/);
    },
  );
});

test("generated code health applies the product budget outside src/app", async () => {
  await withFixture(
    { "src/features/large-renderer.ts": "export const value = 1;\n".repeat(701) },
    (result) => {
      assert.deepEqual(
        result.lineBudgetViolations.map((violation) => violation.scope),
        ["src/"],
      );
    },
  );
});

test("scoped budgets use the most specific prefix independent of declaration order", () => {
  const policy = {
    scopedLineBudgets: [
      { maxLines: 700, prefix: "src/", reason: "general source" },
      { maxLines: 400, prefix: "src/features/", reason: "feature source" },
      { maxLines: 500, prefix: "src/features/", reason: "weaker duplicate" },
    ],
  };

  assert.deepEqual(
    getLineBudgetViolations("src/features/renderer.ts", 450, policy).map(
      ({ maxLines, scope }) => ({ maxLines, scope }),
    ),
    [{ maxLines: 400, scope: "src/features/" }],
  );
});

test("generated code health rejects oversized product tests", async () => {
  await withFixture(
    { "e2e/app-controls.spec.ts": "test('product', () => {});\n".repeat(501) },
    (result) => {
      assert.equal(
        result.lineBudgetViolations.some(
          (violation) => violation.scope === "test-file",
        ),
        true,
      );
    },
  );
});

test("generated code health rejects unreviewed type and lint escape hatches", async () => {
  await withFixture(
    {
      "src/app/renderer.ts": [
        "const value = input as " + "any; // claimed review",
        "// eslint-" + "disable-next-line no-console",
      ].join("\n"),
    },
    (result) => {
      assert.deepEqual(
        result.forbiddenPatternViolations.map((violation) => violation.label),
        ["as " + "any", "eslint-" + "disable"],
      );
    },
  );
});

test("generated code health applies an explicit escape-hatch policy to tests", async () => {
  await withFixture(
    {
      "e2e/app-controls.spec.ts": [
        "// @ts-" + "ignore",
        "const value = input as " + "any;",
      ].join("\n"),
    },
    (result) => {
      assert.deepEqual(
        result.forbiddenPatternViolations.map((violation) => violation.label),
        ["@ts-" + "ignore", "as " + "any"],
      );
    },
  );
});

test("generated code health permits localized expected type failures in tests", async () => {
  await withFixture(
    {
      "src/app/value.test.ts":
        "// @ts-" + "expect-error intentional negative type assertion\nvalue();\n",
    },
    (result) => {
      assert.deepEqual(result.forbiddenPatternViolations, []);
    },
  );
});

test("generated code health includes CSS in the canonical source inventory", async () => {
  await withFixture(
    { "src/features/renderer.css": ".item {}\n".repeat(1001) },
    (result) => {
      assert.equal(result.sourceFileCount, 1);
      assert.match(result.lineBudgetViolations[0].repoPath, /renderer\.css$/u);
    },
  );
});

test("generated code health ignores immutable copied runtime source", async () => {
  await withFixture(
    {
      "src/app/app-schema.ts": "export const value = 1;\n",
      "src/toolcraft/runtime/large.ts": "export const runtime = 1;\n".repeat(1500),
    },
    (result) => {
      assert.equal(result.sourceFileCount, 1);
      assert.deepEqual(result.lineBudgetViolations, []);
      assert.deepEqual(result.forbiddenPatternViolations, []);
    },
  );
});

test("generated code health rejects unsigned ownership manifest claims", async () => {
  await withFixture(
    {
      "scripts/platform-runner.mjs": "export const platform = 1;\n".repeat(501),
      "src/app/product.ts": "export const product = 1;\n",
    },
    (result) => {
      assert.equal(result.sourceFileCount, 2);
      assert.deepEqual(
        result.lineBudgetViolations.map(({ repoPath, scope }) => ({
          repoPath,
          scope,
        })),
        [{ repoPath: "scripts/platform-runner.mjs", scope: "scripts/" }],
      );
      assert.deepEqual(result.forbiddenPatternViolations, []);
    },
    async (rootDir) => {
      const manifestPath = path.join(
        rootDir,
        "src/toolcraft/.toolcraft-manifest.json",
      );
      await fs.mkdir(path.dirname(manifestPath), { recursive: true });
      await fs.writeFile(
        manifestPath,
        JSON.stringify({
          protectedFiles: { "scripts/platform-runner.mjs": "signed" },
        }),
      );
    },
  );
});

test("generated code health rejects product cycles resolved through tsconfig aliases", async () => {
  await withFixture(
    {
      "src/app/first.ts": 'import { second } from "@/app/second";\nexport const first = second;\n',
      "src/app/second.ts": 'import { first } from "@/app/first";\nexport const second = first;\n',
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "@/*": ["src/*"] },
        },
      }),
    },
    (result) => {
      assert.deepEqual(result.dependencyCycleViolations, [
        {
          cycle: ["src/app/first.ts", "src/app/second.ts", "src/app/first.ts"],
          reason:
            "Product production modules must form an acyclic dependency graph.",
          repoPath: "src/app/first.ts",
        },
      ]);
      assert.equal(codeHealthPassed(result), false);
    },
  );
});

test("generated code health includes the product boundary in the shared proof", async () => {
  await withFixture(
    {
      "src/app/product.ts":
        'import { fixture } from "@/app/product.test";\nvoid fixture;\n',
      "src/app/product.test.ts": "export const fixture = true;\n",
    },
    (result) => {
      assert.deepEqual(
        result.productBoundary.violations.map(({ kind }) => kind),
        ["production-test-import"],
      );
      assert.equal(codeHealthPassed(result), false);
    },
  );
});

test("shared proof resolves copied runtime imports without checking framework budgets", async () => {
  await withFixture(
    {
      "src/app/product.ts":
        'import { runtime } from "@/toolcraft/runtime";\nvoid runtime;\n',
      "src/toolcraft/runtime/index.ts":
        "export const runtime = true;\n".repeat(1500),
    },
    (result) => {
      assert.equal(result.sourceFileCount, 1);
      assert.deepEqual(result.lineBudgetViolations, []);
      assert.deepEqual(result.forbiddenPatternViolations, []);
      assert.deepEqual(result.productBoundary.violations, []);
    },
  );
});

test("generated proof constructs and shares one inventory and one graph", async () => {
  const scriptsDir = import.meta.dirname;
  const generatedCheckSource = await fs.readFile(
    path.join(scriptsDir, "check-toolcraft-code-health.mjs"),
    "utf8",
  );
  assert.equal(
    generatedCheckSource.match(/collectToolcraftSourceInventory\(\{/gu)?.length,
    1,
  );
  assert.equal(
    generatedCheckSource.match(/createToolcraftLocalDependencyGraph\(\{/gu)
      ?.length,
    1,
  );
  assert.match(generatedCheckSource, /fullEvidenceEntryPaths/u);
  assert.match(generatedCheckSource, /sourceRecordMode: "imports-only"/u);
  assert.equal(
    generatedCheckSource.match(/\binventory,\n\s+localDependencyGraph,/gu)
      ?.length,
    2,
  );

  const boundarySource = await fs.readFile(
    path.join(scriptsDir, "toolcraft-product-boundary.mjs"),
    "utf8",
  );
  assert.doesNotMatch(
    boundarySource,
    /collectToolcraftModuleSpecifiers|createSourceFile|fsPromises|readFile|resolveToolcraftLocalDependency/u,
  );
  const graphSource = await fs.readFile(
    path.join(scriptsDir, "toolcraft-local-dependency-graph.mjs"),
    "utf8",
  );
  assert.match(
    graphSource,
    /createToolcraftDependencySourceRecord/u,
  );
  const dependencySource = await fs.readFile(
    path.join(scriptsDir, "toolcraft-dependency-source-record.mjs"),
    "utf8",
  );
  assert.equal(dependencySource.match(/await fs\.readFile\(/gu)?.length, 1);
  assert.equal(
    dependencySource.match(
      /createToolcraftTypeScriptSourceRecord\(\{/gu,
    )?.length,
    1,
  );
});

test("standalone code health builds only the import evidence it consumes", async () => {
  const source = await fs.readFile(
    path.join(import.meta.dirname, "toolcraft-code-health-core.mjs"),
    "utf8",
  );

  assert.match(
    source,
    /createToolcraftLocalDependencyGraph\(\{[\s\S]*?sourceRecordMode: "imports-only"/u,
  );
});

test("legacy graph and private product-boundary resolver are removed", async () => {
  const scriptsDir = import.meta.dirname;
  const legacyGraphName = ["toolcraft-product", "dependency-graph.mjs"].join(
    "-",
  );
  await assert.rejects(
    fs.access(path.join(scriptsDir, legacyGraphName)),
    { code: "ENOENT" },
  );
  const boundarySource = await fs.readFile(
    path.join(scriptsDir, "toolcraft-product-boundary.mjs"),
    "utf8",
  );
  assert.doesNotMatch(boundarySource, /resolveLocalEntry/u);
  const rootDir = path.resolve(scriptsDir, "..");
  const inventory = await collectToolcraftSourceInventory({
    rootDir,
    sourceRoots: ["scripts"],
  });
  const graph = await createToolcraftLocalDependencyGraph({
    entries: inventory.entries,
    rootDir,
    sourceRecordMode: "imports-only",
  });
  const legacyImporters = graph.moduleImports
    .filter(
      ({ specifier }) =>
        specifier && path.posix.basename(specifier) === legacyGraphName,
    )
    .map(({ importerRepoPath }) => importerRepoPath);
  assert.deepEqual(legacyImporters, []);
});

test("generated code health scans supported JavaScript and TypeScript module extensions", async () => {
  await withFixture(
    { "src/features/oversized.jsx": "export const value = 1;\n".repeat(1001) },
    (result) => {
      assert.equal(result.lineBudgetViolations.length > 0, true);
      assert.match(result.lineBudgetViolations[0].repoPath, /oversized\.jsx$/);
    },
  );
});

test("generated code health rejects symbolic links inside product source roots", async () => {
  await withFixture(
    { "external-product-module.ts": "export const value = 1;\n" },
    (result) => {
      assert.deepEqual(result.filesystemViolations, [
        {
          reason:
            "Symbolic links can move checked source outside the Toolcraft source boundary.",
          repoPath: "src/app/linked-product-module.ts",
        },
      ]);
      assert.equal(codeHealthPassed(result), false);
    },
    async (fixtureRoot) => {
      const appDir = path.join(fixtureRoot, "src/app");
      await fs.mkdir(appDir, { recursive: true });
      await fs.symlink(
        path.join(fixtureRoot, "external-product-module.ts"),
        path.join(appDir, "linked-product-module.ts"),
      );
    },
  );
});
