import { randomUUID } from "node:crypto";
import { appendFileSync, closeSync, openSync } from "node:fs";
import { mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { readJournalChange } from "./toolcraft-journal-changes.mjs";
import { collectJournalSource } from "./toolcraft-journal-source.mjs";
import {
  getJournalPaths,
  readJournalJson,
  requireJournalDirectory,
  requireJournalId,
  requireJournalText,
  TOOLCRAFT_JOURNAL_VERSION,
  writeJournalJson,
} from "./toolcraft-journal-files.mjs";

function describeError(error, depth = 0) {
  if (depth > 5) return { message: "Further error causes omitted." };
  return {
    name: error?.name ?? "Error",
    message: String(error?.message ?? error).slice(0, 16_384),
    stack:
      typeof error?.stack === "string" ? error.stack.slice(0, 32_768) : null,
    code:
      typeof error?.code === "string" || typeof error?.code === "number"
        ? error.code
        : null,
    signal: error?.signal ?? null,
    ...(error?.cause === undefined
      ? {}
      : { cause: describeError(error.cause, depth + 1) }),
    ...(error instanceof AggregateError
      ? {
          errors: [...error.errors]
            .slice(0, 10)
            .map((child) => describeError(child, depth + 1)),
        }
      : {}),
  };
}

export async function readJournalRun(projectDir, runId) {
  const { runs } = getJournalPaths(projectDir);
  const record = await readJournalJson(
    path.join(runs, requireJournalId(runId), "run.json"),
  );
  if (
    record.version !== TOOLCRAFT_JOURNAL_VERSION ||
    record.runId !== runId ||
    !["running", "passed", "failed", "interrupted"].includes(record.status)
  )
    throw new Error("Malformed journal run metadata.");
  return record;
}

export async function listJournalRuns(projectDir) {
  const { runs } = getJournalPaths(projectDir);
  let entries;
  try {
    entries = await readdir(runs, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const records = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => readJournalRun(projectDir, entry.name)),
  );
  return records.sort(
    (a, b) =>
      b.startedAt.localeCompare(a.startedAt) || a.runId.localeCompare(b.runId),
  );
}

export async function withJournalRun(
  {
    projectDir,
    command,
    arguments_: args = [],
    changeId = null,
    retryOf = null,
    kind = "command",
    textLimitBytes = 16 * 1024 * 1024,
  },
  operation,
) {
  const paths = getJournalPaths(projectDir);
  requireJournalText(command, "command");
  if (
    !Array.isArray(args) ||
    args.some((argument) => typeof argument !== "string")
  )
    throw new Error("Journal arguments must be strings.");
  if (!Number.isSafeInteger(textLimitBytes) || textLimitBytes < 0)
    throw new Error("Invalid journal text limit.");
  await requireJournalDirectory(paths.project, paths.runs);
  const runId = randomUUID();
  const directory = path.join(paths.runs, runId);
  const pendingDirectory = path.join(paths.runs, `.pending-${runId}`);
  await mkdir(pendingDirectory);
  const manifestPath = path.join(directory, "run.json");
  let record = {
    version: TOOLCRAFT_JOURNAL_VERSION,
    runId,
    changeId,
    retryOf,
    kind,
    projectDir: paths.project,
    command,
    arguments: args,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: "running",
    stage: "preflight",
    linkage: changeId === null ? "unlinked" : "pending",
    sourceBefore: null,
    sourceAfter: null,
    sourceChanged: null,
    exitCode: null,
    signal: null,
    error: null,
    outputBytesOmitted: 0,
  };
  await writeJournalJson(path.join(pendingDirectory, "run.json"), record, {
    exclusive: true,
  });
  const fd = openSync(path.join(pendingDirectory, "events.jsonl"), "wx", 0o600);
  try {
    await rename(pendingDirectory, directory);
  } catch (error) {
    closeSync(fd);
    throw error;
  }
  let sequence = 0,
    textBytes = 0;
  let sourceFiles = [];
  const event = (type, details) =>
    appendFileSync(
      fd,
      `${JSON.stringify({ sequence: ++sequence, receivedAt: new Date().toISOString(), type, ...details })}\n`,
    );
  const save = async (fields) => {
    record = { ...record, ...fields };
    await writeJournalJson(manifestPath, record);
  };
  const run = {
    runId,
    async stage(name, details = {}) {
      event("stage", { name, details });
      await save({ stage: name });
    },
    async source(files) {
      sourceFiles = files;
      await save({
        sourceBefore: await collectJournalSource(paths.project, files),
      });
    },
    output(stream, text) {
      const bytes = Buffer.byteLength(text);
      if (textBytes + bytes > textLimitBytes) {
        record.outputBytesOmitted += bytes;
        return;
      }
      textBytes += bytes;
      event("output", { stream, text });
    },
  };
  try {
    event("started", { command, arguments: args, changeId, retryOf });
    if (changeId !== null) {
      const change = await readJournalChange(paths.project, changeId);
      await save({ linkage: "linked", changeRevision: change.revision });
    }
    if (retryOf !== null) {
      const previous = await readJournalRun(paths.project, retryOf);
      if (previous.changeId !== changeId)
        throw new Error("A retry must belong to the same change.");
      if (previous.status === "passed")
        throw new Error("A passed run cannot be retried as a failed attempt.");
    }
    await run.source([]);
    const result = await operation(run);
    const sourceAfter = await collectJournalSource(paths.project, sourceFiles);
    event("finished", {
      status: "passed",
      outputBytesOmitted: record.outputBytesOmitted,
    });
    await save({
      status: "passed",
      completedAt: new Date().toISOString(),
      exitCode: 0,
      sourceAfter,
      sourceChanged:
        sourceAfter.fingerprint !== record.sourceBefore.fingerprint,
    });
    return result;
  } catch (error) {
    const interrupted = Boolean(error?.signal) || error?.name === "AbortError";
    try {
      await save({
        status: interrupted ? "interrupted" : "failed",
        completedAt: new Date().toISOString(),
        exitCode: typeof error?.code === "number" ? error.code : null,
        signal: error?.signal ?? null,
        error: describeError(error),
      });
      event("finished", {
        status: record.status,
        error: record.error,
        outputBytesOmitted: record.outputBytesOmitted,
      });
    } catch (journalError) {
      throw new AggregateError(
        [error, journalError],
        "Operation failed and its journal could not be finalized.",
        { cause: error },
      );
    }
    throw error;
  } finally {
    closeSync(fd);
  }
}
