import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createToolcraftLocalDependencyGraph,
  getToolcraftAffectedTestFiles,
  getToolcraftProductionCycleViolations,
  getToolcraftStrongestImporters,
} from "./toolcraft-local-dependency-graph.mjs";
import {
  createToolcraftDefaultSourceAliases,
  loadToolcraftLocalModuleAliases,
} from "./toolcraft-product-dependency-resolution.mjs";
import { collectToolcraftSourceInventory } from "./toolcraft-source-inventory.mjs";

async function withDependencyFixture(
  files,
  assertion,
  { sourceRoots = ["src"] } = {},
) {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-local-dependency-graph-"),
  );

  try {
    for (const [repoPath, source] of Object.entries(files)) {
      const filePath = path.join(rootDir, repoPath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, source);
    }
    const inventory = await collectToolcraftSourceInventory({
      frameworkPathPrefixes: ["src/toolcraft/"],
      includeResourceFiles: true,
      rootDir,
      sourceRoots,
    });
    await assertion({ inventory, rootDir });
  } finally {
    await fs.rm(rootDir, { force: true, recursive: true });
  }
}

async function createGraph({ aliases = [], inventory, rootDir }) {
  return createToolcraftLocalDependencyGraph({
    aliases,
    entries: inventory.entries,
    rootDir,
  });
}

test("builds one immutable graph across source, tests, CSS modules, and resources", async () => {
  await withDependencyFixture(
    {
      "e2e/app-controls.spec.ts":
        'import "../src/app/app-acceptance-data";\n',
      "public/preset.bin": "preset",
      "src/app/app-acceptance-data.ts": "export const acceptance = true;\n",
      "src/app/app-composition.tsx":
        'import { runtime } from "@/toolcraft/runtime";\nimport { Output } from "../features/output";\nvoid Output;\nvoid runtime;\n',
      "src/assets/noise.png": "noise",
      "src/features/output.module.css":
        '.output { background: url("../assets/noise.png"); }\n',
      "src/features/output.test.tsx":
        'import { Output } from "./output";\nvoid Output;\n',
      "src/features/output.tsx":
        'import "./output.module.css";\nexport const Output = null;\n',
      "src/toolcraft/runtime/index.ts": "export const runtime = true;\n",
    },
    async ({ inventory, rootDir }) => {
      const aliases = createToolcraftDefaultSourceAliases(rootDir);
      const graph = await createToolcraftLocalDependencyGraph({
        aliases,
        entries: inventory.entries,
        explicitResourcePaths: ["public/preset.bin"],
        rootDir,
      });

      assert.deepEqual(graph.forward.get("src/features/output.tsx"), [
        "src/features/output.module.css",
      ]);
      assert.deepEqual(graph.forward.get("src/app/app-composition.tsx"), [
        "src/features/output.tsx",
        "src/toolcraft/runtime/index.ts",
      ]);
      assert.deepEqual(graph.reverse.get("src/assets/noise.png"), [
        "src/features/output.module.css",
      ]);
      assert.deepEqual(
        getToolcraftAffectedTestFiles(graph, ["src/features/output.tsx"]),
        ["src/features/output.test.tsx"],
      );
      assert.deepEqual(
        getToolcraftStrongestImporters(graph, "src/assets/noise.png"),
        ["src/app/app-composition.tsx", "src/features/output.tsx"],
      );
      assert.deepEqual(graph.forward.get("public/preset.bin"), []);
      const sourceRecord = graph.sourceRecords.get("src/features/output.tsx");
      assert.equal(
        sourceRecord.rawSource,
        'import "./output.module.css";\nexport const Output = null;\n',
      );
      assert.equal(Object.isFrozen(sourceRecord), true);
      assert.equal(Object.isFrozen(sourceRecord.imports), true);
      assert.equal(Object.isFrozen(sourceRecord.imports[0]), true);
      assert.equal("set" in graph.sourceRecords, false);
      assert.equal(Object.isFrozen(graph.moduleImports), true);
      assert.equal(Object.isFrozen(graph.moduleImports[0]), true);
      assert.throws(() => graph.forward.get("src/features/output.tsx").push("x"));
      assert.throws(() => graph.moduleImports.push({}));
      assert.throws(() => {
        graph.moduleImports[0].resolution = "forged";
      });
      assert.equal("set" in graph.forward, false);
      assert.equal(Object.isFrozen(graph), true);
      assert.equal(Object.isFrozen(graph.entries), true);
    },
    { sourceRoots: ["e2e", "src"] },
  );
});

test("records immutable unresolved local import evidence during graph construction", async () => {
  await withDependencyFixture(
    {
      "outside-product.tsx": "export const outside = true;\n",
      "src/app/app-composition.tsx":
        'import { outside } from "../../outside-product";\nvoid outside;\n',
    },
    async ({ inventory, rootDir }) => {
      const graph = await createGraph({ inventory, rootDir });
      assert.deepEqual(graph.unresolvedImports, [
        {
          importerRepoPath: "src/app/app-composition.tsx",
          reason: "outside-inventory",
          resolvedRepoPath: "outside-product.tsx",
          specifier: "../../outside-product",
        },
      ]);
      assert.throws(() => {
        graph.unresolvedImports[0].reason = "forged";
      });
      assert.throws(() => graph.unresolvedImports.push({}));
    },
  );
});

test("records unsupported subpaths of configured local packages as unresolved local", async () => {
  await withDependencyFixture(
    {
      "packages/local/package.json": JSON.stringify({
        exports: "./src/index.ts",
        name: "@fixture/local",
      }),
      "packages/local/src/index.ts": "export const local = true;\n",
      "src/app.ts": 'import "@fixture/local/missing";\n',
    },
    async ({ inventory, rootDir }) => {
      const aliases = await loadToolcraftLocalModuleAliases({
        packageDirectories: ["packages/local"],
        rootDir,
      });
      const graph = await createGraph({ aliases, inventory, rootDir });
      assert.deepEqual(graph.unresolvedImports, [
        {
          importerRepoPath: "src/app.ts",
          reason: "unresolved-local",
          specifier: "@fixture/local/missing",
        },
      ]);
    },
    { sourceRoots: ["packages", "src"] },
  );
});

test("keeps package identity when only a subpath export resolves", async () => {
  await withDependencyFixture(
    {
      "packages/local/package.json": JSON.stringify({
        exports: { "./button": "./src/button.ts" },
        name: "@fixture/local",
      }),
      "packages/local/src/button.ts": "export const button = true;\n",
      "src/app.ts": [
        'import "@fixture/local";',
        'import "@fixture/local/missing";',
      ].join("\n"),
    },
    async ({ inventory, rootDir }) => {
      const aliases = await loadToolcraftLocalModuleAliases({
        packageDirectories: ["packages/local"],
        rootDir,
      });
      const graph = await createGraph({ aliases, inventory, rootDir });
      assert.deepEqual(
        graph.unresolvedImports.map(({ specifier }) => specifier),
        ["@fixture/local", "@fixture/local/missing"],
      );
    },
    { sourceRoots: ["packages", "src"] },
  );
});

test("keeps package identity when no package export is resolvable", async () => {
  await withDependencyFixture(
    {
      "packages/local/package.json": JSON.stringify({
        exports: { ".": null },
        name: "@fixture/local",
      }),
      "src/app.ts": [
        'import "@fixture/local";',
        'import "@fixture/local/missing";',
      ].join("\n"),
    },
    async ({ inventory, rootDir }) => {
      const aliases = await loadToolcraftLocalModuleAliases({
        packageDirectories: ["packages/local"],
        rootDir,
      });
      const graph = await createGraph({ aliases, inventory, rootDir });
      assert.deepEqual(
        graph.unresolvedImports.map(({ specifier }) => specifier),
        ["@fixture/local", "@fixture/local/missing"],
      );
    },
    { sourceRoots: ["packages", "src"] },
  );
});

test("keeps the complete graph while analyzing only selected entries", async () => {
  await withDependencyFixture(
    {
      "src/app/app-composition.tsx":
        'const runtimePath = "@/toolcraft/runtime";\nvoid import(runtimePath);\n',
      "src/toolcraft/runtime/index.ts":
        'import "./expensive-runtime";\nexport const runtime = true;\n',
      "src/toolcraft/runtime/expensive-runtime.ts":
        "export const expensiveRuntime = true;\n",
    },
    async ({ inventory, rootDir }) => {
      const graph = await createToolcraftLocalDependencyGraph({
        aliases: createToolcraftDefaultSourceAliases(rootDir),
        analyzedEntryPaths: ["src/app/app-composition.tsx"],
        entries: inventory.entries,
        rootDir,
        sourceRecordMode: "imports-only",
      });

      assert.equal(graph.entries.length, inventory.entries.length);
      assert.deepEqual(graph.forward.get("src/app/app-composition.tsx"), [
        "src/toolcraft/runtime/index.ts",
      ]);
      assert.deepEqual(graph.reverse.get("src/toolcraft/runtime/index.ts"), [
        "src/app/app-composition.tsx",
      ]);
      assert.deepEqual(graph.forward.get("src/toolcraft/runtime/index.ts"), []);
      assert.equal(
        "semanticFacts" in graph.sourceRecords.get(
          "src/app/app-composition.tsx",
        ),
        false,
      );
      assert.equal(
        graph.sourceRecords.has("src/toolcraft/runtime/index.ts"),
        false,
      );
      assert.equal(
        graph.sourceRecords.has(
          "src/toolcraft/runtime/expensive-runtime.ts",
        ),
        false,
      );
    },
  );
});

test("rejects unknown selective-analysis entries and source record modes", async () => {
  await withDependencyFixture(
    {
      "src/app/app-composition.tsx":
        "export const composition = true;\n",
    },
    async ({ inventory, rootDir }) => {
      await assert.rejects(
        createToolcraftLocalDependencyGraph({
          analyzedEntryPaths: ["src/app/missing.ts"],
          entries: inventory.entries,
          rootDir,
          sourceRecordMode: "imports-only",
        }),
        /selected unknown entries: src\/app\/missing\.ts/u,
      );
      await assert.rejects(
        createToolcraftLocalDependencyGraph({
          entries: inventory.entries,
          rootDir,
          sourceRecordMode: "dependency-only",
        }),
        /unknown Toolcraft dependency source record mode "dependency-only"/iu,
      );
    },
  );
});

test("reports a complete direct product dependency cycle", async () => {
  await withDependencyFixture(
    {
      "src/a.ts": 'import "./b";\n',
      "src/b.ts": 'import "./a";\n',
    },
    async ({ inventory, rootDir }) => {
      assert.deepEqual(
        getToolcraftProductionCycleViolations(
          await createGraph({ inventory, rootDir }),
        ),
        [
          {
            cycle: ["src/a.ts", "src/b.ts", "src/a.ts"],
            reason:
              "Product production modules must form an acyclic dependency graph.",
            repoPath: "src/a.ts",
          },
        ],
      );
    },
  );
});

test("reports the shortest complete indirect cycle", async () => {
  await withDependencyFixture(
    {
      "src/a.ts": 'import "./b";\n',
      "src/b.ts": 'import "./c";\n',
      "src/c.ts": 'import "./a";\n',
      "src/long-a.ts": 'import "./long-b";\n',
      "src/long-b.ts": 'import "./long-c";\n',
      "src/long-c.ts": 'import "./long-d";\n',
      "src/long-d.ts": 'import "./long-a";\n',
    },
    async ({ inventory, rootDir }) => {
      const [violation] = getToolcraftProductionCycleViolations(
        await createGraph({ inventory, rootDir }),
      );
      assert.deepEqual(violation.cycle, [
        "src/a.ts",
        "src/b.ts",
        "src/c.ts",
        "src/a.ts",
      ]);
    },
  );
});

test("resolves configured tsconfig aliases", async () => {
  await withDependencyFixture(
    {
      "src/a.ts": 'import "@/features/b";\n',
      "src/features/b.ts": 'import "#/a";\n',
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          paths: { "#/*": ["./src/*"], "@/*": ["./src/*"] },
        },
      }),
    },
    async ({ inventory, rootDir }) => {
      const aliases = await loadToolcraftLocalModuleAliases({
        rootDir,
        tsconfigPaths: ["tsconfig.json"],
      });
      assert.deepEqual(
        getToolcraftProductionCycleViolations(
          await createGraph({ aliases, inventory, rootDir }),
        )[0].cycle,
        ["src/a.ts", "src/features/b.ts", "src/a.ts"],
      );
    },
  );
});

test("resolves directory index modules", async () => {
  await withDependencyFixture(
    {
      "src/a.ts": 'import "./feature";\n',
      "src/feature/index.ts": 'export { value } from "../a";\n',
    },
    async ({ inventory, rootDir }) => {
      assert.deepEqual(
        getToolcraftProductionCycleViolations(
          await createGraph({ inventory, rootDir }),
        )[0].cycle,
        ["src/a.ts", "src/feature/index.ts", "src/a.ts"],
      );
    },
  );
});

test("resolves local package exports", async () => {
  await withDependencyFixture(
    {
      "packages/local/package.json": JSON.stringify({
        exports: {
          import: "./src/index.ts",
          types: "./src/index.ts",
        },
        name: "@fixture/local",
      }),
      "packages/local/src/index.ts": 'import "../../../src/a";\n',
      "src/a.ts": 'import "@fixture/local";\n',
    },
    async ({ inventory, rootDir }) => {
      const aliases = await loadToolcraftLocalModuleAliases({
        packageDirectories: ["packages/local"],
        rootDir,
      });
      assert.deepEqual(
        getToolcraftProductionCycleViolations(
          await createGraph({ aliases, inventory, rootDir }),
        )[0].cycle,
        [
          "packages/local/src/index.ts",
          "src/a.ts",
          "packages/local/src/index.ts",
        ],
      );
    },
    { sourceRoots: ["packages", "src"] },
  );
});

test("excludes type-only, test, framework, and external edges from production cycles", async () => {
  await withDependencyFixture(
    {
      "src/a.ts": [
        'import type { B } from "./b";',
        'import React from "react";',
        'import "./toolcraft/runtime";',
        "export const value: B | null = null;",
      ].join("\n"),
      "src/a.test.ts": 'import "./a";\nimport "./test-helper";\n',
      "src/b.ts": 'import type { A } from "./a";\nexport type B = A;\n',
      "src/test-helper.ts": 'import "./a.test";\n',
      "src/toolcraft/runtime.ts": 'import "../a";\n',
    },
    async ({ inventory, rootDir }) => {
      assert.deepEqual(
        getToolcraftProductionCycleViolations(
          await createGraph({ inventory, rootDir }),
        ),
        [],
      );
    },
  );
});
