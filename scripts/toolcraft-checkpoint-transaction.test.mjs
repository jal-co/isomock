import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { getToolcraftCheckpointBundlePath } from "./toolcraft-checkpoint-paths.mjs";
import { commitToolcraftDeliveryCheckpoint } from "./toolcraft-checkpoint-transaction.mjs";
import { createToolcraftDeliveryReceipt } from "./toolcraft-delivery-receipt.mjs";
import {
  createPlanReceiptFixture,
} from "./toolcraft-delivery-receipt-test-helpers.mjs";
import {
  createCheckpointFixture,
} from "./toolcraft-checkpoint-transaction-test-helpers.mjs";
import {
  createReceiptFixture,
} from "./toolcraft-verification-receipt-test-helpers.mjs";

test("commit module exports only the delivery-specific checkpoint writer", async () => {
  const transactionModule = await import("./toolcraft-checkpoint-transaction.mjs");
  assert.deepEqual(Object.keys(transactionModule), [
    "commitToolcraftDeliveryCheckpoint",
  ]);
});

test("checkpoint commit consumes final inventory without recollecting source", async () => {
  const sources = await Promise.all([
    fs.readFile(
      path.join(
        import.meta.dirname,
        "toolcraft-checkpoint-transaction.mjs",
      ),
      "utf8",
    ),
    fs.readFile(
      path.join(
        import.meta.dirname,
        "toolcraft-checkpoint-delivery-state.mjs",
      ),
      "utf8",
    ),
  ]);
  const source = sources.join("\n");
  assert.equal(source.includes("collectToolcraftVerificationInputs"), false);
  assert.equal(source.includes("getToolcraftTargetedVerificationContext"), false);
  assert.equal(source.includes("finalInventory"), true);
  assert.equal(
    sources[0].includes("readToolcraftCheckpointBundle"),
    true,
  );
});

test("malformed delivery input cannot mutate checkpoint authority", async (t) => {
  const { rootDir, verificationDir } = await createCheckpointFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const unrelatedPath = path.join(verificationDir, "unrelated.json");
  await fs.writeFile(unrelatedPath, "unrelated-sentinel\n");

  await assert.rejects(
    commitToolcraftDeliveryCheckpoint({
      deliveryReceipt: {},
      projectDir: rootDir,
    }),
    /malformed|unsupported/iu,
  );
  await assert.rejects(
    commitToolcraftDeliveryCheckpoint({
      entries: [{ contents: "forged-authority\n", filePath: unrelatedPath }],
      projectDir: rootDir,
    }),
    /commit options are malformed or unsupported/iu,
  );

  assert.equal(await fs.readFile(unrelatedPath, "utf8"), "unrelated-sentinel\n");
  await assert.rejects(
    fs.access(getToolcraftCheckpointBundlePath(rootDir)),
    /ENOENT/iu,
  );
});

test("unsupported delivery versions cannot cross execution authority", async (t) => {
  const { rootDir } = await createCheckpointFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));

  await assert.rejects(
    commitToolcraftDeliveryCheckpoint({
      deliveryReceipt: { version: 7 },
      projectDir: rootDir,
    }),
    /malformed|unsupported/iu,
  );
  await assert.rejects(
    fs.access(getToolcraftCheckpointBundlePath(rootDir)),
    /ENOENT/iu,
  );
});

test("caller-authored current v8 receipt cannot be promoted without plan execution authority", async (t) => {
  const rootDir = await createReceiptFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const fixture = createPlanReceiptFixture("functional-initial");
  const receipt = createToolcraftDeliveryReceipt(fixture);

  await assert.rejects(
    commitToolcraftDeliveryCheckpoint({
      deliveryReceipt: receipt,
      finalInventory: fixture.result.finalInventory,
      projectDir: rootDir,
    }),
    /protected plan execution authority/iu,
  );
});
