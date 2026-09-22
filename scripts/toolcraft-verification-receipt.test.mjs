import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  readToolcraftCheckpointBundle,
  writeToolcraftCheckpointBundle,
} from "./toolcraft-checkpoint-bundle.mjs";
import {
  EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  TOOLCRAFT_FULL_PERFORMANCE_VERIFICATION_COMMAND,
} from "./toolcraft-performance-authority-policy.mjs";
import { createToolcraftDeliveryReceipt } from "./toolcraft-delivery-receipt.mjs";
import {
  createFunctionalProofModelFixture,
  writeDeliveryReceiptFixture,
} from "./toolcraft-delivery-receipt-test-helpers.mjs";
import {
  createToolcraftFunctionalProofModelHash,
} from "./toolcraft-functional-proof-model.mjs";
import {
  collectToolcraftVerificationInputs,
} from "./toolcraft-verification-receipt.mjs";
import * as receiptModule from "./toolcraft-verification-receipt.mjs";
import {
  createReceiptFixture,
} from "./toolcraft-verification-receipt-test-helpers.mjs";
import {
  createToolcraftVerificationSourceHash,
  getToolcraftChangedVerificationFiles,
} from "./toolcraft-verification-inventory.mjs";

async function createRootWideInventoryFixture() {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-root-wide-inventory-"),
  );
  const files = {
    ".agents/skills/brainstorming/SKILL.md": "# Brainstorming workflow\n",
    ".env.production": "PUBLIC_MODE=production\n",
    ".git/config": "[core]\n",
    ".toolcraft/verification/checkpoint.json": '{"status":"passed"}\n',
    "AGENTS.md": "# Generated app instructions\n",
    "coverage/index.html": "<h1>Coverage</h1>\n",
    "dist/index.js": "export const bundled = true;\n",
    "docs/toolcraft/agent-worklog.md": "# Agent worklog\n",
    "node_modules/pkg/index.js": "export const dependency = true;\n",
    "package.json": '{"name":"inventory-fixture"}\n',
    "playwright-report/index.html": "<h1>Playwright report</h1>\n",
    "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    "public/source.png": "source-image",
    "skills-lock.json": '{"skills":[]}\n',
    "src/app/app-schema.ts": "export const schema = {};\n",
    "test-results/results.json": "{}\n",
  };

  for (const [relativePath, source] of Object.entries(files)) {
    const filePath = path.join(rootDir, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, source);
  }

  return rootDir;
}

function createInitialReceipt(inventory) {
  const functionalProofModel = createFunctionalProofModelFixture({
    acceptanceId: "persistence.reload",
    contractHash: "c".repeat(64),
  });
  const plan = {
    basis: { kind: "initial" },
    functionalProofModelHash:
      createToolcraftFunctionalProofModelHash(functionalProofModel),
    kind: "functional",
    lifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
    manifestHash: "a".repeat(64),
    sourceHash: inventory.sourceHash,
    steps: [
      { kind: "docs" },
      { kind: "code-health" },
      {
        acceptanceIds: null,
        files: ["src/app/app-schema.test.ts"],
        kind: "product-tests",
      },
      { kind: "build" },
      {
        kind: "browser-functional",
        testNames: ["browser: focused acceptance"],
      },
    ],
  };
  const evidence = [
    { kind: "docs" },
    { kind: "code-health" },
    { files: ["src/app/app-schema.test.ts"], kind: "product-tests" },
    { kind: "build" },
    {
      kind: "browser-functional",
      testNames: ["browser: focused acceptance"],
    },
  ];
  const freeze = (value) => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  return createToolcraftDeliveryReceipt({
    functionalProofModel,
    plan: freeze(plan),
    result: { evidence, finalInventory: inventory },
  });
}

test("collects one canonical root-wide verification inventory", async (t) => {
  const rootDir = await createRootWideInventoryFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));

  const inventory = await collectToolcraftVerificationInputs(rootDir);

  assert.deepEqual(Object.keys(inventory).sort(), ["entries", "sourceHash"]);
  assert.deepEqual(
    inventory.entries.map((entry) => entry.path),
    [
      ".env.production",
      "AGENTS.md",
      "docs/toolcraft/agent-worklog.md",
      "package.json",
      "pnpm-lock.yaml",
      "public/source.png",
      "src/app/app-schema.ts",
    ],
  );
  assert.equal(
    inventory.sourceHash,
    createToolcraftVerificationSourceHash(inventory.entries),
  );
  assert.equal(Object.isFrozen(inventory), true);
  assert.equal(Object.isFrozen(inventory.entries), true);
  assert.equal(
    inventory.entries.every((entry) => Object.isFrozen(entry)),
    true,
  );

  await fs.writeFile(
    path.join(rootDir, "unknown.config.json"),
    '{"mode":"custom"}\n',
  );
  const withUnknownRootConfig =
    await collectToolcraftVerificationInputs(rootDir);
  assert.notEqual(withUnknownRootConfig.sourceHash, inventory.sourceHash);
});

test("ignores workflow skills, generated output, and checkpoint directories throughout the inventory", async (t) => {
  const rootDir = await createRootWideInventoryFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const baseline = await collectToolcraftVerificationInputs(rootDir);

  for (const ignoredDirectory of [
    ".agents",
    ".git",
    ".toolcraft",
    "coverage",
    "dist",
    "node_modules",
    "playwright-report",
    "test-results",
  ]) {
    const ignoredFile = path.join(
      rootDir,
      ignoredDirectory,
      "nested",
      "changed.txt",
    );
    await fs.mkdir(path.dirname(ignoredFile), { recursive: true });
    await fs.writeFile(ignoredFile, `changed ${ignoredDirectory}\n`);
  }
  await fs.writeFile(
    path.join(rootDir, "skills-lock.json"),
    '{"skills":["updated"]}\n',
  );

  assert.equal(
    (await collectToolcraftVerificationInputs(rootDir)).sourceHash,
    baseline.sourceHash,
  );
});

test("ignores browser-tool artifact create change and delete", async (t) => {
  const rootDir = await createRootWideInventoryFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const baseline = await collectToolcraftVerificationInputs(rootDir);
  const browserArtifact = path.join(
    rootDir,
    ".playwright-mcp",
    "nested",
    "page.yml",
  );

  for (const content of ["page: initial\n", "page: updated\n"]) {
    await fs.mkdir(path.dirname(browserArtifact), { recursive: true });
    await fs.writeFile(browserArtifact, content);
    const current = await collectToolcraftVerificationInputs(rootDir);

    assert.equal(current.sourceHash, baseline.sourceHash);
    assert.deepEqual(
      getToolcraftChangedVerificationFiles(baseline.entries, current.entries),
      [],
    );
  }

  await fs.rm(path.join(rootDir, ".playwright-mcp"), {
    force: true,
    recursive: true,
  });
  const current = await collectToolcraftVerificationInputs(rootDir);

  assert.equal(current.sourceHash, baseline.sourceHash);
  assert.deepEqual(
    getToolcraftChangedVerificationFiles(baseline.entries, current.entries),
    [],
  );
});

test("continues to hash real product raster assets", async (t) => {
  const rootDir = await createRootWideInventoryFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const baseline = await collectToolcraftVerificationInputs(rootDir);

  await fs.writeFile(path.join(rootDir, "public", "source.png"), "updated-source-image");
  const current = await collectToolcraftVerificationInputs(rootDir);

  assert.notEqual(current.sourceHash, baseline.sourceHash);
  assert.deepEqual(
    getToolcraftChangedVerificationFiles(baseline.entries, current.entries),
    ["public/source.png"],
  );
});

test("does not report legacy workflow-skill receipt entries as product changes", async (t) => {
  const rootDir = await createRootWideInventoryFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const current = await collectToolcraftVerificationInputs(rootDir);
  const legacyEntries = [
    {
      path: ".agents/skills/brainstorming/SKILL.md",
      sha256: "a".repeat(64),
    },
    {
      path: "skills-lock.json",
      sha256: "b".repeat(64),
    },
    ...current.entries,
  ];

  assert.deepEqual(
    getToolcraftChangedVerificationFiles(legacyEntries, current.entries),
    [],
  );
});

test("rejects symbolic links in verification inputs", async (t) => {
  const rootDir = await createRootWideInventoryFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  await fs.symlink(
    path.join(rootDir, "AGENTS.md"),
    path.join(rootDir, "linked-agents.md"),
  );

  await assert.rejects(
    collectToolcraftVerificationInputs(rootDir),
    /must not contain symbolic links: linked-agents\.md/u,
  );
});

test("rejects non-canonical paths while collecting verification inputs", async (t) => {
  if (path.sep !== "/") {
    t.skip("Literal backslashes are path separators off POSIX.");
    return;
  }
  const rootDir = await createRootWideInventoryFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  await fs.writeFile(path.join(rootDir, "bad\\name.txt"), "invalid path\n");

  await assert.rejects(
    collectToolcraftVerificationInputs(rootDir),
    /non-canonical path: bad\\name\.txt/u,
  );
});

test("does not expose a reusable passed-checkpoint writer", () => {
  assert.equal("writeToolcraftPerformanceReceipt" in receiptModule, false);
});

test("full performance recovery points only to the operator command", async (t) => {
  const rootDir = await createReceiptFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));

  assert.deepEqual(await receiptModule.readToolcraftDurablePerformanceBaseline(rootDir), {
    error: `Toolcraft performance baseline receipt is missing. An operator must run ${TOOLCRAFT_FULL_PERFORMANCE_VERIFICATION_COMMAND} to create one.`,
    missing: true,
  });
  assert.deepEqual(await receiptModule.validateToolcraftPerformanceReceipt({ rootDir }), [
    `Toolcraft performance receipt is missing. An operator must run ${TOOLCRAFT_FULL_PERFORMANCE_VERIFICATION_COMMAND} to create a full checkpoint.`,
  ]);
});

test("verify receipt accepts current baseline-free delivery authority", async (t) => {
  const rootDir = await createReceiptFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const inventory = await collectToolcraftVerificationInputs(rootDir);
  await writeDeliveryReceiptFixture(rootDir, createInitialReceipt(inventory));

  assert.equal(typeof receiptModule.validateToolcraftVerificationReceipt, "function");
  assert.deepEqual(
    await receiptModule.validateToolcraftVerificationReceipt({ rootDir }),
    [],
  );
});

test("verify receipt never reads full-performance checkpoint authority", async (t) => {
  const rootDir = await createReceiptFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const inventory = await collectToolcraftVerificationInputs(rootDir);
  await writeDeliveryReceiptFixture(rootDir, createInitialReceipt(inventory));
  const loaded = await readToolcraftCheckpointBundle(rootDir);
  await writeToolcraftCheckpointBundle({
    bundle: {
      ...loaded.bundle,
      currentPerformance: { malformed: true },
      performanceBaseline: { malformed: true },
    },
    rootDir,
  });
  assert.deepEqual(
    await receiptModule.validateToolcraftVerificationReceipt({ rootDir }),
    [],
  );
});

test("verify receipt rejects legacy delivery as current authority", async (t) => {
  const rootDir = await createReceiptFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const inventory = await collectToolcraftVerificationInputs(rootDir);
  await writeDeliveryReceiptFixture(rootDir, {
    checks: ["integrity", "ai-check", "test", "build", "playwright-functional"],
    completedAt: "2026-07-20T00:00:00.000Z",
    files: inventory.entries,
    kind: "delivery-verification",
    mode: "legacy-delivery",
    runner: "protected-delivery",
    sourceHash: inventory.sourceHash,
    status: "passed",
    version: 2,
  });

  assert.match(
    (await receiptModule.validateToolcraftVerificationReceipt({ rootDir }))[0],
    /malformed|unsupported/iu,
  );
});
