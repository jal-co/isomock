import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  hasVerifiedProductTestFacade,
  revalidateToolcraftFeaturePlaywrightAuthoritySeal,
  revalidateToolcraftProductTestFacade,
  validateToolcraftFeaturePlaywrightAuthority,
} from "./toolcraft-feature-playwright-authority.mjs";
import { createToolcraftIntegrityFixture } from "./toolcraft-integrity-test-utils.mjs";
import { collectToolcraftPlaywrightBindingProvenanceViolations } from "./toolcraft-playwright-test-type-provenance.mjs";
test("rejects direct Playwright authority in a selected spec local import closure", async () => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "toolcraft-feature-authority-"));
  try {
    await mkdir(path.join(projectDir, "e2e"), { recursive: true });
    await writeFile(path.join(projectDir, "tsconfig.json"), JSON.stringify({}), "utf8");
    await writeFile(path.join(projectDir, "e2e", "selected.spec.ts"), 'import "./timeout-bypass";\n', "utf8");
    await writeFile(path.join(projectDir, "e2e", "timeout-bypass.ts"), 'import { test } from "@playwright/test";\ntest.slow();\n', "utf8");
    await assert.rejects(
      validateToolcraftFeaturePlaywrightAuthority({
        files: ["e2e/selected.spec.ts"],
        projectDir,
      }),
      /timeout-bypass\.ts.*Direct Playwright runtime authority/isu,
    );
  } finally {
    await rm(projectDir, { force: true, recursive: true });
  }
});
test("rejects a missing Playwright config authority root", async () => {
  const projectDir = await createToolcraftIntegrityFixture();
  try {
    await writeFile(path.join(projectDir, "e2e/selected.spec.ts"), "export {};\n");
    await rm(path.join(projectDir, "playwright.config.ts"));
    await assert.rejects(validateToolcraftFeaturePlaywrightAuthority({
      files: ["e2e/selected.spec.ts"], productFilePaths: ["e2e/selected.spec.ts"], projectDir,
    }), /playwright\.config\.ts required signed config authority is missing or changed/iu);
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});
test("ignores forbidden authority outside the selected local closure", async () => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "toolcraft-feature-authority-"));
  try {
    await mkdir(path.join(projectDir, "e2e"), { recursive: true });
    await writeFile(path.join(projectDir, "tsconfig.json"), JSON.stringify({}), "utf8");
    await writeFile(path.join(projectDir, "e2e", "selected.spec.ts"), "export {};\n", "utf8");
    await writeFile(
      path.join(projectDir, "e2e", "unrelated.spec.ts"),
      'import { test } from "@playwright/test";\ntest.setTimeout(999999);\n',
      "utf8",
    );
    await validateToolcraftFeaturePlaywrightAuthority({
      files: ["e2e/selected.spec.ts"],
      projectDir,
    });
  } finally {
    await rm(projectDir, { force: true, recursive: true });
  }
});
test("ignores an unrelated source symlink outside the selected closure", async () => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "toolcraft-feature-authority-"));
  try {
    await mkdir(path.join(projectDir, "e2e"), { recursive: true });
    await writeFile(path.join(projectDir, "tsconfig.json"), "{}", "utf8");
    await writeFile(path.join(projectDir, "e2e", "selected.spec.ts"), "export {};\n", "utf8");
    await writeFile(path.join(projectDir, "outside.ts"), "export {};\n", "utf8");
    await symlink("../outside.ts", path.join(projectDir, "e2e", "unrelated.ts"));
    await validateToolcraftFeaturePlaywrightAuthority({
      files: ["e2e/selected.spec.ts"],
      projectDir,
    });
  } finally {
    await rm(projectDir, { force: true, recursive: true });
  }
});
test("rejects a directly selected source symlink", async () => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "toolcraft-feature-authority-"));
  try {
    await mkdir(path.join(projectDir, "e2e"), { recursive: true });
    await writeFile(path.join(projectDir, "tsconfig.json"), "{}", "utf8");
    await writeFile(path.join(projectDir, "target.spec.ts"), "export {};\n", "utf8");
    await symlink("../target.spec.ts", path.join(projectDir, "e2e", "selected.spec.ts"));
    await assert.rejects(
      validateToolcraftFeaturePlaywrightAuthority({
        files: ["e2e/selected.spec.ts"],
        projectDir,
      }),
      /selected\.spec\.ts.*Symbolic links/isu,
    );
  } finally {
    await rm(projectDir, { force: true, recursive: true });
  }
});

test("rejects a source symlink imported by the selected closure", async () => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "toolcraft-feature-authority-"));
  try {
    await mkdir(path.join(projectDir, "e2e"), { recursive: true });
    await writeFile(path.join(projectDir, "tsconfig.json"), "{}", "utf8");
    await writeFile(
      path.join(projectDir, "e2e", "selected.spec.ts"),
      'import "./linked-helper";\n',
      "utf8",
    );
    await writeFile(path.join(projectDir, "helper.ts"), "export {};\n", "utf8");
    await symlink("../helper.ts", path.join(projectDir, "e2e", "linked-helper.ts"));
    await assert.rejects(
      validateToolcraftFeaturePlaywrightAuthority({
        files: ["e2e/selected.spec.ts"],
        projectDir,
      }),
      /linked-helper\.ts.*Symbolic links/isu,
    );
  } finally {
    await rm(projectDir, { force: true, recursive: true });
  }
});
async function createProvenanceFixture(files) {
  const projectDir = await mkdtemp(path.join(tmpdir(), "toolcraft-provenance-"));
  await mkdir(path.join(projectDir, "e2e"), { recursive: true });
  await writeFile(path.join(projectDir, "tsconfig.json"), "{}", "utf8");
  await Promise.all(Object.entries(files).map(async ([name, source]) => {
    const filePath = path.join(projectDir, "e2e", name);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, source, "utf8");
  }));
  await writeFile(path.join(projectDir, "playwright.config.ts"), "export default {};", "utf8");
  return projectDir;
}

test("rejects raw framework TestType bridges while allowing safe helpers", async () => {
  const projectDir = await createProvenanceFixture({
    "bridge.ts": 'import { expect, test as base } from "@playwright/test";\nexport const test = base.extend({});\nexport { expect };\nexport function safeHelper(label) { return String(label); }\n',
    "selected.spec.ts": 'import { test } from "./bridge";\ntest.setTimeout(9);\n',
  });
  try {
    const validationInput = {
      files: ["e2e/selected.spec.ts"],
      productFilePaths: ["e2e/selected.spec.ts"],
      protectedFilePaths: ["e2e/bridge.ts"],
      projectDir,
    };
    await assert.rejects(
      validateToolcraftFeaturePlaywrightAuthority(validationInput),
      /verified protected product-test facade/iu,
    );
    for (const source of [
      'import { test } from "./bridge"; const proxy = new Proxy(test, {}); proxy.setTimeout(9);',
      'import { test } from "./bridge"; Reflect.apply(test, undefined, ["unsafe", async () => {}]);',
    ]) {
      await writeFile(path.join(projectDir, "e2e/selected.spec.ts"), source);
      await assert.rejects(validateToolcraftFeaturePlaywrightAuthority(validationInput),
        /verified protected product-test facade/iu, source);
    }
    await writeFile(path.join(projectDir, "e2e/selected.spec.ts"), 'import fs from "node:fs/promises"; import { expect, safeHelper } from "./bridge";\nvoid expect; safeHelper("ok"); fs.readFile("safe.txt");\n');
    await validateToolcraftFeaturePlaywrightAuthority(validationInput);
  } finally {
    await rm(projectDir, { force: true, recursive: true });
  }
});

test("treats only the verified product-test facade as an opaque authority boundary", () => {
  const helperPath = "e2e/evidence-helper.ts";
  const facadePath = "e2e/toolcraft-product-test.ts";
  const productPath = "e2e/product.spec.ts";
  const moduleImports = [
    { importerRepoPath: helperPath, specifier: "@playwright/test" },
    { importerRepoPath: facadePath, resolvedRepoPath: helperPath, specifier: "./evidence-helper" },
    { importerRepoPath: productPath, resolvedRepoPath: facadePath, specifier: "./toolcraft-product-test" },
  ];
  const graph = {
    moduleImports,
    reverse: new Map([[helperPath, [facadePath]], [facadePath, [productPath]]]),
    sourceRecords: new Map([
      [helperPath, { rawSource: 'import { expect } from "@playwright/test"; export async function prove(observe) { let current; await expect.poll(async () => { current = await observe(); return current; }).not.toEqual({}); return current; }' }],
      [facadePath, { rawSource: 'export { prove } from "./evidence-helper";' }],
      [productPath, { rawSource: 'import { prove } from "./toolcraft-product-test"; prove("visible");' }],
    ]),
  };
  const input = {
    entryByPath: new Map([[helperPath, { owner: "framework" }], [facadePath, { owner: "framework" }], [productPath, { owner: "product" }]]),
    frameworkFilePaths: new Set([helperPath, facadePath]),
    graph,
    productFilePaths: new Set([productPath]),
    reachablePaths: [helperPath, facadePath, productPath],
  };

  const unsignedViolations = collectToolcraftPlaywrightBindingProvenanceViolations({ ...input, verifiedFacade: false });
  assert.ok(unsignedViolations.length > 0);
  assert.deepEqual(
    collectToolcraftPlaywrightBindingProvenanceViolations({ ...input, verifiedFacade: true }),
    [],
  );
});

test("rejects statically analyzable Node loader indirection to Playwright", async () => {
  const projectDir = await createProvenanceFixture({ "selected.spec.ts": "export {};" });
  try {
    for (const source of [
      'import { createRequire } from "node:module"; const load = createRequire(import.meta.url); load("@playwright/test");',
      'import { createRequire as makeLoader } from "node:module"; makeLoader(import.meta.url)("@playwright/test");',
      'import * as moduleApi from "node:module"; const load = moduleApi.createRequire(import.meta.url); load("@playwright/test");',
      'import moduleApi from "node:module"; const { createRequire: make } = moduleApi; const load = make(import.meta.url); load("@playwright/test");',
      'const load = module.require; load("@playwright/test");',
      'module.require("@playwright/test");',
    ]) {
      await writeFile(path.join(projectDir, "e2e/selected.spec.ts"), source);
      await assert.rejects(validateToolcraftFeaturePlaywrightAuthority({
        files: ["e2e/selected.spec.ts"], productFilePaths: ["e2e/selected.spec.ts"], projectDir,
      }), /Direct Playwright runtime authority/iu);
    }
  } finally {
    await rm(projectDir, { force: true, recursive: true });
  }
});

test("replays repeated callback effects for each substituted argument", async () => {
  const projectDir = await createProvenanceFixture({
    "bridge.ts": 'import { test as base } from "@playwright/test"; export function mutate(value) { value.test = base; } export function invokeTwice(fn, first, second) { fn(first); fn(second); }',
    "selected.spec.ts": 'import { invokeTwice, mutate } from "./bridge"; const first = {}; const second = {}; invokeTwice(mutate, first, second); void second.test;',
  });
  try {
    await assert.rejects(validateToolcraftFeaturePlaywrightAuthority({
      files: ["e2e/selected.spec.ts"], productFilePaths: ["e2e/selected.spec.ts"],
      protectedFilePaths: ["e2e/bridge.ts"], projectDir,
    }), /verified protected product-test facade/iu);
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});

test("fails closed for Proxy and Reflect indirection while preserving exact safe forms", async () => {
  const projectDir = await createProvenanceFixture({
    "bridge.ts": 'import { test as base } from "@playwright/test"; export { base }; export function mutate(value) { value.test = base; } export const identity = value => value;',
    "selected.spec.ts": "export {};",
  });
  const input = { files: ["e2e/selected.spec.ts"], productFilePaths: ["e2e/selected.spec.ts"],
    protectedFilePaths: ["e2e/bridge.ts"], projectDir };
  try {
    for (const source of [
      'import { base } from "./bridge"; const P = Proxy; void new P({}, { get() { return base; } }).test;',
      'import { base } from "./bridge"; const P = Proxy; void P["revocable"](base, {}).proxy;',
      'import { base } from "./bridge"; const R = Reflect; void R["get"]({ test: base }, "test");',
      'import { mutate } from "./bridge"; const holder = {}; const R = Reflect; R["apply"](mutate, null, [holder]); void holder.test;',
      'import { base, identity } from "./bridge"; const { apply } = Reflect; void apply(identity, null, [base]);',
      'import { base } from "./bridge"; const { get } = Reflect; void get({ test: base }, "test");',
      'import { base } from "./bridge"; void new globalThis.Proxy(base, {});',
      'import { base } from "./bridge"; void new global.Proxy(base, {});',
      'import { base } from "./bridge"; void global.Reflect.get({ test: base }, "test");',
      'import { base } from "./bridge"; const P = Proxy.bind(null); void new P(base, {});',
      'import { base } from "./bridge"; const P = Math.random() ? Proxy.bind(null, { label: "safe" }) : Proxy.bind(null, base); void new P({});',
      'import { base } from "./bridge"; const Reflect = { get() { return base; } }; void new Proxy({}, { get(target, key, receiver) { return Reflect.get(target, key, receiver); } }).test;',
      'import { base } from "./bridge"; const Reflect = { get() { return base; } }; const P = Proxy.bind(null, {}, { get(target, key, receiver) { return Reflect.get(target, key, receiver); } }); void new P().test;',
    ]) {
      await writeFile(path.join(projectDir, "e2e/selected.spec.ts"), source);
      await assert.rejects(validateToolcraftFeaturePlaywrightAuthority(input), /verified protected product-test facade/iu, source);
    }
    await writeFile(path.join(projectDir, "e2e/selected.spec.ts"), 'import { expect } from "./bridge"; void expect; const safe = new globalThis.Proxy({ label: "ok" }, { get(target, key, receiver) { return Reflect.get(target, key, receiver); }, set(target, key, value, receiver) { return Reflect.set(target, key, value, receiver); } }); const BoundProxy = Proxy.bind(null, { label: "bound" }, { get(target, key, receiver) { return Reflect.get(target, key, receiver); } }); const bound = new BoundProxy(); void [safe.label, bound.label, globalThis.crypto, globalThis.setTimeout, globalThis.performance, globalThis.URL, globalThis.fetch, globalThis.AbortController, globalThis.structuredClone, global.crypto]; const LocalReflect = { apply(fn) { return fn(); } }; void LocalReflect.apply(() => "safe");');
    await validateToolcraftFeaturePlaywrightAuthority(input);
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});

test("rejects unresolved external runtime wrappers but trusts Node builtins", async () => {
  const projectDir = await createProvenanceFixture({ "selected.spec.ts": 'import wrapper from "external-test-wrapper"; void wrapper.test;' });
  const input = { files: ["e2e/selected.spec.ts"], productFilePaths: ["e2e/selected.spec.ts"], projectDir };
  try {
    const packageDir = path.join(projectDir, "node_modules/external-test-wrapper");
    await mkdir(packageDir, { recursive: true });
    await writeFile(path.join(packageDir, "package.json"), '{"name":"external-test-wrapper","type":"module","exports":{"node":"./unsafe.js","import":"./safe.js","require":"./safe.js"}}');
    await writeFile(path.join(packageDir, "unsafe.js"), 'export { test } from "@playwright/test";');
    await writeFile(path.join(packageDir, "safe.js"), 'export const label = "safe";');
    await writeFile(path.join(projectDir, "package.json"), '{"dependencies":{"external-test-wrapper":"1.0.0"}}');
    await assert.rejects(validateToolcraftFeaturePlaywrightAuthority(input), /Direct Playwright runtime authority/iu);
    await mkdir(path.join(projectDir, "src"), { recursive: true });
    await writeFile(path.join(projectDir, "src/relay.ts"), 'export { test } from "external-test-wrapper";');
    await writeFile(path.join(projectDir, "e2e/selected.spec.ts"), 'import { test } from "../src/relay"; void test;');
    await assert.rejects(validateToolcraftFeaturePlaywrightAuthority(input), /Direct Playwright runtime authority/iu);
    await writeFile(path.join(packageDir, "package.json"), '{"name":"external-test-wrapper","type":"module","exports":"./safe.js"}');
    await writeFile(path.join(packageDir, "safe.js"), 'export const label = value => String(value);');
    await writeFile(path.join(projectDir, "e2e/selected.spec.ts"), 'import { label } from "external-test-wrapper"; void label("safe");');
    await validateToolcraftFeaturePlaywrightAuthority(input);
    await writeFile(path.join(projectDir, "src/safe-helper.ts"), 'export const label = "safe";');
    await writeFile(path.join(projectDir, "e2e/selected.spec.ts"), 'import { label } from "#/safe-helper"; void label;');
    await validateToolcraftFeaturePlaywrightAuthority(input);
    await writeFile(path.join(projectDir, "e2e/selected.spec.ts"), 'import fs from "node:fs/promises"; void fs.readFile("safe.txt");');
    await validateToolcraftFeaturePlaywrightAuthority(input);
    await writeFile(path.join(projectDir, "e2e/selected.spec.ts"), 'await import(process.env.RUNTIME_MODULE);');
    await assert.rejects(validateToolcraftFeaturePlaywrightAuthority(input), /statically resolvable specifier/iu);
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});

test("rejects retargeted package symlinks even when old store bytes remain", async () => {
  const projectDir = await createProvenanceFixture({ "selected.spec.ts": 'import { label } from "linked-helper"; void label;' });
  try {
    for (const store of ["store-a", "store-b"]) {
      await mkdir(path.join(projectDir, store), { recursive: true });
      await writeFile(path.join(projectDir, store, "package.json"), '{"name":"linked-helper","type":"module","exports":"./index.js"}');
      await writeFile(path.join(projectDir, store, "index.js"), 'export const label = "safe";');
    }
    await mkdir(path.join(projectDir, "node_modules"));
    const link = path.join(projectDir, "node_modules/linked-helper");
    await symlink(path.join(projectDir, "store-a"), link);
    const receipt = await validateToolcraftFeaturePlaywrightAuthority({ files: ["e2e/selected.spec.ts"], productFilePaths: ["e2e/selected.spec.ts"], projectDir });
    await rm(link); await symlink(path.join(projectDir, "store-b"), link);
    await assert.rejects(revalidateToolcraftFeaturePlaywrightAuthoritySeal(receipt.seal), /resolution changed/iu);
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});

test("traces authority through exports, containers, factories, casts, deep and wide values", async () => {
  const wide = Array.from({ length: 72 }, (_, index) => `safe${index}: ${index}`).join(",");
  const unsafeCast = `${"as"} any`;
  const cases = {
    alias: 'import { alias } from "./bridge"; void alias;',
    default: 'import test from "./bridge"; void test;',
    destructure: 'import { container } from "./bridge"; const { test } = container; void test;',
    factory: 'import { factory } from "./bridge"; void factory();',
    namespace: 'import * as ns from "./star"; void ns.alias;',
    star: 'import { alias } from "./star"; void alias;',
    cycle: 'import { cycleBridge } from "./cycle-a"; void cycleBridge;',
    cast: `import { alias } from "./bridge"; void (alias ${unsafeCast} as unknown);`,
    deep: 'import { deep } from "./bridge"; void deep.a.b.c.d.e.test;',
    wide: 'import { wide } from "./bridge"; void wide.test;',
    computed: 'import { container } from "./bridge"; const key = Date.now(); void container[key];',
    spread: 'import { opaque } from "./bridge"; void { ...opaque };',
    classStatic: 'import { AuthorityClass } from "./bridge"; void AuthorityClass.test;',
    classMethod: 'import { AuthorityClass } from "./bridge"; void AuthorityClass.create();',
    dynamicImport: 'const { alias } = await import("./bridge"); void alias;',
    dynamicMember: 'void (await import("./bridge")).alias;',
    cjsObject: 'const bridge = require("./cjs-bridge"); void bridge.test;',
    cjsDestructure: 'const { test } = require("./cjs-bridge"); void test;',
    importEquals: 'import bridge = require("./cjs-bridge"); void bridge.test;',
    missingUnknown: 'import { uncertain } from "./bridge"; void uncertain.missing;',
    identity: 'import { alias, identity } from "./bridge"; void identity(alias);',
    reassignment: 'import { mutable } from "./bridge"; void mutable;',
    memberMutation: 'import { mutated } from "./bridge"; void mutated.test;',
    instanceField: 'import { AuthorityInstance } from "./bridge"; void new AuthorityInstance().test;',
    instanceMethod: 'import { AuthorityInstance } from "./bridge"; void new AuthorityInstance().create();',
    anonymousInstance: 'import { alias } from "./bridge"; void new class { test = alias; }().test;',
    cjsDefault: 'import bridge from "./cjs-bridge.cjs"; void bridge.test;',
    computedWrite: 'import { computed } from "./mutations"; void computed.test;',
    nestedWrite: 'import { nested } from "./mutations"; void nested.inner.test;',
    objectAssign: 'import { assigned } from "./mutations"; void assigned.test;',
    defineProperty: 'import { defined } from "./mutations"; void defined.test;',
    liveExport: 'import { live } from "./mutations"; void live.test;',
    dynamicPoison: 'import { poisoned } from "./dynamic-mutation"; void poisoned.safe;',
    conditionalPoison: 'import { conditional } from "./conditional-mutation"; void conditional.safe;',
    namespaceRest: 'const { expect, ...rest } = await import("./bridge"); void rest.alias;',
    namespaceDefault: 'const { missing = "safe" } = await import("./bridge"); void missing;',
    constructorField: 'import { ConstructorInstance } from "./bridge"; void new ConstructorInstance().test;',
    constructorNested: 'import { ConstructorInstance } from "./bridge"; void new ConstructorInstance().nested.test;',
    constructorAssign: 'import { AssignedConstructor } from "./bridge"; void new AssignedConstructor().test;',
    constructorDefine: 'import { DefinedConstructor } from "./bridge"; void new DefinedConstructor().test;',
    constructorArgument: 'import { ParameterConstructor, alias } from "./bridge"; void new ParameterConstructor(alias).value;',
    parameterProperty: 'import { ParameterProperty, alias } from "./bridge"; void new ParameterProperty(alias).value;',
    inheritedInstance: 'import { DerivedAuthority } from "./bridge"; void new DerivedAuthority().test;',
    objectProjection: 'import { alias, objectProjection } from "./bridge"; void objectProjection(alias).test;',
    arrayProjection: 'import { alias, arrayProjection } from "./bridge"; void arrayProjection(alias)[0];',
    conditionalProjection: 'import { alias, conditionalProjection } from "./bridge"; void conditionalProjection(alias).test;',
    returnedClosure: 'import { alias, closureProjection } from "./bridge"; void closureProjection(alias)();',
    blockAlias: 'import { alias, blockAlias } from "./summary-bridge"; void blockAlias(alias);',
    localClosure: 'import { alias, localClosure } from "./summary-bridge"; void localClosure(alias)();',
    recursiveBlock: 'import { alias, recursiveProjection } from "./summary-bridge"; void recursiveProjection(alias);',
    conditionalAssignment: 'import { alias, conditionalAssignment } from "./summary-bridge"; void conditionalAssignment(alias);',
    destructuredParameter: 'import { container, destructuredProjection } from "./summary-bridge"; void destructuredProjection(container);',
    memberParameter: 'import { container, memberProjection } from "./summary-bridge"; void memberProjection(container);',
    arrayParameter: 'import { alias, arrayMemberProjection } from "./summary-bridge"; void arrayMemberProjection([alias]);',
    callableParameter: 'import { alias, callProjection } from "./summary-bridge"; void callProjection(alias);',
    restParameter: 'import { alias, restProjection } from "./summary-bridge"; void restProjection(alias);',
    restSecondParameter: 'import { alias, restSecondProjection } from "./summary-bridge"; void restSecondProjection("safe", alias);',
    constructorMemberArgument: 'import { ProjectionConstructor, container } from "./summary-bridge"; void new ProjectionConstructor(container).value;',
    ifAuthorityToSafe: 'import { alias, authorityToSafe } from "./summary-bridge"; void authorityToSafe(alias);',
    switchAuthority: 'import { alias, switchProjection } from "./summary-bridge"; void switchProjection(alias);',
    loopAuthority: 'import { alias, loopProjection } from "./summary-bridge"; void loopProjection(alias);',
    catchAuthority: 'import { alias, catchProjection } from "./summary-bridge"; void catchProjection(alias);',
    mutualRecursion: 'import { alias, mutualProjection } from "./summary-bridge"; void mutualProjection(alias);',
    restInternalLeak: 'import { leaked } from "./summary-bridge"; void leaked;',
    loopTwoHop: 'import { alias, loopTwoHop } from "./summary-bridge"; void loopTwoHop(alias);',
    loopLongHop: 'import { alias, loopLongHop } from "./summary-bridge"; void loopLongHop(alias);',
    earlyUnsafe: 'import { alias, earlyUnsafe } from "./summary-bridge"; void earlyUnsafe(alias);',
    calledMutation: 'import { holder, mutateHolder } from "./summary-bridge"; mutateHolder(); void holder.test;',
    localAssign: 'import { alias, localAssign } from "./mutation-summary"; void localAssign(alias).test;',
    localDefine: 'import { alias, localDefine } from "./mutation-summary"; void localDefine(alias).test;',
    localMultiAssign: 'import { alias, localMultiAssign } from "./mutation-summary"; void localMultiAssign(alias).test;',
    localGetter: 'import { alias, localGetter } from "./mutation-summary"; void localGetter(alias).test;',
    capturedAssign: 'import { assignHolder, mutateAssignHolder } from "./mutation-summary"; mutateAssignHolder(); void assignHolder.test;',
    capturedDefine: 'import { defineHolder, mutateDefineHolder } from "./mutation-summary"; mutateDefineHolder(); void defineHolder.test;',
    nestedLocalMutation: 'import { alias, nestedLocalMutation } from "./mutation-summary"; void nestedLocalMutation(alias).test;',
    defineProperties: 'import { alias, defineMany } from "./define-properties"; void defineMany(alias).test;',
    forwardHolder: 'import { holder, mutate } from "./forward-capture"; mutate(); void holder.test;',
    forwardAlias: 'import { aliasHolder, mutateAlias } from "./forward-capture"; mutateAlias(); void aliasHolder.test;',
    forwardArrow: 'import { arrowHolder, mutateArrow } from "./forward-capture"; mutateArrow(); void arrowHolder.test;',
    forwardExpression: 'import { expressionHolder, mutateExpression } from "./forward-capture"; mutateExpression(); void expressionHolder.test;',
    cyclicForwardAlias: 'import { cycleHolder, mutateCycle } from "./forward-capture"; mutateCycle(); void cycleHolder.test;',
    localAliasCapturedWrite: 'import { aliasHolder, mutateThroughAlias } from "./effect-targets"; mutateThroughAlias(); void aliasHolder.test;',
    parameterWrite: 'import { mutateParameter } from "./effect-targets"; const holder = {}; mutateParameter(holder); void holder.test;',
    parameterAssign: 'import { assignParameter } from "./effect-targets"; const holder = {}; assignParameter(holder); void holder.test;',
    directCallOnly: 'import { callAuthority } from "./effect-targets"; callAuthority();',
    unresolvedMutationCall: 'import { mutateMissing } from "./effect-targets"; mutateMissing();',
    returnedClosureWrite: 'import { make } from "./higher-order"; const holder = {}; make(holder)(); void holder.test;',
    invokedCallableEffect: 'import { captured, invoke, mutateCaptured } from "./higher-order"; invoke(mutateCaptured); void captured.test;',
    conditionalClosureWrite: 'import { makeConditional } from "./higher-order"; const holder = {}; makeConditional(holder)(); void holder.test;',
    nestedCallableEffect: 'import { captured, nestedInvoke, mutateCaptured } from "./higher-order"; const run = nestedInvoke(mutateCaptured); run(); void captured.test;',
    invokedCallableArgument: 'import { invokeWith, mutateArgument } from "./higher-order"; const holder = {}; invokeWith(mutateArgument, holder); void holder.test;',
    conditionalDistinctWrites: 'import { makeDistinct } from "./higher-order"; const holder = { a: {} }; makeDistinct(holder)(); void holder.a.test;',
    dottedPathCollision: 'import { makeDottedCollision } from "./higher-order"; const holder = { a: {} }; makeDottedCollision(holder)(); void holder.a.test;',
    authoritySelfCycle: 'import { authorityCycle } from "./cycles"; void authorityCycle.self.test;',
    authorityTaggedTemplate: 'import { tagAuthority } from "./higher-order"; tagAuthority();',
  };
  const projectDir = await createProvenanceFixture({
    "bridge.ts": `import { expect, test as base } from "@playwright/test";\nconst test = base.extend({});\nexport default test; export { expect, test as alias };\nexport const container = { test }; export const factory = () => test;\nexport const identity = (input) => input; export const logger = (input) => { void input; };\nexport const objectProjection = (input) => ({ test: input }); export const arrayProjection = (input) => [input];\nexport const conditionalProjection = (input) => true ? { test: input } : { test: "safe" }; export const closureProjection = (input) => () => input;\nexport let mutable = "safe"; mutable = test; export const mutated = {}; mutated.test = test;\nexport const deep = {a:{b:{c:{d:{e:{test}}}}}};\nexport const wide = {${wide},test};\nexport const opaque = ({ test } ${unsafeCast});\nexport const uncertain = globalThis[Date.now()];\nexport class AuthorityClass { static test = test; static create() { return test; } }\nexport class AuthorityInstance { test = test; create() { return test; } }\nexport class ConstructorInstance { constructor() { this.test = test; this.nested = {}; this.nested.test = test; } }\nexport class AssignedConstructor { constructor() { Object.assign(this, { test }); } }\nexport class DefinedConstructor { constructor() { Object.defineProperty(this, "test", { value: test }); } }\nexport class ParameterConstructor { constructor(input) { this.value = input; } } export class ParameterProperty { constructor(public value) {} }\nexport class DerivedAuthority extends AuthorityInstance {}\nexport class SafeClass { static label = "safe"; static helper() { return "safe"; } helper() { return "safe"; } }\nexport class SafeConstructor { constructor() { this.label = "safe"; } helper() { return "safe"; } }\nexport namespace SafeSpace { export function helper() { return "safe"; } }\n`,
    "cjs-bridge.cjs": 'const { test } = require("@playwright/test");\nmodule.exports = { test, helper: () => "safe" };',
    "summary-bridge.ts": 'import { test as alias } from "@playwright/test"; export { alias }; export const container = { test: alias };\nexport function blockAlias(input) { const out = input; return out; } export function localClosure(input) { const inner = () => input; return inner; }\nexport function recursiveProjection(input) { function inner(value) { if (Date.now()) return value; return inner(value); } return inner(input); }\nexport function mutualProjection(input) { function first(value) { return second(value); } function second(value) { if (Date.now()) return value; return first(value); } return first(input); }\nexport function conditionalAssignment(input) { let out = "safe"; if (Date.now()) out = input; return out; } export function authorityToSafe(input) { let out = input; if (Date.now()) out = "safe"; return out; }\nexport function switchProjection(input) { let out = "safe"; switch (Date.now()) { case 1: out = input; break; } return out; } export function loopProjection(input) { let out = "safe"; for (let i = 0; i < 1; i += 1) out = input; return out; }\nexport function loopTwoHop(input) { let a = "safe", b = "safe", c = input; while (Date.now()) { a = b; b = c; } return a; } export function loopLongHop(input) { let a = "safe", b = "safe", c = "safe", d = input; while (Date.now()) { a = b; b = c; c = d; } return a; }\nexport function catchProjection(input) { let out = "safe"; try { throw input; } catch (error) { out = input; } return out; } export function safeLocal() { let out = 1; out = 2; return out; }\nexport function earlySafe(input) { let out = "safe"; if (Date.now()) { out = input; return "safe"; } return out; } export function earlyUnsafe(input) { let out = input; if (Date.now()) { out = "safe"; return "safe"; } return out; }\nexport const destructuredProjection = ({ test: selected }) => selected; export const memberProjection = (input) => input.test; export const arrayMemberProjection = (input) => input[0]; export const callProjection = (input) => input(); export const restProjection = (...args) => args[0]; export const restSecondProjection = (...args) => args[1]; export const leaked = restSecondProjection("safe", alias);\nexport const holder = { safe: "ok" }; export function mutateHolder() { holder.test = alias; }\nexport class ProjectionConstructor { constructor(input) { this.value = input.test; } }',
    "mutation-summary.ts": 'import { test as alias } from "@playwright/test"; export { alias };\nexport function localAssign(input) { const out = {}; Object.assign(out, { test: input }); return out; }\nexport function localDefine(input) { const out = {}; Object.defineProperty(out, "test", { value: input }); return out; }\nexport function localMultiAssign(input) { const out = {}; Object.assign(out, { label: "safe" }, { test: input }); return out; }\nexport function localGetter(input) { const out = {}; Object.defineProperty(out, "test", { get: () => input }); return out; }\nexport const assignHolder = { safe: "ok" }; export function mutateAssignHolder() { Object.assign(assignHolder, { test: alias }); }\nexport const defineHolder = { safe: "ok" }; export function mutateDefineHolder() { Object.defineProperty(defineHolder, "test", { value: alias }); }\nexport function nestedLocalMutation(input) { const out = {}; function apply() { Reflect.set(out, "test", input); } apply(); return out; }\nexport const safeLabelHolder = { label: "old" }; export function updateSafeLabel() { Object.defineProperty(safeLabelHolder, "label", { value: "new" }); }',
    "define-properties.ts": 'import { test as alias } from "@playwright/test"; export { alias }; export function defineMany(input) { const out = {}; Object.defineProperties(out, { label: { value: "safe" }, test: { value: input } }); return out; }',
    "forward-capture.ts": 'import { test as base } from "@playwright/test"; export function mutate() { holder.test = base; } export const holder = {}; export function mutateAlias() { aliasHolder.test = lateAlias; } export const aliasHolder = {}; const lateAlias = base; export const mutateArrow = () => Object.assign(arrowHolder, { test: base }); export const arrowHolder = {}; export const mutateExpression = function () { Object.defineProperty(expressionHolder, "test", { value: base }); }; export const expressionHolder = {}; export function updateSafe() { safeHolder.label = "new"; } export const safeHolder = { label: "old" }; let first = second; let second = first; export function mutateCycle() { cycleHolder.test = first; } export const cycleHolder = {};',
    "effect-targets.ts": 'import { test as base } from "@playwright/test"; export const aliasHolder = {}; export function mutateThroughAlias() { const local = aliasHolder; local.test = base; } export function mutateParameter(target) { target.test = base; } export function assignParameter(target) { Object.assign(target, { test: base }); } export function callAuthority() { base.setTimeout(1); } export function mutateMissing() { missing.test = base; } export function safeParameter(target) { target.label = "safe"; } export function safeCall() { void "safe"; }',
    "forward-safe.ts": 'export function update() { holder.label = late; } export const holder = { label: "old" }; const late = "safe";',
    "higher-order.ts": 'import { test as base } from "@playwright/test"; export function make(target) { return () => { target.test = base; }; } export function makeConditional(target) { return Date.now() ? () => { target.test = base; } : () => { target.test = base; }; } export const captured = {}; export function mutateCaptured() { captured.test = base; } export function invoke(fn) { fn(); } export function invokeWith(fn, target) { fn(target); } export function mutateArgument(target) { target.test = base; } export function nestedInvoke(fn) { return () => fn(); } export function makeDistinct(target) { return Date.now() ? () => { target.label = "safe"; } : () => { target.a.test = base; }; } export function makeDottedCollision(target) { return Date.now() ? () => { target["a.b"] = "safe"; } : () => { target.a.test = base; }; } export function tagAuthority() { base`unsafe`; } export function safeUnary() { const metadata = { label: "safe" }; void base; delete metadata.label; }',
    "cycles.ts": 'import { test as base } from "@playwright/test"; export const safeCycle = {}; safeCycle.self = safeCycle; export const authorityCycle = {}; authorityCycle.self = authorityCycle; authorityCycle.test = base;',
    "mutations.ts": 'import { test as base } from "@playwright/test"; const test = base.extend({});\nexport const computed = {}; computed["test"] = test;\nexport const nested = { inner: {} }; nested.inner.test = test;\nexport const assigned = {}; Object.assign(assigned, { test });\nexport const defined = {}; Object.defineProperty(defined, "test", { value: test });\nlet live = {}; export { live }; live.test = test;',
    "dynamic-mutation.ts": 'import { test } from "@playwright/test"; export const poisoned = { safe: "ok" }; const key = Date.now(); poisoned[key] = test;',
    "conditional-mutation.ts": 'import { test } from "@playwright/test"; export const conditional = { safe: "ok" }; if (Date.now()) conditional.test = test;',
    "star.ts": 'export * from "./bridge";',
    "cycle-a.ts": 'export { cycleBridge } from "./cycle-b";',
    "cycle-b.ts": 'export { alias as cycleBridge } from "./bridge"; export * from "./cycle-a";',
    "selected.spec.ts": "export {};",
  });
  try {
    for (const [name, source] of Object.entries(cases)) {
      await writeFile(path.join(projectDir, "e2e/selected.spec.ts"), source);
      await assert.rejects(validateToolcraftFeaturePlaywrightAuthority({
        files: ["e2e/selected.spec.ts"], productFilePaths: ["e2e/selected.spec.ts"],
        protectedFilePaths: ["e2e/bridge.ts", "e2e/summary-bridge.ts", "e2e/mutation-summary.ts", "e2e/define-properties.ts", "e2e/forward-capture.ts", "e2e/effect-targets.ts", "e2e/higher-order.ts", "e2e/cycles.ts", "e2e/cjs-bridge.cjs", "e2e/mutations.ts", "e2e/dynamic-mutation.ts", "e2e/conditional-mutation.ts", "e2e/star.ts", "e2e/cycle-a.ts", "e2e/cycle-b.ts"], projectDir,
      }), /verified protected product-test facade/iu, name);
    }
    for (const [name, source] of Object.entries({
      safeClass: 'import { SafeClass } from "./bridge"; void [SafeClass.label, SafeClass.helper()];',
      safeInstance: 'import { SafeClass } from "./bridge"; void new SafeClass().helper();',
      safeNamespace: 'import { SafeSpace } from "./bridge"; void SafeSpace.helper();',
      safeCjs: 'const { helper } = require("./cjs-bridge.cjs"); void helper();',
      safeCjsDefault: 'import bridge from "./cjs-bridge.cjs"; void bridge.helper();',
      safeIntrinsic: 'import { alias } from "./bridge"; void [alias.name, alias.length];',
      safeLogger: 'import { alias, logger } from "./bridge"; logger(alias);',
      safeCoercions: 'import { alias } from "./bridge"; void [Boolean(alias), String(alias), Number(alias)];',
      safeComparison: 'import { alias } from "./bridge"; const candidate = undefined; void (alias === candidate);',
      safeNamespaceDestructure: 'const { expect } = await import("./bridge"); void expect;',
      safeConstructor: 'import { SafeConstructor } from "./bridge"; const value = new SafeConstructor(); void [value.label, value.helper()];',
      safeOperators: 'import { alias } from "./bridge"; void [typeof alias, +alias, -alias, ~alias, alias + 1, alias * 2];',
      safeLocalBlock: 'import { safeLocal } from "./summary-bridge"; void safeLocal();',
      safeRestSecond: 'import { restSecondProjection } from "./summary-bridge"; void restSecondProjection("safe", "also-safe");',
      safeEarlyReturn: 'import { alias, earlySafe } from "./summary-bridge"; void earlySafe(alias);',
      safeNeverCalledMutation: 'import { holder } from "./summary-bridge"; void holder.safe;',
      safeLocalMutations: 'import { localAssign, localDefine, localMultiAssign } from "./mutation-summary"; void [localAssign("safe").test, localDefine("safe").test, localMultiAssign("safe").test];',
      safeCapturedWrite: 'import { safeLabelHolder, updateSafeLabel } from "./mutation-summary"; updateSafeLabel(); void safeLabelHolder.label;',
      safeForwardCapturedWrite: 'import { safeHolder, updateSafe } from "./forward-capture"; updateSafe(); void safeHolder.label;',
      safeParameterWrite: 'import { safeParameter } from "./effect-targets"; const holder = {}; safeParameter(holder); void holder.label;',
      safeCallEffect: 'import { safeCall } from "./effect-targets"; safeCall();',
      safeForwardAlias: 'import { holder, update } from "./forward-safe"; update(); void holder.label;',
      safeUnaryReferences: 'import { safeUnary } from "./higher-order"; safeUnary();',
      safeSelfCycle: 'import { safeCycle } from "./cycles"; void safeCycle.self.self;',
    })) {
      await writeFile(path.join(projectDir, "e2e/selected.spec.ts"), source);
      await validateToolcraftFeaturePlaywrightAuthority({
        files: ["e2e/selected.spec.ts"], productFilePaths: ["e2e/selected.spec.ts"],
        protectedFilePaths: ["e2e/bridge.ts", "e2e/summary-bridge.ts", "e2e/mutation-summary.ts", "e2e/forward-capture.ts", "e2e/effect-targets.ts", "e2e/higher-order.ts", "e2e/cycles.ts", "e2e/forward-safe.ts", "e2e/cjs-bridge.cjs"], projectDir,
      }).catch((error) => assert.fail(`${name}: ${error.message}`));
    }
  } finally {
    await rm(projectDir, { force: true, recursive: true });
  }
});

test("trusts only signed exact regular facade bytes", async () => {
  const projectDir = await createToolcraftIntegrityFixture();
  const facadePath = path.join(projectDir, "e2e/toolcraft-product-test.ts");
  const copyPath = path.join(projectDir, "e2e/copied-product-test.ts");
  try {
    const graphFor = (rawSource) => ({ sourceRecords: new Map([["e2e/toolcraft-product-test.ts", { rawSource }]]) });
    const source = await readFile(facadePath);
    assert.equal(await hasVerifiedProductTestFacade(projectDir, graphFor(source.toString())), true);
    const manifest = JSON.parse(await readFile(path.join(projectDir, "src/toolcraft/.toolcraft-manifest.json"), "utf8"));
    const receipt = { digest: manifest.protectedFiles["e2e/toolcraft-product-test.ts"], facadePath };
    await revalidateToolcraftProductTestFacade(receipt);
    await writeFile(facadePath, Buffer.concat([source, Buffer.from("modified")]));
    assert.equal(await hasVerifiedProductTestFacade(projectDir, graphFor(`${source}modified`)), false);
    await assert.rejects(revalidateToolcraftProductTestFacade(receipt), /changed after authority validation/u);
    await writeFile(facadePath, source);
    await rename(facadePath, copyPath);
    assert.equal(await hasVerifiedProductTestFacade(projectDir, graphFor(source.toString())), false);
    await symlink("./copied-product-test.ts", facadePath);
    assert.equal(await hasVerifiedProductTestFacade(projectDir, graphFor(source.toString())), false);
  } finally {
    await rm(projectDir, { force: true, recursive: true });
  }
});
