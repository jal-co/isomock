import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createJournalChange,
  readJournalChange,
  updateJournalChange,
} from "./toolcraft-journal-changes.mjs";
import { listJournalRuns, withJournalRun } from "./toolcraft-journal-runs.mjs";
import {
  captureToolcraftProofProcess,
  runToolcraftProofProcess,
} from "./toolcraft-proof-process.mjs";
import { runToolcraftFeatureVerificationCore } from "./run-feature-verification.mjs";
import { createToolcraftPerformanceRequestAuthority } from "./toolcraft-performance-request-authority.mjs";

async function temporary(t) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "toolcraft-journal-boundary-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
const input = { title: "Label", request: { text: "Rename the label." } };

test("a run can recover the exact change revision after subsequent edits", async (t) => {
  const root = await temporary(t);
  const original = await createJournalChange(root, input);
  await withJournalRun(
    { projectDir: root, command: "check", changeId: original.changeId },
    async () => {},
  );
  await updateJournalChange(root, original.changeId, 1, {
    ...input,
    request: { text: "Now change something else." },
    result: "Second decision",
  });
  const [run] = await listJournalRuns(root);
  assert.deepEqual(
    await readJournalChange(root, run.changeId, run.changeRevision),
    original,
  );
});

test("readers never see partial JSON while runs are published concurrently", async (t) => {
  const root = await temporary(t);
  const tasks = Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      withJournalRun(
        { projectDir: root, command: `check-${i}` },
        async () => {},
      ),
    ),
  );
  for (let i = 0; i < 15; i++) {
    for (const run of await listJournalRuns(root))
      assert.ok(["running", "passed"].includes(run.status));
    await new Promise((resolve) => setImmediate(resolve));
  }
  await tasks;
  assert.equal((await listJournalRuns(root)).length, 12);
});

test("journal directory symlinks cannot create files outside the project", async (t) => {
  const root = await temporary(t),
    outside = await temporary(t);
  await symlink(outside, path.join(root, "docs"), "dir");
  await assert.rejects(createJournalChange(root, input), /symlink/);
  assert.deepEqual(await readdir(outside), []);
});

test("an output sink failure stops its child and remains the primary error", async () => {
  const error = new Error("text log disk failure");
  await assert.rejects(
    runToolcraftProofProcess(
      process.execPath,
      ["-e", "console.log('ready'); setInterval(() => {}, 1000)"],
      {
        deadlineMs: 3000,
        onOutput() {
          throw error;
        },
      },
    ),
    (actual) => actual === error,
  );
});

test("output observation preserves capture semantics and empty command arguments", async (t) => {
  const root = await temporary(t);
  const observed = [];
  await withJournalRun(
    { projectDir: root, command: process.execPath, arguments_: ["-e", "", ""] },
    async (run) => {
      const result = await captureToolcraftProofProcess(
        process.execPath,
        ["-e", "process.stdout.write('out'); process.stderr.write('err')"],
        {
          onOutput(stream, text) {
            observed.push({ stream, text });
            run.output(stream, text);
          },
        },
      );
      assert.equal(result, "out");
    },
  );
  assert.ok(
    observed.some(({ stream, text }) => stream === "stderr" && text === "err"),
  );
});

test("aggregate failures retain both operation and cleanup causes", async (t) => {
  const root = await temporary(t);
  await assert.rejects(
    withJournalRun({ projectDir: root, command: "check" }, async () => {
      throw new AggregateError(
        [new Error("assertion failed"), new Error("cleanup failed")],
        "Both failed",
      );
    }),
    /Both failed/,
  );
  const [run] = await listJournalRuns(root);
  assert.deepEqual(
    run.error.errors.map(({ message }) => message),
    ["assertion failed", "cleanup failed"],
  );
});

test("real feature preflight failure is journaled before any source load", async (t) => {
  const root = await temporary(t);
  const change = await createJournalChange(root, input);
  await assert.rejects(
    runToolcraftFeatureVerificationCore({
      projectDir: root,
      env: { TOOLCRAFT_CHANGE_ID: change.changeId },
      request: { mode: "ids", version: 1, acceptanceIds: ["label"] },
      dependencies: {
        validatePlaywrightPreflightAuthority: async () => {
          throw new Error("invalid signed preflight");
        },
        loadFeaturePlan: async () => assert.fail("source must not load"),
      },
    }),
    /invalid signed preflight/,
  );
  const [run] = await listJournalRuns(root);
  assert.equal(run.kind, "feature");
  assert.equal(run.stage, "authority-preflight");
  assert.equal(run.changeId, change.changeId);
  assert.equal(run.status, "failed");
});

test("duplicate explicit IDs and malformed active selectors cannot select old authority", () => {
  const entry = (id) =>
    `### Change ${id}\n- Change ID: same\n- Request: Rename label.\n- Verification: Passed.\n`;
  assert.throws(
    () =>
      createToolcraftPerformanceRequestAuthority(
        `Active change: same\n## Decision Trail\n${entry("A")}\n${entry("B")}`,
      ),
    /duplicate Change ID/,
  );
  assert.throws(
    () =>
      createToolcraftPerformanceRequestAuthority(
        `Active change: invalid value\n## Decision Trail\n${entry("A")}`,
      ),
    /Active change/,
  );
});
