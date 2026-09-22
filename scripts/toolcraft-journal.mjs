#!/usr/bin/env node
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createJournalChange,
  listJournalChanges,
  readJournalChange,
  updateJournalChange,
} from "./toolcraft-journal-changes.mjs";
import {
  getJournalPaths,
  requireJournalId,
} from "./toolcraft-journal-files.mjs";
import { importJournalWorklog } from "./toolcraft-journal-migration.mjs";
import {
  listJournalRuns,
  readJournalRun,
  withJournalRun,
} from "./toolcraft-journal-runs.mjs";

function parseArguments(args) {
  const normalized = args[0] === "--" ? args.slice(1) : [...args];
  const action = normalized.shift() ?? "list";
  const options = {};
  while (normalized.length && normalized[0] !== "--") {
    const name = normalized.shift();
    if (
      ![
        "--project",
        "--input",
        "--change",
        "--run",
        "--retry",
        "--revision",
      ].includes(name) ||
      options[name.slice(2)] !== undefined ||
      !normalized.length
    )
      throw new Error(`Invalid journal option: ${name}`);
    options[name.slice(2)] = normalized.shift();
  }
  if (normalized[0] === "--") normalized.shift();
  return { action, options, command: normalized };
}

export async function runJournalCli(
  args = process.argv.slice(2),
  write = (text) => process.stdout.write(text),
) {
  const { action, options, command } = parseArguments(args);
  const projectDir = path.resolve(options.project ?? process.cwd());
  const print = (value) => {
    write(`${JSON.stringify(value, null, 2)}\n`);
    return value;
  };
  if (action === "change" || action === "update") {
    if (!options.input)
      throw new Error("Journal change/update requires --input <json-file>.");
    const input = JSON.parse(
      await readFile(path.resolve(options.input), "utf8"),
    );
    return print(
      action === "change"
        ? await createJournalChange(projectDir, input)
        : await updateJournalChange(
            projectDir,
            options.change,
            Number(options.revision),
            input,
          ),
    );
  }
  if (action === "import") return print(await importJournalWorklog(projectDir));
  if (action === "list") {
    const changes = await listJournalChanges(projectDir);
    const runs = await listJournalRuns(projectDir);
    return print({
      changes: changes
        .slice(0, 20)
        .map(({ changeId, title, status, updatedAt }) => ({
          changeId,
          title,
          status,
          recordedAt: updatedAt,
        })),
      runs: runs
        .slice(0, 20)
        .map(({ runId, changeId, status, startedAt, stage, retryOf }) => ({
          runId,
          changeId,
          status,
          startedAt,
          stage,
          retryOf,
        })),
      note: "running means unfinished; its final outcome is unknown. Imported timestamps are recording times, not historical event times.",
    });
  }
  if (action === "show") {
    if (options.run) {
      const record = await readJournalRun(projectDir, options.run);
      print({
        run: record,
        changeAtRun:
          record.linkage === "linked"
            ? await readJournalChange(
                projectDir,
                record.changeId,
                record.changeRevision,
              )
            : null,
      });
      const logPath = path.join(
        getJournalPaths(projectDir).runs,
        requireJournalId(options.run),
        "events.jsonl",
      );
      const output = await readFile(logPath, "utf8");
      const limit = 64 * 1024;
      if (output.length > limit)
        write(
          `[toolcraft] Showing the last ${limit} characters; complete text: ${logPath}\n`,
        );
      write(output.slice(-limit));
      return record;
    }
    if (!options.change)
      throw new Error("Journal show requires --change or --run.");
    return print({
      change: await readJournalChange(projectDir, options.change),
      runs: (await listJournalRuns(projectDir)).filter(
        (run) => run.changeId === options.change,
      ),
    });
  }
  if (action === "run") {
    if (!command.length)
      throw new Error("Journal run requires -- <executable> [arguments].");
    const controller = new AbortController();
    const interrupt = (signal) => controller.abort(signal);
    const onInt = () => interrupt("SIGINT"),
      onTerm = () => interrupt("SIGTERM");
    process.once("SIGINT", onInt);
    process.once("SIGTERM", onTerm);
    try {
      return await withJournalRun(
        {
          projectDir,
          command: command[0],
          arguments_: command.slice(1),
          changeId: options.change ?? null,
          retryOf: options.retry ?? null,
        },
        async (run) => {
          write(`[toolcraft] Text journal run: ${run.runId}\n`);
          const { runToolcraftProofProcess } =
            await import("./toolcraft-proof-process.mjs");
          await run.stage("command");
          return runToolcraftProofProcess(command[0], command.slice(1), {
            cwd: projectDir,
            onOutput: run.output,
            abortSignal: controller.signal,
            deadlineMs: 12 * 60 * 60 * 1000,
          });
        },
      );
    } finally {
      process.removeListener("SIGINT", onInt);
      process.removeListener("SIGTERM", onTerm);
    }
  }
  throw new Error("Journal actions: change, update, list, show, run, import.");
}

const modulePath = fileURLToPath(import.meta.url);
if (
  process.argv[1] &&
  (await realpath(process.argv[1]).catch(() =>
    path.resolve(process.argv[1]),
  )) === (await realpath(modulePath))
) {
  try {
    await runJournalCli();
  } catch (error) {
    console.error(error);
    process.exitCode =
      error?.signal === "SIGINT"
        ? 130
        : error?.signal === "SIGTERM"
          ? 143
          : Number.isInteger(error?.code) && error.code > 0 && error.code < 256
            ? error.code
            : 1;
  }
}
