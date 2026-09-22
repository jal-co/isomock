import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  readToolcraftCheckpointBundle,
  writeToolcraftCheckpointBundle,
} from "./toolcraft-checkpoint-bundle.mjs";
import { getToolcraftCheckpointBundlePath } from "./toolcraft-checkpoint-paths.mjs";
import {
  TOOLCRAFT_PERFORMANCE_RECEIPT_VERSION,
  collectToolcraftVerificationInputs,
  validateToolcraftPerformanceReceipt,
} from "./toolcraft-verification-receipt.mjs";
import {
  createToolcraftPerformanceCheckpointReceipt,
  getToolcraftPerformanceReceiptShapeError,
} from "./toolcraft-performance-receipt-policy.mjs";
import {
  createPerformanceEvidenceFixture,
  createReceiptFixture,
  writePassedCheckpointFixture,
} from "./toolcraft-verification-receipt-test-helpers.mjs";

test("constructs an exact deeply frozen source-bound full-performance checkpoint", async (t) => {
  const rootDir = await createReceiptFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const inventory = await collectToolcraftVerificationInputs(rootDir);
  const evidence = createPerformanceEvidenceFixture();
  const checkpoint = createToolcraftPerformanceCheckpointReceipt({
    evidence,
    inventory,
  });

  assert.equal(TOOLCRAFT_PERFORMANCE_RECEIPT_VERSION, 5);
  assert.equal(getToolcraftPerformanceReceiptShapeError(checkpoint), undefined);
  assert.equal(checkpoint.sourceHash, inventory.sourceHash);
  assert.deepEqual(checkpoint.files, inventory.entries);
  assert.deepEqual(Object.keys(checkpoint).sort(), [
    "completedAt",
    "files",
    "kind",
    "performanceEvidence",
    "runner",
    "sourceHash",
    "status",
    "version",
  ]);
  assert.equal(Object.isFrozen(checkpoint), true);
  assert.equal(Object.isFrozen(checkpoint.files), true);
  assert.equal(Object.isFrozen(checkpoint.files[0]), true);
  assert.equal(Object.isFrozen(checkpoint.performanceEvidence), true);
  assert.equal(Object.isFrozen(checkpoint.performanceEvidence.environment), true);
  assert.equal(
    Object.isFrozen(checkpoint.performanceEvidence.environment.browser),
    true,
  );
  assert.equal(
    Object.isFrozen(checkpoint.performanceEvidence.measurements),
    true,
  );
  assert.throws(() => {
    checkpoint.performanceEvidence.environment.browser.name = "forged";
  }, TypeError);
  evidence.environment.browser.name = "mutated-input";
  assert.equal(
    checkpoint.performanceEvidence.environment.browser.name,
    "chromium",
  );
});

test("rejects excess fields outside the current checkpoint model", async (t) => {
  const rootDir = await createReceiptFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const inventory = await collectToolcraftVerificationInputs(rootDir);

  assert.match(
    getToolcraftPerformanceReceiptShapeError({
      completedAt: new Date().toISOString(),
      files: inventory.entries,
      kind: "performance-checkpoint",
      performanceEvidence: createPerformanceEvidenceFixture(),
      runner: "protected-playwright",
      sourceHash: inventory.sourceHash,
      status: "passed",
      unexpectedAuthority: true,
      version: TOOLCRAFT_PERFORMANCE_RECEIPT_VERSION,
    }),
    /malformed|unsupported/iu,
  );
});

test("accepts a passed receipt only while its source inventory is current", async (t) => {
  const rootDir = await createReceiptFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  await writePassedCheckpointFixture(rootDir);

  assert.deepEqual(await validateToolcraftPerformanceReceipt({ rootDir }), []);
  await fs.writeFile(
    path.join(rootDir, "src", "app", "app-schema.ts"),
    'export const schema = { mode: "changed" };\n',
  );
  const errors = await validateToolcraftPerformanceReceipt({ rootDir });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /stale/iu);
});

test("rejects manual agent-browser receipts without automated runner proof", async (t) => {
  const rootDir = await createReceiptFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  await writePassedCheckpointFixture(rootDir, { runner: "agent-browser" });

  assert.match(
    (await validateToolcraftPerformanceReceipt({ rootDir }))[0],
    /supported runner/iu,
  );
});

test("rejects a receipt whose file inventory does not produce its source hash", async (t) => {
  const rootDir = await createReceiptFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  await writePassedCheckpointFixture(rootDir);
  const loaded = await readToolcraftCheckpointBundle(rootDir);
  await writeToolcraftCheckpointBundle({
    bundle: {
      ...loaded.bundle,
      performanceBaseline: { ...loaded.bundle.performanceBaseline, files: [] },
    },
    rootDir,
  });

  assert.match(
    (await validateToolcraftPerformanceReceipt({ rootDir }))[0],
    /file inventory.*source hash/iu,
  );
});

test("invalidates a checkpoint when the npm dependency graph changes", async (t) => {
  const rootDir = await createReceiptFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const packageLockPath = path.join(rootDir, "package-lock.json");
  await fs.writeFile(
    packageLockPath,
    JSON.stringify({ lockfileVersion: 3, packages: {} }),
  );
  await writePassedCheckpointFixture(rootDir);
  await fs.writeFile(
    packageLockPath,
    JSON.stringify({
      lockfileVersion: 3,
      packages: { "node_modules/example": { version: "2.0.0" } },
    }),
  );

  assert.match(
    (await validateToolcraftPerformanceReceipt({ rootDir }))[0],
    /stale/iu,
  );
});

test("rejects malformed and non-passed receipts", async (t) => {
  const rootDir = await createReceiptFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const bundlePath = getToolcraftCheckpointBundlePath(rootDir);
  await fs.mkdir(path.dirname(bundlePath), { recursive: true });
  await fs.writeFile(bundlePath, "not json");
  const malformedErrors = await validateToolcraftPerformanceReceipt({
    rootDir,
  });
  assert.equal(malformedErrors.length, 1);
  assert.match(malformedErrors[0], /malformed/iu);

  await fs.rm(bundlePath);
  await writePassedCheckpointFixture(rootDir);
  const loaded = await readToolcraftCheckpointBundle(rootDir);
  await writeToolcraftCheckpointBundle({
    bundle: {
      ...loaded.bundle,
      performanceBaseline: {
        ...loaded.bundle.performanceBaseline,
        status: "failed",
      },
    },
    rootDir,
  });
  const failedErrors = await validateToolcraftPerformanceReceipt({ rootDir });
  assert.equal(failedErrors.length, 1);
  assert.match(failedErrors[0], /passed/iu);
});

test("rejects unsupported full baseline receipt versions", async (t) => {
  const rootDir = await createReceiptFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));

  await writePassedCheckpointFixture(rootDir);
  const loaded = await readToolcraftCheckpointBundle(rootDir);
  await writeToolcraftCheckpointBundle({
    bundle: {
      ...loaded.bundle,
      performanceBaseline: {
        ...loaded.bundle.performanceBaseline,
        version: 2,
      },
    },
    rootDir,
  });
  assert.match(
    (await validateToolcraftPerformanceReceipt({ rootDir }))[0],
    /unsupported version/iu,
  );
});
