import assert from "node:assert/strict";
import test from "node:test";

import { withDeliveryArchitectureFixture } from "./toolcraft-delivery-architecture-test-helpers.mjs";

test("shadowed import names cannot create forwarding facades", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/implementation.mjs":
        "export function execute(value) { return value; }\n",
      "scripts/run-delivery-verification.mjs":
        'import "./shadowed.mjs";\n',
      "scripts/shadowed.mjs": [
        'import { execute } from "./implementation.mjs";',
        "export function run(execute) {",
        "  return execute(execute);",
        "}",
      ].join("\n"),
    },
    (report) => {
      assert.deepEqual(report.facadeViolations, []);
    },
    {
      behaviorModules: ["shadowed.mjs"],
    },
  );
});

test("aliased import bindings remain forwarding facades", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/aliased.mjs": [
        'import { execute as importedExecute } from "./implementation.mjs";',
        "export function run(value) {",
        "  return importedExecute(value);",
        "}",
      ].join("\n"),
      "scripts/implementation.mjs":
        "export function execute(value) { return value; }\n",
      "scripts/run-delivery-verification.mjs":
        'import "./aliased.mjs";\n',
    },
    (report) => {
      assert.deepEqual(report.facadeViolations, [
        "scripts/aliased.mjs",
      ]);
    },
    {
      behaviorModules: ["aliased.mjs"],
    },
  );
});

test("parameter and local shadows cannot create node fs call targets", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/local-shadow.mjs": [
        'import fs from "node:fs/promises";',
        'import { getToolcraftCheckpointBundlePath } from "./toolcraft-checkpoint-paths.mjs";',
        "export async function persist(rootDir) {",
        "  const fs = { writeFile: async () => true };",
        "  return fs.writeFile(getToolcraftCheckpointBundlePath(rootDir));",
        "}",
      ].join("\n"),
      "scripts/parameter-shadow.mjs": [
        'import fs from "node:fs/promises";',
        'import { getToolcraftCheckpointBundlePath } from "./toolcraft-checkpoint-paths.mjs";',
        "export async function persist(fs, rootDir) {",
        '  return fs.writeFile(getToolcraftCheckpointBundlePath(rootDir), "value");',
        "}",
      ].join("\n"),
      "scripts/run-delivery-verification.mjs": [
        'import "./local-shadow.mjs";',
        'import "./parameter-shadow.mjs";',
      ].join("\n"),
      "scripts/toolcraft-checkpoint-paths.mjs":
        "export function getToolcraftCheckpointBundlePath(rootDir) { return rootDir; }\n",
    },
    (report) => {
      assert.deepEqual(report.checkpointOwnershipViolations, []);
    },
  );
});

test("checkpoint path callers inherit exact imported writer capability", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/generic-writer.mjs": [
        'import fs from "node:fs/promises";',
        "export async function persistTarget(filePath, contents) {",
        "  return fs.writeFile(filePath, contents);",
        "}",
      ].join("\n"),
      "scripts/run-delivery-verification.mjs":
        'import "./toolcraft-checkpoint-caller.mjs";\n',
      "scripts/toolcraft-checkpoint-caller.mjs": [
        'import { persistTarget as persist } from "./generic-writer.mjs";',
        'import { getToolcraftCheckpointBundlePath } from "./toolcraft-checkpoint-paths.mjs";',
        "export async function persistCheckpoint(rootDir, contents) {",
        "  return persist(getToolcraftCheckpointBundlePath(rootDir), contents);",
        "}",
      ].join("\n"),
      "scripts/toolcraft-checkpoint-paths.mjs":
        "export function getToolcraftCheckpointBundlePath(rootDir) { return rootDir; }\n",
    },
    (report) => {
      assert.deepEqual(report.checkpointOwnershipViolations, [
        {
          importerRepoPath:
            "scripts/toolcraft-checkpoint-caller.mjs",
          operation: "writeFile",
          ownerRepoPath:
            "scripts/toolcraft-checkpoint-durable-fs.mjs",
        },
      ]);
    },
  );
});

test("checkpoint writer capability propagates through imported wrappers", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/generic-writer.mjs": [
        'import { writeFile } from "node:fs/promises";',
        "export async function persistTarget(filePath, contents) {",
        "  return writeFile(filePath, contents);",
        "}",
      ].join("\n"),
      "scripts/generic-writer-wrapper.mjs": [
        'import { persistTarget as inner } from "./generic-writer.mjs";',
        "export async function persistWrapped(...args) {",
        "  return inner(...args);",
        "}",
      ].join("\n"),
      "scripts/run-delivery-verification.mjs":
        'import "./toolcraft-checkpoint-caller.mjs";\n',
      "scripts/toolcraft-checkpoint-caller.mjs": [
        'import { persistWrapped as persist } from "./generic-writer-wrapper.mjs";',
        'import { getToolcraftCheckpointBundlePath } from "./toolcraft-checkpoint-paths.mjs";',
        "export async function persistCheckpoint(rootDir, contents) {",
        "  return persist(getToolcraftCheckpointBundlePath(rootDir), contents);",
        "}",
      ].join("\n"),
      "scripts/toolcraft-checkpoint-paths.mjs":
        "export function getToolcraftCheckpointBundlePath(rootDir) { return rootDir; }\n",
    },
    (report) => {
      assert.deepEqual(report.checkpointOwnershipViolations, [
        {
          importerRepoPath:
            "scripts/toolcraft-checkpoint-caller.mjs",
          operation: "writeFile",
          ownerRepoPath:
            "scripts/toolcraft-checkpoint-durable-fs.mjs",
        },
      ]);
    },
  );
});

for (const [label, helperDeclaration] of [
  [
    "function declarations",
    "function writeTarget(filePath, contents) { return fs.writeFile(filePath, contents); }",
  ],
  [
    "const arrow helpers",
    "const writeTarget = (filePath, contents) => fs.writeFile(filePath, contents);",
  ],
  [
    "const function helpers",
    "const writeTarget = function (filePath, contents) { return fs.writeFile(filePath, contents); };",
  ],
]) {
  test(`checkpoint writer capability propagates through private ${label}`, async () => {
    await withDeliveryArchitectureFixture(
      {
        "scripts/generic-writer.mjs": [
          'import fs from "node:fs/promises";',
          helperDeclaration,
          "export function persistTarget(filePath, contents) {",
          "  return writeTarget(filePath, contents);",
          "}",
        ].join("\n"),
        "scripts/run-delivery-verification.mjs":
          'import "./toolcraft-checkpoint-caller.mjs";\n',
        "scripts/toolcraft-checkpoint-caller.mjs": [
          'import { persistTarget as persist } from "./generic-writer.mjs";',
          'import { getToolcraftCheckpointBundlePath } from "./toolcraft-checkpoint-paths.mjs";',
          "export async function persistCheckpoint(rootDir, contents) {",
          "  return persist(getToolcraftCheckpointBundlePath(rootDir), contents);",
          "}",
        ].join("\n"),
        "scripts/toolcraft-checkpoint-paths.mjs":
          "export function getToolcraftCheckpointBundlePath(rootDir) { return rootDir; }\n",
      },
      (report) => {
        assert.deepEqual(report.checkpointOwnershipViolations, [
          {
            importerRepoPath:
              "scripts/toolcraft-checkpoint-caller.mjs",
            operation: "writeFile",
            ownerRepoPath:
              "scripts/toolcraft-checkpoint-durable-fs.mjs",
          },
        ]);
      },
    );
  });
}

test("unused private writers do not taint unrelated exported readers", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/generic-io.mjs": [
        'import fs from "node:fs/promises";',
        "function writeTarget(filePath, contents) {",
        "  return fs.writeFile(filePath, contents);",
        "}",
        "export async function readTarget(filePath) {",
        "  function writeTarget() { return fs.readFile(filePath); }",
        "  return writeTarget();",
        "}",
      ].join("\n"),
      "scripts/run-delivery-verification.mjs":
        'import "./toolcraft-checkpoint-reader.mjs";\n',
      "scripts/toolcraft-checkpoint-paths.mjs":
        "export function getToolcraftCheckpointBundlePath(rootDir) { return rootDir; }\n",
      "scripts/toolcraft-checkpoint-reader.mjs": [
        'import { readTarget as read } from "./generic-io.mjs";',
        'import { getToolcraftCheckpointBundlePath } from "./toolcraft-checkpoint-paths.mjs";',
        "export async function readCheckpoint(rootDir) {",
        "  return read(getToolcraftCheckpointBundlePath(rootDir));",
        "}",
      ].join("\n"),
    },
    (report) => {
      assert.deepEqual(report.checkpointOwnershipViolations, []);
    },
  );
});

test("local recursive call cycles without writes terminate cleanly", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/generic-reader.mjs": [
        "function readA(filePath) { return readB(filePath); }",
        "function readB(filePath) { return readA(filePath); }",
        "export function readTarget(filePath) { return readA(filePath); }",
      ].join("\n"),
      "scripts/run-delivery-verification.mjs":
        'import "./toolcraft-checkpoint-reader.mjs";\n',
      "scripts/toolcraft-checkpoint-paths.mjs":
        "export function getToolcraftCheckpointBundlePath(rootDir) { return rootDir; }\n",
      "scripts/toolcraft-checkpoint-reader.mjs": [
        'import { readTarget as read } from "./generic-reader.mjs";',
        'import { getToolcraftCheckpointBundlePath } from "./toolcraft-checkpoint-paths.mjs";',
        "export function readCheckpoint(rootDir) {",
        "  return read(getToolcraftCheckpointBundlePath(rootDir));",
        "}",
      ].join("\n"),
    },
    (report) => {
      assert.deepEqual(report.checkpointOwnershipViolations, []);
    },
  );
});

test("checkpoint writer capability propagation terminates across wrapper cycles", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/generic-writer-a.mjs": [
        'import { persistB } from "./generic-writer-b.mjs";',
        "export async function persistA(...args) {",
        "  return persistB(...args);",
        "}",
      ].join("\n"),
      "scripts/generic-writer-b.mjs": [
        'import fs from "node:fs/promises";',
        'import { persistA } from "./generic-writer-a.mjs";',
        "export async function persistB(filePath, contents) {",
        "  if (contents) return fs.writeFile(filePath, contents);",
        "  return persistA(filePath, contents);",
        "}",
      ].join("\n"),
      "scripts/run-delivery-verification.mjs":
        'import "./toolcraft-checkpoint-caller.mjs";\n',
      "scripts/toolcraft-checkpoint-caller.mjs": [
        'import { persistA as persist } from "./generic-writer-a.mjs";',
        'import { getToolcraftCheckpointBundlePath } from "./toolcraft-checkpoint-paths.mjs";',
        "export async function persistCheckpoint(rootDir, contents) {",
        "  return persist(getToolcraftCheckpointBundlePath(rootDir), contents);",
        "}",
      ].join("\n"),
      "scripts/toolcraft-checkpoint-paths.mjs":
        "export function getToolcraftCheckpointBundlePath(rootDir) { return rootDir; }\n",
    },
    (report) => {
      assert.deepEqual(report.checkpointOwnershipViolations, [
        {
          importerRepoPath:
            "scripts/toolcraft-checkpoint-caller.mjs",
          operation: "writeFile",
          ownerRepoPath:
            "scripts/toolcraft-checkpoint-durable-fs.mjs",
        },
      ]);
    },
  );
});

test("checkpoint readers do not inherit a sibling writer export", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/generic-io.mjs": [
        'import fs from "node:fs/promises";',
        "export async function readTarget(filePath) {",
        "  return fs.readFile(filePath);",
        "}",
        "export async function writeTarget(filePath, contents) {",
        "  return fs.writeFile(filePath, contents);",
        "}",
      ].join("\n"),
      "scripts/run-delivery-verification.mjs":
        'import "./toolcraft-checkpoint-reader.mjs";\n',
      "scripts/toolcraft-checkpoint-paths.mjs":
        "export function getToolcraftCheckpointBundlePath(rootDir) { return rootDir; }\n",
      "scripts/toolcraft-checkpoint-reader.mjs": [
        'import { readTarget as read } from "./generic-io.mjs";',
        'import { getToolcraftCheckpointBundlePath } from "./toolcraft-checkpoint-paths.mjs";',
        "export async function readCheckpoint(rootDir) {",
        "  return read(getToolcraftCheckpointBundlePath(rootDir));",
        "}",
      ].join("\n"),
    },
    (report) => {
      assert.deepEqual(report.checkpointOwnershipViolations, []);
    },
  );
});

test("dynamic imports cannot access protected checkpoint writer modules", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/run-delivery-verification.mjs":
        'import "./toolcraft-checkpoint-bypass.mjs";\n',
      "scripts/toolcraft-checkpoint-bundle.mjs":
        "export async function writeToolcraftCheckpointBundle() {}\n",
      "scripts/toolcraft-checkpoint-bypass.mjs": [
        "export async function bypass(...args) {",
        '  const bundle = await import("./toolcraft-checkpoint-bundle.mjs");',
        "  return bundle.writeToolcraftCheckpointBundle(...args);",
        "}",
      ].join("\n"),
    },
    (report) => {
      assert.deepEqual(report.checkpointOwnershipViolations, [
        {
          importerRepoPath:
            "scripts/toolcraft-checkpoint-bypass.mjs",
          operation:
            "dynamic-import:toolcraft-checkpoint-bundle.mjs",
          ownerRepoPath:
            "scripts/toolcraft-checkpoint-bundle.mjs",
        },
      ]);
    },
  );
});

test("dynamic imports of unrelated modules remain allowed", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/generic-reader.mjs":
        "export async function read() { return true; }\n",
      "scripts/run-delivery-verification.mjs":
        'import "./unrelated.mjs";\n',
      "scripts/unrelated.mjs": [
        "export async function load() {",
        '  const reader = await import("./generic-reader.mjs");',
        "  return reader.read();",
        "}",
      ].join("\n"),
    },
    (report) => {
      assert.deepEqual(report.checkpointOwnershipViolations, []);
    },
  );
});
