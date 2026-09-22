import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { revalidateToolcraftFeaturePlaywrightAuthoritySeal, validateToolcraftFeaturePlaywrightAuthority } from "./toolcraft-feature-playwright-authority.mjs";
import { createToolcraftFeaturePlaywrightAuthoritySeal } from "./toolcraft-feature-playwright-authority-seal.mjs";

async function createFixture() {
  const projectDir = await mkdtemp(path.join(tmpdir(), "toolcraft-config-authority-"));
  await mkdir(path.join(projectDir, "e2e"), { recursive: true });
  await writeFile(path.join(projectDir, "e2e/selected.spec.ts"), "export {};");
  await writeFile(path.join(projectDir, "tsconfig.json"), "{}");
  await writeFile(path.join(projectDir, "playwright.config.ts"), "export default {};");
  return projectDir;
}

const validate = (projectDir) => validateToolcraftFeaturePlaywrightAuthority({
  files: ["e2e/selected.spec.ts"], productFilePaths: ["e2e/selected.spec.ts"], projectDir,
});

test("accepts only declarative static Playwright config composition", async () => {
  const projectDir = await createFixture();
  try {
    for (const source of ["const unknown=getConfig(); export default {...unknown};", "export default condition ? {} : getConfig();",
      "export default defineConfig({},getConfig());", "export default {get reporter(){return []}};", "export default {get ['repo'+'rter'](){return []}};",
      "const config={}; config.reporter=[]; export default config;", "const config={}; Reflect.set(config,'reporter',[]); export default config;",
      "const config={}; mutate(config); export default config;", "const config={reporter:[]}; const {reporter}=config; reporter.push([]); export default config;",
      "const config={}; Function.prototype.call.call(mutate,null,config); export default config;", "let config={}; config=getConfig(); export default config;",
      "const config={}; const alias=condition?config:{}; alias.reporter=[]; export default config;", "const config={}; for(const item of [config]) mutate(item); export default config;",
      "const defineConfig=(value)=>value; export default defineConfig({});", "function defineConfig(value){return value} export default defineConfig({});"]) {
      await writeFile(path.join(projectDir, "playwright.config.ts"), source);
      await assert.rejects(validate(projectDir), /unresolved executable Playwright config|opaque use/iu, source);
    }
    await writeFile(path.join(projectDir, "playwright.config.ts"), "const config={}; function safe(config){return config.label} void safe; export default config;");
    await validate(projectDir);
    await writeFile(path.join(projectDir, "reporter.ts"), "export default class Reporter {}");
    for (const source of ["import {defineConfig as dc} from '@playwright/test'; const focused=[['./reporter.ts']]; export default dc({reporter:[...(process.env.PLAN?focused:[])]});",
      "import * as pw from '@playwright/test'; export default pw.defineConfig({reporter:[['./reporter.ts']]});"]) {
      await writeFile(path.join(projectDir, "playwright.config.ts"), source);
      const receipt = await validate(projectDir);
      assert.equal(receipt.seal.files.some(({ repoPath }) => repoPath === "reporter.ts"), true);
    }
    await writeFile(path.join(projectDir, "outer.ts"), "export default class Outer {}");
    await writeFile(path.join(projectDir, "inner.ts"), "export default class Inner {}");
    await writeFile(path.join(projectDir, "playwright.config.ts"), "const reporter=[['./outer.ts']]; { const reporter=[['./inner.ts']]; void reporter; } const config={reporter}; { const config=getConfig(); void config; } export default config;");
    const lexicalReceipt = await validate(projectDir);
    assert.equal(lexicalReceipt.seal.files.some(({ repoPath }) => repoPath === "outer.ts"), true);
    assert.equal(lexicalReceipt.seal.files.some(({ repoPath }) => repoPath === "inner.ts"), false);
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});

test("rejects unresolved loads through strict local config and reporter relays", async () => {
  const projectDir = await createFixture(), packageDir = path.join(projectDir, "node_modules/config-relay");
  try {
    await mkdir(packageDir, { recursive: true });
    await writeFile(path.join(packageDir, "package.json"), '{"name":"config-relay","type":"module","exports":"./index.js"}');
    await writeFile(path.join(packageDir, "index.js"), "await import(process.env.REPORTER); export default class Reporter {}");
    for (const setup of [
      ["import './config-helper.ts'; export default {};", "config-helper.ts", "import 'config-relay';"],
      ["export default {reporter:[['./reporter.ts']]};", "reporter.ts", "import 'config-relay'; export default class Reporter {}"],
    ]) {
      await writeFile(path.join(projectDir, "playwright.config.ts"), setup[0]);
      await writeFile(path.join(projectDir, setup[1]), setup[2]);
      await assert.rejects(validate(projectDir), /statically resolvable/iu);
    }
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});

test("seals complete shallow toolchain package content including dynamic children", async () => {
  const projectDir = await createFixture(), packageDir = path.join(projectDir, "node_modules/vite-relay"), childDir = path.join(projectDir, "node_modules/vite-child"), undeclaredDir = path.join(projectDir, "node_modules/hoisted-dynamic"), scopedDir = path.join(projectDir, "node_modules/@sealed/existing");
  try {
    await mkdir(packageDir, { recursive: true }); await mkdir(childDir, { recursive: true }); await mkdir(undeclaredDir, { recursive: true }); await mkdir(scopedDir, { recursive: true });
    await writeFile(path.join(packageDir, "package.json"), '{"name":"vite-relay","type":"module","exports":"./index.js","dependencies":{"vite-child":"1.0.0"}}');
    await writeFile(path.join(packageDir, "index.js"), "const name='vite-child'; await import(name);");
    await writeFile(path.join(childDir, "package.json"), '{"name":"vite-child","type":"module","exports":{"import":"./index.js"}}');
    await writeFile(path.join(childDir, "index.js"), "export const value='sealed';");
    await writeFile(path.join(undeclaredDir, "package.json"), '{"name":"hoisted-dynamic","type":"module","exports":"./index.js"}');
    await writeFile(path.join(undeclaredDir, "index.js"), "export const value='hoisted';");
    await writeFile(path.join(scopedDir, "package.json"), '{"name":"@sealed/existing","type":"module","exports":"./index.js"}');
    await writeFile(path.join(scopedDir, "index.js"), "export const value='scoped';");
    await writeFile(path.join(projectDir, "vite.config.ts"), "import 'vite-relay'; export default {};");
    const receipt = await validate(projectDir);
    assert.equal(receipt.seal.files.some(({ repoPath }) => repoPath.endsWith("/vite-child/index.js")), true);
    assert.equal(receipt.seal.files.some(({ repoPath }) => repoPath.endsWith("/hoisted-dynamic/index.js")), true);
    const addedPackage = path.join(projectDir, "node_modules/added-after-validation");
    await mkdir(addedPackage); await writeFile(path.join(addedPackage, "package.json"), '{"name":"added-after-validation"}');
    await assert.rejects(revalidateToolcraftFeaturePlaywrightAuthoritySeal(receipt.seal), /directory membership changed/iu);
    await rm(addedPackage, { force: true, recursive: true });
    const addedScopedPackage = path.join(projectDir, "node_modules/@sealed/appeared");
    await mkdir(addedScopedPackage); await writeFile(path.join(addedScopedPackage, "package.json"), '{}');
    await assert.rejects(revalidateToolcraftFeaturePlaywrightAuthoritySeal(receipt.seal), /directory membership changed/iu);
    await rm(addedScopedPackage, { force: true, recursive: true });
    const addedPath = path.join(packageDir, "dynamic-added.js");
    await writeFile(addedPath, "export const added=true;");
    await assert.rejects(revalidateToolcraftFeaturePlaywrightAuthoritySeal(receipt.seal), /directory membership changed/iu);
    await rm(addedPath);
    await writeFile(path.join(undeclaredDir, "index.js"), "export const value='mutated';");
    await assert.rejects(revalidateToolcraftFeaturePlaywrightAuthoritySeal(receipt.seal), /changed after authority validation/iu);
    await writeFile(path.join(undeclaredDir, "index.js"), "export const value='hoisted';");
    await writeFile(path.join(childDir, "index.js"), "export const value='mutated';");
    await assert.rejects(revalidateToolcraftFeaturePlaywrightAuthoritySeal(receipt.seal), /changed after authority validation/iu);
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});

test("seals ancestor Node search-directory packages and membership", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "toolcraft-package-universe-")), projectDir = path.join(workspace, "packages/app");
  const relayDir = path.join(projectDir, "node_modules/vite-relay"), ancestorDir = path.join(workspace, "node_modules/ancestor-dynamic");
  try {
    await mkdir(path.join(projectDir, "e2e"), { recursive: true }); await mkdir(relayDir, { recursive: true }); await mkdir(ancestorDir, { recursive: true });
    await writeFile(path.join(workspace, "pnpm-workspace.yaml"), "packages: ['app']\n");
    await writeFile(path.join(projectDir, "e2e/selected.spec.ts"), "export {};"); await writeFile(path.join(projectDir, "tsconfig.json"), "{}");
    await writeFile(path.join(projectDir, "playwright.config.ts"), "export default {};"); await writeFile(path.join(projectDir, "vite.config.ts"), "import 'vite-relay'; export default {};");
    await writeFile(path.join(relayDir, "package.json"), '{"name":"vite-relay","type":"module","exports":"./index.js"}');
    await writeFile(path.join(relayDir, "index.js"), "await import(process.env.DYNAMIC_PACKAGE);");
    await writeFile(path.join(ancestorDir, "package.json"), '{"name":"ancestor-dynamic","type":"module","exports":"./index.js"}');
    await writeFile(path.join(ancestorDir, "index.js"), "export const value='sealed';");
    const receipt = await validate(projectDir);
    assert.equal(receipt.seal.files.some(({ repoPath }) => repoPath.endsWith("/ancestor-dynamic/index.js")), true);
    await writeFile(path.join(ancestorDir, "index.js"), "export const value='mutated';");
    await assert.rejects(revalidateToolcraftFeaturePlaywrightAuthoritySeal(receipt.seal), /changed after authority validation/iu);
    await writeFile(path.join(ancestorDir, "index.js"), "export const value='sealed';");
    const previouslyAbsentSearchDir = path.join(workspace, "packages/node_modules");
    await mkdir(path.join(previouslyAbsentSearchDir, "appeared"), { recursive: true });
    await writeFile(path.join(previouslyAbsentSearchDir, "appeared/package.json"), "{}");
    await assert.rejects(revalidateToolcraftFeaturePlaywrightAuthoritySeal(receipt.seal), /directory membership changed/iu);
    await rm(previouslyAbsentSearchDir, { force: true, recursive: true });
    const added = path.join(workspace, "node_modules/added-ancestor"); await mkdir(added); await writeFile(path.join(added, "package.json"), "{}");
    await assert.rejects(revalidateToolcraftFeaturePlaywrightAuthoritySeal(receipt.seal), /directory membership changed/iu);
  } finally { await rm(workspace, { force: true, recursive: true }); }
});

test("rejects an inspected source deleted before seal creation", async () => {
  const projectDir = await createFixture(), repoPath = "reporter.ts", filePath = path.join(projectDir, repoPath);
  try {
    await writeFile(filePath, "export default class Reporter {}");
    const inspected = new Map([[repoPath, await readFile(filePath)]]); await rm(filePath);
    await assert.rejects(createToolcraftFeaturePlaywrightAuthoritySeal(projectDir, { sourceRecords: new Map() }, [], inspected), /ENOENT|no such file/iu);
    await writeFile(filePath, "export default class Reporter {}");
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});

test("rejects package membership added between inspection and seal creation", async () => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "toolcraft-directory-snapshot-"));
  const directoryPath = path.join(projectDir, "node_modules");
  try {
    const directories = new Map([["node_modules", { absolutePath: directoryPath, entries: Object.freeze([]), exists: false }]]);
    await mkdir(path.join(directoryPath, "appeared"), { recursive: true });
    await assert.rejects(createToolcraftFeaturePlaywrightAuthoritySeal(projectDir,
      { sourceRecords: new Map() }, [], new Map(), [], [], directories), /directory membership changed during authority validation/iu);
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});

test("rejects a package symlink escaping to a sibling prefix path", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "toolcraft-contained-boundary-"));
  const projectDir = path.join(workspace, "app"), escapeDir = `${workspace}-escape`, relayLink = path.join(projectDir, "node_modules/vite-relay");
  try {
    await mkdir(path.join(projectDir, "e2e"), { recursive: true }); await mkdir(path.join(projectDir, "node_modules"), { recursive: true }); await mkdir(escapeDir);
    await writeFile(path.join(workspace, "pnpm-workspace.yaml"), "packages: ['app']\n");
    await writeFile(path.join(projectDir, "e2e/selected.spec.ts"), "export {};"); await writeFile(path.join(projectDir, "tsconfig.json"), "{}");
    await writeFile(path.join(projectDir, "playwright.config.ts"), "export default {};"); await writeFile(path.join(projectDir, "vite.config.ts"), "import 'vite-relay'; export default {};");
    await writeFile(path.join(escapeDir, "package.json"), '{"name":"vite-relay","type":"module","exports":"./index.js"}');
    await writeFile(path.join(escapeDir, "index.js"), "export const value=true;"); await symlink(escapeDir, relayLink);
    await assert.rejects(validate(projectDir), (error) => {
      assert.match(error.message, /not a contained regular file|outside the contained package boundary/iu);
      assert.doesNotMatch(error.message, /\.\.\//u);
      return true;
    });
  } finally { await rm(workspace, { force: true, recursive: true }); await rm(escapeDir, { force: true, recursive: true }); }
});
