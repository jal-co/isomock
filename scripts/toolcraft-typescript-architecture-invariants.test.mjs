import assert from "node:assert/strict";
import test from "node:test";

import { withDeliveryArchitectureFixture } from "./toolcraft-delivery-architecture-test-helpers.mjs";

test("normalizes exported forwarding callables and static imported members", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/arrow.mts": [
        'import { execute as inner } from "./implementation.mjs";',
        "export const execute = async (...args) =>",
        "  await ((inner(...args) as Promise<unknown>));",
      ].join("\n"),
      "scripts/direct-member.mjs": [
        'import implementation from "./implementation.mjs";',
        "export const execute = function (...args) {",
        "  return implementation.execute(...args);",
        "};",
      ].join("\n"),
      "scripts/function.mts": [
        'import * as implementation from "./implementation.mjs";',
        "export async function execute(...args) {",
        '  return await ((implementation["execute"](...args)) as Promise<unknown>);',
        "}",
      ].join("\n"),
      "scripts/implementation.mjs":
        "export function execute(value) { return value + 1; }\n",
      "scripts/run-delivery-verification.mjs": [
        'import "./arrow.mts";',
        'import "./direct-member.mjs";',
        'import "./function.mts";',
      ].join("\n"),
    },
    (report) => {
      assert.deepEqual(report.facadeViolations, [
        "scripts/arrow.mts",
        "scripts/direct-member.mjs",
        "scripts/function.mts",
      ]);
    },
    {
      behaviorModules: [
        "arrow.mts",
        "direct-member.mjs",
        "function.mts",
      ],
    },
  );
});

test("dynamic imported members and generators remain behavior", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/dynamic.mjs": [
        'import * as implementation from "./implementation.mjs";',
        'const method = "execute";',
        "export const execute = (...args) => implementation[method](...args);",
      ].join("\n"),
      "scripts/generator.mjs": [
        'import * as implementation from "./implementation.mjs";',
        "export function* execute(...args) {",
        "  return yield implementation.execute(...args);",
        "}",
      ].join("\n"),
      "scripts/implementation.mjs":
        "export function execute(value) { return value + 1; }\n",
      "scripts/run-delivery-verification.mjs": [
        'import "./dynamic.mjs";',
        'import "./generator.mjs";',
      ].join("\n"),
    },
    (report) => {
      assert.deepEqual(report.facadeViolations, []);
    },
    {
      behaviorModules: ["dynamic.mjs", "generator.mjs"],
    },
  );
});

test("namespace checkpoint writer calls resolve to the protected operation", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/run-delivery-verification.mjs":
        'import "./toolcraft-checkpoint-bypass.mjs";\n',
      "scripts/toolcraft-checkpoint-bundle.mjs":
        "export async function writeToolcraftCheckpointBundle() {}\n",
      "scripts/toolcraft-checkpoint-bypass.mjs": [
        'import * as checkpoint from "./toolcraft-checkpoint-bundle.mjs";',
        "export async function persist(...args) {",
        '  return checkpoint["writeToolcraftCheckpointBundle"](...args);',
        "}",
      ].join("\n"),
    },
    (report) => {
      assert.deepEqual(report.checkpointOwnershipViolations, [
        {
          importerRepoPath: "scripts/toolcraft-checkpoint-bypass.mjs",
          operation: "writeToolcraftCheckpointBundle",
          ownerRepoPath:
            "scripts/toolcraft-checkpoint-transaction.mjs",
        },
      ]);
    },
  );
});

test("checkpoint paths and write-capable node fs calls require canonical ownership", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/run-delivery-verification.mjs":
        'import "./toolcraft-checkpoint-bypass.mjs";\n',
      "scripts/toolcraft-checkpoint-bypass.mjs": [
        'import * as fs from "node:fs/promises";',
        'import { getToolcraftCheckpointBundlePath } from "./toolcraft-checkpoint-paths.mjs";',
        "export async function persistCheckpoint(rootDir, contents) {",
        '  await fs["writeFile"](',
        "    getToolcraftCheckpointBundlePath(rootDir),",
        "    contents,",
        "  );",
        "}",
      ].join("\n"),
      "scripts/toolcraft-checkpoint-paths.mjs":
        "export function getToolcraftCheckpointBundlePath(rootDir) { return rootDir; }\n",
    },
    (report) => {
      assert.deepEqual(report.checkpointOwnershipViolations, [
        {
          importerRepoPath: "scripts/toolcraft-checkpoint-bypass.mjs",
          operation: "writeFile",
          ownerRepoPath:
            "scripts/toolcraft-checkpoint-durable-fs.mjs",
        },
      ]);
    },
  );
});

test("read-only node fs calls may consume canonical checkpoint paths", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/checkpoint-reader.mjs": [
        'import fs from "node:fs/promises";',
        'import { getToolcraftCheckpointBundlePath } from "./toolcraft-checkpoint-paths.mjs";',
        "export async function readCheckpoint(rootDir) {",
        "  return fs.readFile(getToolcraftCheckpointBundlePath(rootDir));",
        "}",
      ].join("\n"),
      "scripts/run-delivery-verification.mjs":
        'import "./checkpoint-reader.mjs";\n',
      "scripts/toolcraft-checkpoint-paths.mjs":
        "export function getToolcraftCheckpointBundlePath(rootDir) { return rootDir; }\n",
    },
    (report) => {
      assert.deepEqual(report.checkpointOwnershipViolations, []);
    },
  );
});

test("hard-coded checkpoint roots cannot bypass structural write ownership", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/run-delivery-verification.mjs":
        'import "./toolcraft-checkpoint-bypass.mjs";\n',
      "scripts/toolcraft-checkpoint-bypass.mjs": [
        'import { writeFile as persist } from "node:fs/promises";',
        'const checkpointPath = ".toolcraft/verification/checkpoint.json";',
        "export async function persistCheckpoint(contents) {",
        "  await persist(checkpointPath, contents);",
        "}",
      ].join("\n"),
    },
    (report) => {
      assert.deepEqual(report.checkpointOwnershipViolations, [
        {
          importerRepoPath: "scripts/toolcraft-checkpoint-bypass.mjs",
          operation: "writeFile",
          ownerRepoPath:
            "scripts/toolcraft-checkpoint-durable-fs.mjs",
        },
      ]);
    },
  );
});

test("generic node fs writers without checkpoint paths remain allowed", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/generic-persistence.mjs": [
        'import fs from "node:fs/promises";',
        "export async function persist(filePath, contents) {",
        "  await fs.writeFile(filePath, contents);",
        "}",
      ].join("\n"),
      "scripts/run-delivery-verification.mjs":
        'import "./generic-persistence.mjs";\n',
    },
    (report) => {
      assert.deepEqual(report.checkpointOwnershipViolations, []);
    },
  );
});
