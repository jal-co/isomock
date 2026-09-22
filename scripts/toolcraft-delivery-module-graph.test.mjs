import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyToolcraftDeliveryArchitectureRole,
  createToolcraftDeliveryArchitectureReport,
} from "./toolcraft-delivery-architecture-policy.mjs";
import {
  repeatedLines,
  withDeliveryArchitectureFixture,
} from "./toolcraft-delivery-architecture-test-helpers.mjs";

const starterRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("locks the complete reachable delivery architecture", async () => {
  const report = await createToolcraftDeliveryArchitectureReport({
    rootDir: starterRoot,
  });

  assert.deepEqual(report.missingEntryRoots, []);
  assert.deepEqual(report.missingCanonicalModules, []);
  assert.deepEqual(report.productionCycles, []);
  assert.deepEqual(report.directionViolations, []);
  assert.deepEqual(report.checkpointOwnershipViolations, []);
  assert.deepEqual(report.obsoleteModuleViolations, []);
  assert.deepEqual(report.processImportViolations, []);
  assert.deepEqual(report.directConsumerViolations, []);
  assert.deepEqual(report.facadeViolations, []);
  assert.equal(report.productionPaths.length > 0, true);
  assert.equal(report.currentOrchestrationPaths.length > 0, true);
  assert.equal(Object.hasOwn(report, "auditedBaseline"), false);
  assert.equal(Object.hasOwn(report, "orchestrationCountViolations"), false);
  assert.equal(Object.hasOwn(report, "orchestrationModuleCount"), false);
  assert.equal(
    report.productionPaths.includes(
      "scripts/toolcraft-delivery-plan-construction.mjs",
    ),
    true,
  );
  assert.equal(
    report.productionPaths.includes(
      "scripts/toolcraft-delivery-plan-input.mjs",
    ),
    false,
  );
});

test("allows an additional coherent acyclic orchestration module", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/nested/toolcraft-delivery-new-stage.mjs":
        "export const stage = true;\n",
      "scripts/run-delivery-verification.mjs":
        'import "./nested/toolcraft-delivery-new-stage.mjs";\n',
    },
    (report) => {
      assert.deepEqual(report.currentOrchestrationPaths, [
        "scripts/nested/toolcraft-delivery-new-stage.mjs",
        "scripts/run-delivery-verification.mjs",
      ]);
      assert.deepEqual(report.productionCycles, []);
      assert.equal(
        Object.hasOwn(report, "orchestrationCountViolations"),
        false,
      );
    },
  );
});

test("classifies reachable architecture inventory and AST helpers as shared foundations", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/nested/toolcraft-typescript-source-evidence.mjs":
        "export const evidence = true;\n",
      "scripts/run-delivery-verification.mjs":
        'import "./nested/toolcraft-typescript-source-evidence.mjs";\n',
    },
    (report) => {
      assert.deepEqual(report.productionModuleRoles, [
        {
          repoPath:
            "scripts/nested/toolcraft-typescript-source-evidence.mjs",
          role: "shared-foundation",
        },
        {
          repoPath: "scripts/run-delivery-verification.mjs",
          role: "orchestration",
        },
      ]);
    },
  );
  assert.equal(
    classifyToolcraftDeliveryArchitectureRole(
      "scripts/nested/toolcraft-delivery-architecture-inventory.mjs",
    ),
    "shared-foundation",
  );
  assert.equal(
    classifyToolcraftDeliveryArchitectureRole(
      "scripts/toolcraft-typescript-analysis.mjs",
    ),
    "shared-foundation",
  );
  assert.equal(
    classifyToolcraftDeliveryArchitectureRole(
      "scripts/toolcraft-typescript-callables.mjs",
    ),
    "shared-foundation",
  );
  assert.equal(
    classifyToolcraftDeliveryArchitectureRole(
      "scripts/toolcraft-checkpoint-write-capability.mjs",
    ),
    "orchestration",
  );
});

test("does not keep a hand-maintained current orchestration inventory", async () => {
  const source = await fs.readFile(
    path.join(
      starterRoot,
      "scripts/toolcraft-delivery-architecture-inventory.mjs",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /currentDeliveryOrchestrationModules/u);
});

test("delivery architecture builds module shape without product boundary evidence", async () => {
  const source = await fs.readFile(
    path.join(starterRoot, "scripts/toolcraft-delivery-architecture-policy.mjs"),
    "utf8",
  );

  assert.match(source, /sourceRecordMode: "module-shape"/u);
});

test("finds a cycle hidden in nested reachable production modules", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/nested/a.mjs": 'import "./b.mjs";\n',
      "scripts/nested/b.mjs": 'import "./a.mjs";\n',
      "scripts/run-delivery-verification.mjs": 'import "./nested/a.mjs";\n',
    },
    (report) => {
      assert.deepEqual(report.productionCycles[0], [
        "scripts/nested/a.mjs",
        "scripts/nested/b.mjs",
        "scripts/nested/a.mjs",
      ]);
    },
  );
});

test("applies direction rules through transitive reachable modules", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/nested/bridge.mjs":
        'import "../toolcraft-delivery-executor.mjs";\n',
      "scripts/run-delivery-verification.mjs":
        'import "./toolcraft-delivery-plan.mjs";\n',
      "scripts/toolcraft-delivery-executor.mjs":
        "export const execute = true;\n",
      "scripts/toolcraft-delivery-plan.mjs":
        'import "./nested/bridge.mjs";\n',
    },
    (report) => {
      assert.deepEqual(report.directionViolations, [
        {
          forbidden: "scripts/toolcraft-delivery-executor.mjs",
          from: "scripts/toolcraft-delivery-plan.mjs",
        },
      ]);
    },
    {
      directionRules: [
        {
          forbidden: ["toolcraft-delivery-executor.mjs"],
          from: "toolcraft-delivery-plan.mjs",
        },
      ],
    },
  );
});

test("finds obsolete basenames anywhere under scripts", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/archive/toolcraft-delivery-arguments.mjs":
        "export const removed = true;\n",
      "scripts/run-delivery-verification.mjs": "export const run = true;\n",
    },
    (report) => {
      assert.deepEqual(report.obsoleteModuleViolations, [
        "scripts/archive/toolcraft-delivery-arguments.mjs",
      ]);
    },
    { obsoleteBasenames: ["toolcraft-delivery-arguments.mjs"] },
  );
});

test("production reachability overrides support-looking filenames", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/nested/runner.test.mjs": "export const execute = true;\n",
      "scripts/run-delivery-verification.mjs":
        'import "./nested/runner.test.mjs";\n',
    },
    (report) => {
      assert.equal(
        report.productionPaths.includes("scripts/nested/runner.test.mjs"),
        true,
      );
    },
  );
});

test("process imports use AST module specifiers", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/nested/process.mjs":
        'const spawn = await import("cross-spawn/lib/parse.js");\nvoid spawn;\n',
      "scripts/run-delivery-verification.mjs":
        'import "./nested/process.mjs";\n',
    },
    (report) => {
      assert.deepEqual(report.processImportViolations, [
        "scripts/nested/process.mjs",
      ]);
    },
  );
});

test("import-to-export forwarding wrappers cannot masquerade as behavior", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/forwarding.mjs": [
        'import * as implementation from "./implementation.mjs";',
        "export function execute(...args) {",
        "  return implementation.execute(...args);",
        "}",
      ].join("\n"),
      "scripts/implementation.mjs":
        "export function execute(value) { return value + 1; }\n",
      "scripts/run-delivery-verification.mjs":
        'import { execute } from "./forwarding.mjs";\nvoid execute;\n',
    },
    (report) => {
      assert.deepEqual(report.facadeViolations, [
        "scripts/forwarding.mjs",
      ]);
    },
    { behaviorModules: ["scripts/forwarding.mjs"] },
  );
});

test("imported behavior with local computation is not a forwarding facade", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/behavior.mjs": [
        'import * as implementation from "./implementation.mjs";',
        "export function execute(value) {",
        "  return implementation.execute(value + 1);",
        "}",
      ].join("\n"),
      "scripts/implementation.mjs":
        "export function execute(value) { return value * 2; }\n",
      "scripts/run-delivery-verification.mjs":
        'import { execute } from "./behavior.mjs";\nvoid execute;\n',
    },
    (report) => {
      assert.deepEqual(report.facadeViolations, []);
    },
    { behaviorModules: ["scripts/behavior.mjs"] },
  );
});

test("a count-preserving replacement writer cannot own delivery checkpoints", async () => {
  const policy = {
    canonicalModules: [],
    directionRules: [
      {
        from: "toolcraft-delivery-lifecycle.mjs",
        required: ["toolcraft-checkpoint-transaction.mjs"],
      },
    ],
  };
  await withDeliveryArchitectureFixture(
    {
      "scripts/run-delivery-verification.mjs":
        'import "./toolcraft-delivery-lifecycle.mjs";\n',
      "scripts/toolcraft-checkpoint-bundle.mjs":
        "export async function writeToolcraftCheckpointBundle() {}\n",
      "scripts/toolcraft-checkpoint-transaction.mjs":
        'import { writeToolcraftCheckpointBundle } from "./toolcraft-checkpoint-bundle.mjs";\nexport async function commit() { return writeToolcraftCheckpointBundle(); }\n',
      "scripts/toolcraft-delivery-lifecycle.mjs":
        'import "./toolcraft-checkpoint-transaction.mjs";\n',
    },
    (report) => {
      assert.deepEqual(report.directionViolations, []);
      assert.deepEqual(report.checkpointOwnershipViolations, []);
    },
    policy,
  );
  await withDeliveryArchitectureFixture(
    {
      "scripts/run-delivery-verification.mjs":
        'import "./toolcraft-delivery-lifecycle.mjs";\n',
      "scripts/toolcraft-checkpoint-bundle.mjs":
        "export async function readToolcraftCheckpointBundle() {}\n",
      "scripts/toolcraft-checkpoint-replacement.mjs":
        'import { readToolcraftCheckpointBundle } from "./toolcraft-checkpoint-bundle.mjs";\nexport const writeToolcraftCheckpointBundle = async () => readToolcraftCheckpointBundle();\n',
      "scripts/toolcraft-checkpoint-transaction.mjs":
        "export async function commit() {}\n",
      "scripts/toolcraft-delivery-lifecycle.mjs":
        'import "./toolcraft-checkpoint-replacement.mjs";\n',
    },
    (report) => {
      assert.deepEqual(report.directionViolations, [
        {
          from: "scripts/toolcraft-delivery-lifecycle.mjs",
          required: "scripts/toolcraft-checkpoint-transaction.mjs",
        },
      ]);
      assert.deepEqual(report.checkpointOwnershipViolations, [
        {
          importerRepoPath:
            "scripts/toolcraft-checkpoint-replacement.mjs",
          operation: "writeToolcraftCheckpointBundle",
          ownerRepoPath:
            "scripts/toolcraft-checkpoint-bundle.mjs",
        },
      ]);
    },
    policy,
  );
});

test("private checkpoint-like bindings do not claim writer ownership", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/run-delivery-verification.mjs":
        'import "./toolcraft-checkpoint-helper.mjs";\n',
      "scripts/toolcraft-checkpoint-helper.mjs": [
        "const writeToolcraftCheckpointBundle = async () => true;",
        "export const helper = writeToolcraftCheckpointBundle;",
      ].join("\n"),
    },
    (report) => {
      assert.deepEqual(report.checkpointOwnershipViolations, []);
    },
  );
});

test("dead importers cannot satisfy direct production consumption", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/dead.mjs": 'import "./behavior.mjs";\n',
      "scripts/behavior.mjs":
        "export function execute(value) { return value + 1; }\n",
      "scripts/run-delivery-verification.mjs": "export const run = true;\n",
    },
    (report) => {
      assert.deepEqual(report.directConsumerViolations, [
        "scripts/behavior.mjs",
      ]);
    },
    {
      behaviorModules: ["scripts/behavior.mjs"],
    },
  );
});

test("identity wrappers cannot masquerade as behavior modules", async () => {
  await withDeliveryArchitectureFixture(
    {
      "scripts/identity.mjs":
        "export function execute(value) { return value; }\n",
      "scripts/run-delivery-verification.mjs":
        'import { execute } from "./identity.mjs";\nvoid execute;\n',
    },
    (report) => {
      assert.deepEqual(report.facadeViolations, ["scripts/identity.mjs"]);
    },
    {
      behaviorModules: ["scripts/identity.mjs"],
    },
  );
});

test("fixture budget source can exceed the nested performance limit", () => {
  assert.equal(
    repeatedLines("export const sample = true;\n", 301).split("\n").length - 1,
    301,
  );
});
