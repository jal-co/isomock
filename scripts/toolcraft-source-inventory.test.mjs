import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  classifyToolcraftSourcePath,
  collectToolcraftSourceInventory,
  collectToolcraftSourceInventorySync,
  createCanonicalGraphEntries,
  resolveToolcraftRootResourcePath,
} from "./toolcraft-source-inventory.mjs";

test("derives inventory extensions from the canonical module extension owner", async () => {
  const source = await fs.readFile(
    new URL("./toolcraft-source-inventory.mjs", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /import \{ toolcraftModuleExtensions \} from\s+"\.\/toolcraft-product-dependency-resolution\.mjs";/u,
  );
});

test("classifies platform, framework, product, test, and generated source", () => {
  const options = {
    protectedFilePaths: ["src/main.tsx", "src/routes/index.tsx"],
  };

  assert.deepEqual(classifyToolcraftSourcePath("src/main.tsx", options), {
    owner: "platform",
    role: "production",
  });
  assert.deepEqual(
    classifyToolcraftSourcePath("src/toolcraft/runtime/react/index.ts", options),
    { owner: "framework", role: "production" },
  );
  assert.deepEqual(
    classifyToolcraftSourcePath("src/features/renderer.tsx", options),
    { owner: "product", role: "production" },
  );
  assert.deepEqual(
    classifyToolcraftSourcePath("src/features/renderer.test.tsx", options),
    { owner: "product", role: "test" },
  );
  for (const repoPath of [
    "src/features/renderer.story.tsx",
    "src/features/renderer.stories.tsx",
  ]) {
    assert.deepEqual(classifyToolcraftSourcePath(repoPath, options), {
      owner: "product",
      role: "test",
    });
  }
  for (const repoPath of [
    "src/features/__tests__/renderer.tsx",
    "src/features/__mocks__/renderer.tsx",
    "src/features/story/renderer.tsx",
    "src/features/stories/renderer.tsx",
    "src/features/support/renderer.tsx",
    "src/features/test/renderer.tsx",
    "src/features/test-support/renderer.tsx",
    "src/features/fixtures/renderer.tsx",
  ]) {
    assert.deepEqual(classifyToolcraftSourcePath(repoPath, options), {
      owner: "product",
      role: "test-support",
    });
  }
  assert.deepEqual(
    classifyToolcraftSourcePath("src/features/renderer-test-utils.ts", options),
    { owner: "product", role: "test-support" },
  );
  for (const repoPath of [
    "src/features/renderer.fixture.tsx",
    "src/features/renderer.fixtures.tsx",
    "src/features/renderer.support.tsx",
  ]) {
    assert.deepEqual(classifyToolcraftSourcePath(repoPath, options), {
      owner: "product",
      role: "test-support",
    });
  }
  assert.deepEqual(
    classifyToolcraftSourcePath(
      "src/schema/define-toolcraft.control-sections.test-support.ts",
      options,
    ),
    { owner: "product", role: "test-support" },
  );
  assert.deepEqual(
    classifyToolcraftSourcePath("src/routes/route-tree.gen.ts", options),
    { owner: "product", role: "generated" },
  );
});

test("collects each source path once and rejects symbolic links", async (context) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "toolcraft-inventory-"));
  context.after(() => fs.rm(rootDir, { force: true, recursive: true }));

  await fs.mkdir(path.join(rootDir, "src/features"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "src/main.tsx"), "export {};\n");
  await fs.writeFile(
    path.join(rootDir, "src/features/renderer.tsx"),
    "export function Renderer() { return null; }\n",
  );
  await fs.symlink(
    path.join(rootDir, "src/features/renderer.tsx"),
    path.join(rootDir, "src/features/renderer-link.tsx"),
  );
  await fs.symlink(
    path.join(rootDir, "src/features/renderer.tsx"),
    path.join(rootDir, "src/features/ignored-link.tsx"),
  );

  const inventory = await collectToolcraftSourceInventory({
    ignoredFilePatterns: [/ignored-link/u],
    protectedFilePaths: ["src/main.tsx"],
    rootDir,
    sourceRoots: ["src", "src/features"],
  });

  assert.deepEqual(
    inventory.entries.map(({ owner, repoPath, role }) => ({ owner, repoPath, role })),
    [
      { owner: "product", repoPath: "src/features/renderer.tsx", role: "production" },
      { owner: "platform", repoPath: "src/main.tsx", role: "production" },
    ],
  );
  assert.deepEqual(inventory.filesystemViolations, [
    {
      reason:
        "Symbolic links can move checked source outside the Toolcraft source boundary.",
      repoPath: "src/features/ignored-link.tsx",
    },
    {
      reason:
        "Symbolic links can move checked source outside the Toolcraft source boundary.",
      repoPath: "src/features/renderer-link.tsx",
    },
  ]);

  assert.deepEqual(
    collectToolcraftSourceInventorySync({
      ignoredFilePatterns: [/ignored-link/u],
      protectedFilePaths: ["src/main.tsx"],
      rootDir,
      sourceRoots: ["src", "src/features"],
    }),
    inventory,
  );
});

test("rejects a symbolic link used as a configured source root", async (context) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "toolcraft-inventory-root-"));
  context.after(() => fs.rm(rootDir, { force: true, recursive: true }));

  await fs.mkdir(path.join(rootDir, "outside-source"), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, "outside-source/product.ts"),
    "export const product = true;\n",
  );
  await fs.symlink(
    path.join(rootDir, "outside-source"),
    path.join(rootDir, "linked-source"),
  );

  const inventory = collectToolcraftSourceInventorySync({
    rootDir,
    sourceRoots: ["linked-source"],
  });

  assert.deepEqual(inventory.entries, []);
  assert.deepEqual(inventory.filesystemViolations, [
    {
      reason:
        "Symbolic links can move checked source outside the Toolcraft source boundary.",
      repoPath: "linked-source",
    },
  ]);
});

test("rejects a parent-relative explicit resource outside the root", async (context) => {
  const fixtureDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-explicit-resource-relative-"),
  );
  context.after(() => fs.rm(fixtureDir, { force: true, recursive: true }));
  const rootDir = path.join(fixtureDir, "app");
  await fs.mkdir(rootDir);
  await fs.writeFile(path.join(fixtureDir, "outside.ts"), "outside\n");

  assert.throws(
    () =>
      createCanonicalGraphEntries({
        entries: [],
        explicitResourcePaths: ["../outside.ts"],
        rootDir,
      }),
    (error) => {
      assert.equal(error.code, "TOOLCRAFT_RESOURCE_ROOT_ESCAPE");
      assert.match(error.message, /\.\.\/outside\.ts/u);
      assert.match(error.message, /outside the configured root boundary/u);
      return true;
    },
  );
});

test("rejects an absolute explicit resource path", async (context) => {
  const fixtureDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-explicit-resource-absolute-"),
  );
  context.after(() => fs.rm(fixtureDir, { force: true, recursive: true }));
  const rootDir = path.join(fixtureDir, "app");
  const resourcePath = path.join(fixtureDir, "outside.ts");
  await fs.mkdir(rootDir);
  await fs.writeFile(resourcePath, "outside\n");

  assert.throws(
    () =>
      createCanonicalGraphEntries({
        entries: [],
        explicitResourcePaths: [resourcePath],
        rootDir,
      }),
    (error) => {
      assert.equal(error.code, "TOOLCRAFT_RESOURCE_ROOT_ESCAPE");
      assert.equal(error.message.includes(resourcePath), true);
      assert.match(error.message, /must be root-relative/u);
      return true;
    },
  );
});

test("rejects an explicit resource through a symlinked parent", async (context) => {
  const fixtureDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-explicit-resource-symlink-"),
  );
  context.after(() => fs.rm(fixtureDir, { force: true, recursive: true }));
  const rootDir = path.join(fixtureDir, "app");
  const outsideDir = path.join(fixtureDir, "outside");
  await fs.mkdir(rootDir);
  await fs.mkdir(outsideDir);
  await fs.writeFile(path.join(outsideDir, "resource.ts"), "outside\n");
  try {
    await fs.symlink(outsideDir, path.join(rootDir, "linked-parent"));
  } catch (error) {
    if (["EACCES", "ENOSYS", "EPERM"].includes(error?.code)) {
      context.skip(`symbolic links are unavailable: ${error.code}`);
      return;
    }
    throw error;
  }

  assert.throws(
    () =>
      createCanonicalGraphEntries({
        entries: [],
        explicitResourcePaths: ["linked-parent/resource.ts"],
        rootDir,
      }),
    (error) => {
      assert.equal(error.code, "TOOLCRAFT_RESOURCE_ROOT_ESCAPE");
      assert.match(error.message, /linked-parent\/resource\.ts/u);
      assert.match(error.message, /resolves outside the root boundary/u);
      return true;
    },
  );
});

test("accepts an in-root explicit public resource", async (context) => {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-explicit-resource-valid-"),
  );
  context.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  await fs.mkdir(path.join(rootDir, "public"));
  await fs.writeFile(path.join(rootDir, "public/preset.bin"), "preset\n");

  assert.deepEqual(
    createCanonicalGraphEntries({
      entries: [],
      explicitResourcePaths: ["public/preset.bin"],
      rootDir,
    }).map(({ repoPath }) => repoPath),
    ["public/preset.bin"],
  );
});

test("resolves only root-relative resources whose real path stays in root", async (context) => {
  const fixtureDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-root-resource-resolver-"),
  );
  context.after(() => fs.rm(fixtureDir, { force: true, recursive: true }));
  const rootDir = path.join(fixtureDir, "app");
  const outsideDir = path.join(fixtureDir, "outside");
  await fs.mkdir(path.join(rootDir, "nested"), { recursive: true });
  await fs.mkdir(outsideDir);
  await fs.writeFile(path.join(rootDir, "nested/resource.json"), "{}\n");
  await fs.writeFile(path.join(outsideDir, "escaped.json"), "{}\n");

  assert.equal(
    resolveToolcraftRootResourcePath("nested/resource.json", rootDir),
    path.join(rootDir, "nested/resource.json"),
  );
  const missingResourcePath = path.join(rootDir, "missing/deep/resource.json");
  assert.equal(
    resolveToolcraftRootResourcePath("missing/deep/resource.json", rootDir),
    missingResourcePath,
  );
  await assert.rejects(() => fs.lstat(missingResourcePath), { code: "ENOENT" });
  for (const resourcePath of [
    path.join(outsideDir, "escaped.json"),
    "../outside/escaped.json",
  ]) {
    assert.throws(
      () => resolveToolcraftRootResourcePath(resourcePath, rootDir),
      (error) => error.code === "TOOLCRAFT_RESOURCE_ROOT_ESCAPE",
    );
  }

  try {
    await fs.symlink(outsideDir, path.join(rootDir, "linked"));
  } catch (error) {
    if (["EACCES", "ENOSYS", "EPERM"].includes(error?.code)) {
      context.skip(`symbolic links are unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  assert.throws(
    () => resolveToolcraftRootResourcePath("linked/escaped.json", rootDir),
    (error) => error.code === "TOOLCRAFT_RESOURCE_ROOT_ESCAPE",
  );
});
