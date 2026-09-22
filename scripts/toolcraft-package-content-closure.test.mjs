import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { collectToolcraftPackageContentClosure } from "./toolcraft-package-content-closure.mjs";
import { createToolcraftFeaturePlaywrightAuthoritySeal, revalidateToolcraftFeaturePlaywrightAuthoritySeal } from "./toolcraft-feature-playwright-authority-seal.mjs";

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "toolcraft-npm-bin-")));
  t.after(() => fs.rm(root, { force: true, recursive: true }));
  const packageRoot = path.join(root, "node_modules", "fixture");
  const bin = path.join(packageRoot, "node_modules", ".bin");
  await fs.mkdir(bin, { recursive: true });
  await fs.writeFile(path.join(packageRoot, "package.json"), '{"name":"fixture"}');
  const entryPath = path.join(packageRoot, "index.js");
  await fs.writeFile(entryPath, "export const version = 1;");
  await fs.writeFile(path.join(packageRoot, "other.js"), "export const version = 2;");
  const link = path.join(bin, "fixture");
  await fs.symlink("../../index.js", link);
  return { root, packageRoot, link, entryPath, collect: () => collectToolcraftPackageContentClosure({
    boundaryRoot: root, entryPath, projectRoot: root,
  }) };
}

for (const mutation of ["target bytes", "link destination"]) {
  test(`seals npm bin links and rejects changed ${mutation}`, async t => {
    const { root, packageRoot, link, entryPath, collect } = await fixture(t);
    const closure = await collect();
    assert(closure.sources.has("node_modules/fixture/index.js"));
    assert(closure.resolutions.some(item => item.resolvedPath === link && item.realPath === entryPath));
    const seal = await createToolcraftFeaturePlaywrightAuthoritySeal(root, { sourceRecords: new Map() }, [], closure.sources, [], closure.resolutions, closure.directories);
    await revalidateToolcraftFeaturePlaywrightAuthoritySeal(seal);
    if (mutation === "target bytes") await fs.writeFile(entryPath, "export const version = 3;");
    else { await fs.rm(link); await fs.symlink(path.join(packageRoot, "other.js"), link); }
    await assert.rejects(revalidateToolcraftFeaturePlaywrightAuthoritySeal(seal), /changed after authority validation/u);
  });
}

test("rejects npm bin links outside the package boundary", async t => {
  const { root, link, collect } = await fixture(t);
  const external = await fs.mkdtemp(path.join(os.tmpdir(), "toolcraft-external-bin-"));
  t.after(() => fs.rm(external, { force: true, recursive: true }));
  const target = path.join(external, "index.js");
  await fs.writeFile(target, "export {};");
  await fs.rm(link); await fs.symlink(target, link);
  await assert.rejects(collect(), /contained regular package executable/u);
});

test("rejects directory bin links and arbitrary package symlinks", async t => {
  const { packageRoot, link, entryPath, collect } = await fixture(t);
  await fs.rm(link); await fs.symlink(packageRoot, link);
  await assert.rejects(collect(), /contained regular package executable/u);
  await fs.rm(link); await fs.symlink(entryPath, path.join(packageRoot, "linked.js"));
  await assert.rejects(collect(), /symbolic link inside sealed package content/u);
});
