import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createToolcraftKernelBenchmarkRequirements,
  getToolcraftKernelBenchmarkReceiptError,
  getToolcraftKernelBenchmarkRequirementHash,
  readToolcraftKernelBenchmarkReceipt,
  writeToolcraftKernelBenchmarkReport,
} from "./toolcraft-kernel-benchmark-receipt.mjs";

const sourceHash = "a".repeat(64);
const requirements = createToolcraftKernelBenchmarkRequirements({
  decisions: [
    {
      candidates: ["canvas-2d", "webgl"],
      decision: "Measured candidates use equal full-quality output.",
      id: "effect",
      selected: "webgl",
    },
  ],
  requirements: [
    {
      candidates: ["canvas-2d", "webgl"],
      passId: "effect",
      workload: { pixels: 100, samples: 4 },
    },
  ],
});

function createReceipt(overrides = {}) {
  return {
    benchmarks: [
      {
        measurements: ["canvas-2d", "webgl"].map((candidate, index) => ({
          candidate,
          durationMs: 10 + index,
          implementationHash: String(index + 1).repeat(64),
          iterations: 20,
          outputHash: "f".repeat(64),
        })),
        passId: "effect",
        selected: "webgl",
        workloadHash: "1b5a2a437ea204e7ab3694720c7d5069e92c22f911c51e61e2d16a94e5ab9cd0",
      },
    ],
    completedAt: "2026-07-15T12:00:00.000Z",
    kind: "kernel-benchmark",
    nonce: "protected-nonce",
    requirementHash: getToolcraftKernelBenchmarkRequirementHash(requirements),
    requirements,
    runner: "protected-playwright",
    sourceHash,
    status: "passed",
    version: 1,
    ...overrides,
  };
}

test("normalizes decisions against every derived requirement", () => {
  assert.deepEqual(requirements, [
    {
      candidates: ["canvas-2d", "webgl"],
      passId: "effect",
      selected: "webgl",
      workload: { pixels: 100, samples: 4 },
    },
  ]);
  assert.throws(
    () =>
      createToolcraftKernelBenchmarkRequirements({
        decisions: [],
        requirements: [{ candidates: ["webgl"], passId: "effect", workload: {} }],
      }),
    /resolve every derived requirement/iu,
  );
});

test("writes and reads a protected current-source kernel receipt", async (t) => {
  const rootDir = mkdtempSync(path.join(tmpdir(), "toolcraft-kernel-receipt-"));
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));
  const receiptPath = path.join(rootDir, "kernel.json");

  await writeToolcraftKernelBenchmarkReport(receiptPath, createReceipt());
  const receipt = await readToolcraftKernelBenchmarkReceipt(receiptPath, {
    nonce: "protected-nonce",
    requirements,
    sourceHash,
  });

  assert.equal(receipt.status, "passed");
  assert.equal(receipt.benchmarks[0].measurements.length, 2);
});

test("rejects stale, forged, incomplete, and unequal benchmark evidence", () => {
  assert.match(
    getToolcraftKernelBenchmarkReceiptError(createReceipt(), {
      requirements,
      sourceHash: "b".repeat(64),
    }),
    /stale/iu,
  );

  const zeroDuration = createReceipt();
  zeroDuration.benchmarks[0].measurements[0].durationMs = 0;
  assert.match(
    getToolcraftKernelBenchmarkReceiptError(zeroDuration, { requirements, sourceHash }),
    /measurement.*malformed/iu,
  );

  const missingCandidate = createReceipt();
  missingCandidate.benchmarks[0].measurements.pop();
  assert.match(
    getToolcraftKernelBenchmarkReceiptError(missingCandidate, {
      requirements,
      sourceHash,
    }),
    /does not match its requirement/iu,
  );

  const unequalOutput = createReceipt();
  unequalOutput.benchmarks[0].measurements[1].outputHash = "e".repeat(64);
  assert.match(
    getToolcraftKernelBenchmarkReceiptError(unequalOutput, {
      requirements,
      sourceHash,
    }),
    /did not produce equal full-quality output/iu,
  );
});

test("rejects a selected strategy or requirement set that changed", () => {
  const changedRequirements = requirements.map((requirement) => ({
    ...requirement,
    selected: "canvas-2d",
  }));
  assert.match(
    getToolcraftKernelBenchmarkReceiptError(createReceipt(), {
      requirements: changedRequirements,
      sourceHash,
    }),
    /requirements do not match/iu,
  );

  const forgedHash = createReceipt({ requirementHash: "0".repeat(64) });
  assert.match(
    getToolcraftKernelBenchmarkReceiptError(forgedHash, { sourceHash }),
    /requirement hash is invalid/iu,
  );
});

test("missing and malformed receipt files cannot become evidence", async (t) => {
  const rootDir = mkdtempSync(path.join(tmpdir(), "toolcraft-kernel-missing-"));
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));
  const receiptPath = path.join(rootDir, "nested", "kernel.json");
  await assert.rejects(
    readToolcraftKernelBenchmarkReceipt(receiptPath, { requirements, sourceHash }),
    /receipt is missing/iu,
  );
  mkdirSync(path.dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, "not json");
  await assert.rejects(
    readToolcraftKernelBenchmarkReceipt(receiptPath, { requirements, sourceHash }),
    /malformed JSON/iu,
  );
});
