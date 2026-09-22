import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { copyRelativeModuleClosure } from "./toolcraft-fixture-module-closure.mjs";

function createFixture(t) {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "toolcraft-module-closure-"),
  );
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));
  const sourceRoot = path.join(rootDir, "source");
  const destinationRoot = path.join(rootDir, "destination");
  mkdirSync(sourceRoot, { recursive: true });
  return { destinationRoot, rootDir, sourceRoot };
}

function writeModule(rootDir, relativePath, source = "export {};\n") {
  const filePath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, source);
  return filePath;
}

test("module parsing ignores import examples in comments and strings", (t) => {
  const { destinationRoot, sourceRoot } = createFixture(t);
  writeModule(
    sourceRoot,
    "entry.mjs",
    `const example = 'import("./string-example.mjs")';
// import "./line-comment.mjs";
/* export * from "./block-comment.mjs"; */
export { example };
`,
  );

  assert.doesNotThrow(() =>
    copyRelativeModuleClosure({
      destinationRoot,
      entryModulePaths: ["entry.mjs"],
      sourceRoot,
    }),
  );
  assert.equal(existsSync(path.join(destinationRoot, "entry.mjs")), true);
});

test("module parsing follows comment-separated static, dynamic, and export imports", (t) => {
  const { destinationRoot, sourceRoot } = createFixture(t);
  writeModule(
    sourceRoot,
    "entry.mjs",
    `import/* static */"./static.mjs";
await import/* dynamic */("./dynamic.mjs", { with: {} });
export/* export */{ value }from/* source */"./exported.mjs";
`,
  );
  writeModule(sourceRoot, "static.mjs");
  writeModule(sourceRoot, "dynamic.mjs");
  writeModule(sourceRoot, "exported.mjs", "export const value = 1;\n");

  copyRelativeModuleClosure({
    destinationRoot,
    entryModulePaths: ["entry.mjs"],
    sourceRoot,
  });

  for (const relativePath of [
    "static.mjs",
    "dynamic.mjs",
    "exported.mjs",
  ]) {
    assert.equal(existsSync(path.join(destinationRoot, relativePath)), true);
  }
});

test("module closure rejects source traversal", (t) => {
  const { destinationRoot, rootDir, sourceRoot } = createFixture(t);
  writeModule(rootDir, "outside.mjs");

  assert.throws(
    () =>
      copyRelativeModuleClosure({
        destinationRoot,
        entryModulePaths: ["../outside.mjs"],
        sourceRoot,
      }),
    /source root|outside|escape/iu,
  );
});

test("module closure rejects source directory symlinks inside its root", (t) => {
  const { destinationRoot, rootDir, sourceRoot } = createFixture(t);
  const outsideDir = path.join(rootDir, "outside");
  writeModule(outsideDir, "dependency.mjs");
  symlinkSync(
    outsideDir,
    path.join(sourceRoot, "linked"),
    process.platform === "win32" ? "junction" : "dir",
  );

  assert.throws(
    () =>
      copyRelativeModuleClosure({
        destinationRoot,
        entryModulePaths: [path.join("linked", "dependency.mjs")],
        sourceRoot,
      }),
    /source.*symbolic link|source root|escape/iu,
  );
});

test("module closure rejects a symlinked destination root", (t) => {
  const { destinationRoot, rootDir, sourceRoot } = createFixture(t);
  const outsideDir = path.join(rootDir, "outside");
  mkdirSync(outsideDir, { recursive: true });
  symlinkSync(
    outsideDir,
    destinationRoot,
    process.platform === "win32" ? "junction" : "dir",
  );
  writeModule(sourceRoot, "entry.mjs");

  assert.throws(
    () =>
      copyRelativeModuleClosure({
        destinationRoot,
        entryModulePaths: ["entry.mjs"],
        sourceRoot,
      }),
    /destination.*symbolic link|destination root|escape/iu,
  );
  assert.equal(existsSync(path.join(outsideDir, "entry.mjs")), false);
});

test("module closure rejects destination symlinks beneath its root", (t) => {
  const { destinationRoot, rootDir, sourceRoot } = createFixture(t);
  const outsideDir = path.join(rootDir, "outside");
  mkdirSync(destinationRoot, { recursive: true });
  mkdirSync(outsideDir, { recursive: true });
  symlinkSync(
    outsideDir,
    path.join(destinationRoot, "nested"),
    process.platform === "win32" ? "junction" : "dir",
  );
  writeModule(sourceRoot, path.join("nested", "entry.mjs"));

  assert.throws(
    () =>
      copyRelativeModuleClosure({
        destinationRoot,
        entryModulePaths: [path.join("nested", "entry.mjs")],
        sourceRoot,
      }),
    /destination.*symbolic link|destination root|escape/iu,
  );
  assert.equal(existsSync(path.join(outsideDir, "entry.mjs")), false);
});

test("module closure safely creates a missing destination root", (t) => {
  const { destinationRoot, sourceRoot } = createFixture(t);
  writeModule(sourceRoot, path.join("nested", "entry.mjs"));

  copyRelativeModuleClosure({
    destinationRoot: path.join(destinationRoot, "missing", "root"),
    entryModulePaths: [path.join("nested", "entry.mjs")],
    sourceRoot,
  });

  assert.equal(
    existsSync(
      path.join(destinationRoot, "missing", "root", "nested", "entry.mjs"),
    ),
    true,
  );
});
