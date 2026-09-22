import { randomUUID } from "node:crypto";
import { readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getJournalPaths,
  readJournalJson,
  requireJournalDirectory,
  requireJournalId,
  requireJournalStrings,
  requireJournalText,
  TOOLCRAFT_JOURNAL_VERSION,
  writeJournalJson,
} from "./toolcraft-journal-files.mjs";

function changeFields(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Journal change must be an object.");
  const status = input.status ?? "open";
  if (!["open", "complete", "imported"].includes(status))
    throw new Error("Unknown journal change status.");
  return {
    title: requireJournalText(input.title, "title"),
    request: {
      text: requireJournalText(input.request?.text ?? null, "request.text", {
        optional: status === "imported",
      }),
      messageRef: requireJournalText(
        input.request?.messageRef ?? null,
        "request.messageRef",
        { optional: true },
      ),
    },
    owners: requireJournalStrings(input.owners ?? [], "owners"),
    decision: requireJournalText(input.decision ?? null, "decision", {
      optional: true,
    }),
    result: requireJournalText(input.result ?? null, "result", {
      optional: true,
    }),
    checks: requireJournalStrings(input.checks ?? [], "checks"),
    risks: requireJournalStrings(input.risks ?? [], "risks"),
    status,
  };
}

export async function createJournalChange(
  projectDir,
  input,
  { changeId = randomUUID(), legacy = null } = {},
) {
  const fields = changeFields(input);
  const { changes } = getJournalPaths(projectDir);
  await requireJournalDirectory(projectDir, changes);
  const now = new Date().toISOString();
  const record = {
    version: TOOLCRAFT_JOURNAL_VERSION,
    changeId: requireJournalId(changeId),
    revision: 1,
    createdAt: now,
    updatedAt: now,
    legacy,
    ...fields,
  };
  await writeJournalJson(
    path.join(changes, `${record.changeId}.json`),
    record,
    { exclusive: true },
  );
  return record;
}

export async function readJournalChange(projectDir, changeId, revision) {
  const { changes } = getJournalPaths(projectDir);
  requireJournalId(changeId);
  let record = await readJournalJson(path.join(changes, `${changeId}.json`));
  if (revision !== undefined && record.revision !== revision) {
    if (!Number.isSafeInteger(revision) || revision < 1)
      throw new Error("Invalid journal change revision.");
    record = await readJournalJson(
      path.join(changes, "revisions", changeId, `${revision}.json`),
    );
  }
  if (
    record.version !== TOOLCRAFT_JOURNAL_VERSION ||
    record.changeId !== changeId ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 1 ||
    (revision !== undefined && record.revision !== revision)
  )
    throw new Error("Malformed journal change metadata.");
  changeFields(record);
  return record;
}

export async function updateJournalChange(
  projectDir,
  changeId,
  revision,
  input,
) {
  const { changes } = getJournalPaths(projectDir);
  requireJournalId(changeId);
  await requireJournalDirectory(projectDir, changes);
  const lock = path.join(changes, `${changeId}.lock`);
  await writeFile(lock, `${process.pid}\n`, { flag: "wx", mode: 0o600 });
  try {
    const previous = await readJournalChange(projectDir, changeId);
    if (previous.revision !== revision)
      throw new Error(
        "Journal change revision conflict; read the current change before updating.",
      );
    const next = {
      ...previous,
      ...changeFields(input),
      revision: revision + 1,
      updatedAt: new Date().toISOString(),
    };
    const history = path.join(changes, "revisions", changeId);
    await requireJournalDirectory(projectDir, history);
    const archived = path.join(history, `${revision}.json`);
    try {
      await writeJournalJson(archived, previous, { exclusive: true });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (
        JSON.stringify(await readJournalJson(archived)) !==
        JSON.stringify(previous)
      )
        throw new Error(
          "Journal revision archive differs from the current change.",
        );
    }
    await writeJournalJson(path.join(changes, `${changeId}.json`), next);
    return next;
  } finally {
    await unlink(lock);
  }
}

export async function listJournalChanges(projectDir) {
  const { changes } = getJournalPaths(projectDir);
  let names;
  try {
    names = await readdir(changes);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const records = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map((name) => readJournalChange(projectDir, name.slice(0, -5))),
  );
  return records.sort(
    (a, b) =>
      b.updatedAt.localeCompare(a.updatedAt) ||
      a.changeId.localeCompare(b.changeId),
  );
}
