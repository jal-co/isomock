import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import {
  createToolcraftCheckpointBundle,
  writeToolcraftCheckpointBundle,
} from "./toolcraft-checkpoint-bundle.mjs";
import {
  getToolcraftDeliveryAnchorShapeError,
  normalizeToolcraftDeliveryAnchor,
  readToolcraftDeliveryAnchor,
} from "./toolcraft-delivery-anchor.mjs";
import {
  createPlanReceiptFixture,
} from "./toolcraft-delivery-receipt-test-helpers.mjs";
import {
  createToolcraftDeliveryReceipt,
} from "./toolcraft-delivery-receipt.mjs";
import {
  createToolcraftTargetedPerformanceComparisonHash,
} from "./toolcraft-targeted-performance-report.mjs";
import {
  createReceiptFixture,
} from "./toolcraft-verification-receipt-test-helpers.mjs";

test("initial receipt is the durable product proof anchor", () => {
  const receipt = createToolcraftDeliveryReceipt(
    createPlanReceiptFixture("functional-initial"),
  );
  const anchor = normalizeToolcraftDeliveryAnchor(receipt);

  assert.equal(Object.isFrozen(anchor), true);
  assert.deepEqual(anchor.files, receipt.files);
  assert.equal(anchor.functionalProofModel, receipt.functionalProofModel);
  assert.deepEqual(anchor.lifecycle, receipt.plan.lifecycle);
  assert.deepEqual(anchor.performance, { kind: "none" });
  assert.equal(anchor.sourceHash, receipt.sourceHash);
});

test("targeted performance receipt carries exact comparison evidence", () => {
  const receipt = createToolcraftDeliveryReceipt(
    createPlanReceiptFixture("performance-iteration"),
  );
  const evidence = receipt.evidence.find(
    ({ kind }) => kind === "browser-performance",
  );
  const anchor = normalizeToolcraftDeliveryAnchor(receipt);

  assert.deepEqual(anchor.performance, {
    comparisonHash: createToolcraftTargetedPerformanceComparisonHash(
      evidence.report,
    ),
    kind: "performance-iteration-report",
    report: evidence.report,
    requestAuthorityHash: receipt.plan.requestAuthorityHash,
  });
});

test("rejects obsolete delivery receipt and plan versions", () => {
  for (const version of [2, 3, 4, 5, 6, 7]) {
    assert.throws(
      () => normalizeToolcraftDeliveryAnchor({ version }),
      /unsupported version/iu,
    );
    assert.match(
      getToolcraftDeliveryAnchorShapeError({ version }),
      /unsupported version/iu,
    );
  }
  const receipt = createToolcraftDeliveryReceipt(
    createPlanReceiptFixture("functional-initial"),
  );
  assert.throws(
    () => normalizeToolcraftDeliveryAnchor({ ...receipt, planVersion: 5 }),
    /unsupported|malformed/iu,
  );
});

test("bundle anchor preserves initial proof and overlays targeted lifecycle", async (t) => {
  const rootDir = await createReceiptFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const initial = createToolcraftDeliveryReceipt(
    createPlanReceiptFixture("functional-initial"),
  );
  const targeted = createToolcraftDeliveryReceipt(
    createPlanReceiptFixture("performance-iteration"),
  );
  await writeToolcraftCheckpointBundle({
    bundle: createToolcraftCheckpointBundle({
      currentPerformance: targeted,
      delivery: initial,
    }),
    rootDir,
  });

  const loaded = await readToolcraftDeliveryAnchor(rootDir);
  assert.deepEqual(loaded.receipt, initial);
  assert.equal(loaded.anchor.sourceHash, initial.sourceHash);
  assert.deepEqual(loaded.anchor.lifecycle, targeted.plan.lifecycle);
  assert.equal(loaded.anchor.performance.kind, "performance-iteration-report");
});

test("bundle anchor fails closed on malformed current performance state", async (t) => {
  const rootDir = await createReceiptFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const initial = createToolcraftDeliveryReceipt(
    createPlanReceiptFixture("functional-initial"),
  );
  await writeToolcraftCheckpointBundle({
    bundle: createToolcraftCheckpointBundle({
      currentPerformance: { kind: "candidate" },
      delivery: initial,
    }),
    rootDir,
  });

  const loaded = await readToolcraftDeliveryAnchor(rootDir);
  assert.match(loaded.error, /malformed|unsupported/iu);
});
