import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createJournalChange,
  readJournalChange,
  updateJournalChange,
} from "./toolcraft-journal-changes.mjs";
import { importJournalWorklog } from "./toolcraft-journal-migration.mjs";
import { listJournalRuns, withJournalRun } from "./toolcraft-journal-runs.mjs";
import { runJournalCli } from "./toolcraft-journal.mjs";
import { runToolcraftProofProcess } from "./toolcraft-proof-process.mjs";

async function project(t) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "toolcraft-text-journal-test-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    path.join(directory, "package.json"),
    '{"name":"journal-fixture"}',
  );
  return directory;
}
const input = {
  title: "Fix the label",
  request: { text: "Rename label exactly.", messageRef: "user-message:test-1" },
  owners: ["src/app/app-schema.ts"],
};
async function events(directory, runId) {
  return (
    await readFile(
      path.join(directory, ".toolcraft/journal/runs", runId, "events.jsonl"),
      "utf8",
    )
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

test("failed child, correction and successful retry remain readable together", async (t) => {
  const directory = await project(t);
  const change = await createJournalChange(directory, input);
  const first = {
    projectDir: directory,
    changeId: change.changeId,
    command: process.execPath,
    arguments_: [
      "-e",
      "process.stderr.write('label assertion failed\\n'); process.exit(7)",
    ],
  };
  await assert.rejects(
    withJournalRun(first, (run) =>
      runToolcraftProofProcess(first.command, first.arguments_, {
        cwd: directory,
        onOutput: run.output,
      }),
    ),
    { code: 7 },
  );
  const [failed] = await listJournalRuns(directory);
  assert.equal(failed.status, "failed");
  assert.equal(failed.exitCode, 7);
  const before = await events(directory, failed.runId);
  assert.ok(
    before.some(
      (event) =>
        event.stream === "stderr" &&
        event.text.includes("label assertion failed"),
    ),
  );
  await updateJournalChange(directory, change.changeId, 1, {
    ...input,
    result: "Corrected mapping",
    status: "complete",
  });
  await withJournalRun(
    {
      ...first,
      arguments_: ["-e", "console.log('label passed')"],
      retryOf: failed.runId,
    },
    (run) =>
      runToolcraftProofProcess(
        process.execPath,
        ["-e", "console.log('label passed')"],
        { cwd: directory, onOutput: run.output },
      ),
  );
  const runs = await listJournalRuns(directory);
  assert.equal(runs.length, 2);
  const passed = runs.find((run) => run.status === "passed");
  assert.equal(passed.retryOf, failed.runId);
  assert.equal(passed.changeRevision, 2);
  assert.deepEqual(await events(directory, failed.runId), before);
  let text = "";
  await runJournalCli(
    ["show", "--project", directory, "--change", change.changeId],
    (chunk) => {
      text += chunk;
    },
  );
  assert.match(text, /Rename label exactly/);
  assert.match(text, /failed/);
  assert.match(text, /passed/);
});

test("preflight failure and missing change linkage are explicit", async (t) => {
  const directory = await project(t);
  await assert.rejects(
    withJournalRun(
      { projectDir: directory, command: "test:feature" },
      async () => {
        throw new Error("signed config changed");
      },
    ),
    /signed config changed/,
  );
  const [run] = await listJournalRuns(directory);
  assert.equal(run.linkage, "unlinked");
  assert.equal(run.stage, "preflight");
  assert.equal(run.status, "failed");
  assert.match(run.error.stack, /signed config changed/);
  await assert.rejects(
    withJournalRun(
      { projectDir: directory, command: "test", changeId: "../../escape" },
      async () => assert.fail("must not execute"),
    ),
    /UUID/,
  );
});

test("parallel runs keep independent output and change updates reject lost writes", async (t) => {
  const directory = await project(t);
  const change = await createJournalChange(directory, input);
  await Promise.all(
    ["alpha", "beta"].map((name) =>
      withJournalRun(
        { projectDir: directory, command: name, changeId: change.changeId },
        async (run) => {
          run.output("stdout", name);
        },
      ),
    ),
  );
  for (const run of await listJournalRuns(directory)) {
    assert.equal(run.status, "passed");
    assert.deepEqual(
      (await events(directory, run.runId))
        .filter((event) => event.type === "output")
        .map((event) => event.text),
      [run.command],
    );
  }
  const updates = await Promise.allSettled(
    ["one", "two"].map((result) =>
      updateJournalChange(directory, change.changeId, 1, { ...input, result }),
    ),
  );
  assert.equal(
    updates.filter((value) => value.status === "fulfilled").length,
    1,
  );
  assert.equal(
    (await readJournalChange(directory, change.changeId)).revision,
    2,
  );
});

test("interruption records its signal and retains output before cancellation", async (t) => {
  const directory = await project(t);
  const controller = new AbortController();
  await assert.rejects(
    withJournalRun(
      { projectDir: directory, command: process.execPath },
      async (run) => {
        await runToolcraftProofProcess(
          process.execPath,
          ["-e", "console.log('ready'); setInterval(() => {}, 1000)"],
          {
            cwd: directory,
            deadlineMs: 5000,
            abortSignal: controller.signal,
            onOutput(stream, chunk) {
              run.output(stream, chunk);
              controller.abort("SIGINT");
            },
          },
        );
      },
    ),
    { name: "AbortError" },
  );
  const [run] = await listJournalRuns(directory);
  assert.equal(run.status, "interrupted");
  assert.equal(run.signal, "SIGINT");
  assert.ok(
    (await events(directory, run.runId)).some((event) =>
      event.text?.includes("ready"),
    ),
  );
});

test("bounded output reports omission and dirty selected input changes", async (t) => {
  const directory = await project(t);
  execFileSync("git", ["init", "-q", directory]);
  execFileSync("git", [
    "-C",
    directory,
    "-c",
    "user.name=Journal Test",
    "-c",
    "user.email=journal@example.invalid",
    "commit",
    "--allow-empty",
    "-qm",
    "fixture",
  ]);
  await mkdir(path.join(directory, "src/app"), { recursive: true });
  const source = path.join(directory, "src/app/app-schema.ts");
  await writeFile(source, "before");
  await withJournalRun(
    { projectDir: directory, command: "check", textLimitBytes: 4 },
    async (run) => {
      run.output("stdout", "okay");
      run.output("stderr", "omitted");
      await writeFile(source, "after");
    },
  );
  const [run] = await listJournalRuns(directory);
  assert.equal(run.outputBytesOmitted, 7);
  assert.equal(run.sourceBefore.git.dirty, true);
  assert.equal(run.sourceChanged, true);
  assert.equal(run.sourceBefore.complete, false);
  const log = await events(directory, run.runId);
  assert.deepEqual(
    log.map((event) => event.sequence),
    log.map((_, index) => index + 1),
  );
  assert.equal(log.at(-1).outputBytesOmitted, 7);
});

test("legacy import preserves every source byte and duplicate headings without invented dates", async (t) => {
  const directory = await project(t);
  await mkdir(path.join(directory, "docs/toolcraft"), { recursive: true });
  const source =
    "# Worklog\r\n### Iteration 2 — New\r\n- Request: new\r\n```txt\r\nold raw output\r\n```\r\n## Decision Trail\r\n### Iteration 1 — Old\r\n- Request: old\r\n### Iteration 2 — Another\r\n- Request: other\r\n";
  const worklog = path.join(directory, "docs/toolcraft/agent-worklog.md");
  await writeFile(worklog, source);
  const result = await importJournalWorklog(directory);
  assert.equal(result.changes.length, 3);
  assert.equal(
    await readFile(path.join(directory, result.archive), "utf8"),
    source,
  );
  assert.equal(await readFile(worklog, "utf8"), source);
  const newer = await readJournalChange(directory, result.changes[0].changeId);
  assert.equal(newer.request.messageRef, null);
  assert.equal(newer.legacy.occurredAt, null);
  assert.match(newer.legacy.text, /old raw output/);
  const repeated = await importJournalWorklog(directory);
  assert.deepEqual(repeated.changes, result.changes);
  assert.equal(
    (await readdir(path.join(directory, "docs/agent-journal/changes"))).length,
    3,
  );
});

test("unknown unfinished attempts are not rewritten as success by readback", async (t) => {
  const directory = await project(t);
  let release;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const task = withJournalRun(
    { projectDir: directory, command: "pending" },
    async () => {
      started();
      await waiting;
    },
  );
  await ready;
  const [record] = await listJournalRuns(directory);
  assert.equal(record.status, "running");
  assert.equal(record.completedAt, null);
  release();
  await task;
});

test("the public command wrapper records spawn failures and exposes their text", async (t) => {
  const directory = await project(t);
  await assert.rejects(
    runJournalCli(
      [
        "run",
        "--project",
        directory,
        "--",
        path.join(directory, "missing-command"),
      ],
      () => {},
    ),
    { code: "ENOENT" },
  );
  const [record] = await listJournalRuns(directory);
  assert.equal(record.status, "failed");
  assert.equal(record.stage, "command");
  let output = "";
  await runJournalCli(
    ["show", "--project", directory, "--run", record.runId],
    (text) => {
      output += text;
    },
  );
  assert.match(output, /ENOENT/);
  assert.match(output, /missing-command/);
});
