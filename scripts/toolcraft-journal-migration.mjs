import { createHash } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createJournalChange,
  readJournalChange,
} from "./toolcraft-journal-changes.mjs";
import {
  getJournalPaths,
  requireJournalDirectory,
  writeJournalJson,
} from "./toolcraft-journal-files.mjs";
import { getToolcraftWorklogEntries } from "./toolcraft-worklog-decision-trail.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const field = (body, name) =>
  new RegExp(`^-[ \\t]*${name}:[ \\t]*(.*)$`, "imu").exec(body)?.[1] ?? null;

function importedId(sourceHash, startLine, endLine) {
  const h = sha256(`${sourceHash}:${startLine}:${endLine}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export async function importJournalWorklog(projectDir) {
  const paths = getJournalPaths(projectDir);
  const worklog = path.join(paths.project, "docs/toolcraft/agent-worklog.md");
  const bytes = await readFile(worklog);
  const sourceHash = sha256(bytes);
  const source = bytes.toString("utf8");
  const entries = getToolcraftWorklogEntries(source);
  if (!entries.length) throw new Error("No worklog entries to import.");
  await requireJournalDirectory(paths.project, paths.archive);
  const lock = path.join(paths.archive, "import.lock");
  await writeFile(lock, `${process.pid}\n`, { flag: "wx", mode: 0o600 });
  try {
    const archive = `docs/agent-journal/archive/${sourceHash}.md`;
    const archivePath = path.join(paths.project, archive);
    try {
      await writeFile(archivePath, bytes, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (!(await readFile(archivePath)).equals(bytes))
        throw new Error("Existing worklog archive has different bytes.");
    }
    const lines = source.split(/\r?\n/u);
    const records = [];
    for (const entry of entries) {
      const changeId = importedId(sourceHash, entry.startLine, entry.endLine);
      const legacy = {
        archive,
        sourceHash,
        startLine: entry.startLine,
        endLine: entry.endLine,
        occurredAt: null,
        text: lines.slice(entry.startLine - 1, entry.endLine).join("\n"),
      };
      let record;
      try {
        record = await createJournalChange(
          paths.project,
          {
            title: entry.heading,
            request: { text: field(entry.body, "Request"), messageRef: null },
            decision:
              field(entry.body, "Decision") ??
              field(entry.body, "Root cause and decision"),
            result: field(entry.body, "User-visible result"),
            checks: [
              field(entry.body, "Verification"),
              field(entry.body, "Observed evidence"),
            ].filter(Boolean),
            risks: [
              field(entry.body, "Risks"),
              "Original event time, source revision and message reference are unknown.",
            ].filter(Boolean),
            status: "imported",
          },
          { changeId, legacy },
        );
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        record = await readJournalChange(paths.project, changeId);
        if (JSON.stringify(record.legacy) !== JSON.stringify(legacy))
          throw new Error(
            "Imported change provenance differs from its source.",
          );
      }
      records.push(record);
    }
    const result = {
      version: 1,
      importedAt: new Date().toISOString(),
      sourceHash,
      archive,
      chronology:
        "unknown; source order is preserved, not inferred as time order",
      changes: records.map(({ changeId, title, legacy }) => ({
        changeId,
        title,
        startLine: legacy.startLine,
        endLine: legacy.endLine,
      })),
    };
    await writeJournalJson(
      path.join(paths.archive, `${sourceHash}.index.json`),
      result,
    );
    const index = [
      "# Agent text journal",
      "",
      `${records.length} historical entries imported from [the original worklog](../toolcraft/agent-worklog.md).`,
      "The original worklog remains unchanged. [Exact archived text](./archive/" +
        sourceHash +
        ".md).",
      "",
      "Original timestamps, message references and source revisions are unknown. Entries below follow source order; duplicate numbers are not merged.",
      "",
      "Read a change: `node scripts/toolcraft-journal.mjs show --change <id>`. On an older app, use the upstream script with `--project <app-path>`.",
      "List recent work: `node scripts/toolcraft-journal.mjs list`. Text attempts live under `.toolcraft/journal/runs`.",
      "",
      "## Imported entries",
      "",
      ...records.map(
        ({ changeId, title, legacy }) =>
          `- [${title.replaceAll("[", "\\[").replaceAll("]", "\\]")}](./changes/${changeId}.json) — source lines ${legacy.startLine}–${legacy.endLine}`,
      ),
      "",
    ].join("\n");
    await writeFile(
      path.join(paths.project, "docs/agent-journal/README.md"),
      index,
    );
    return result;
  } finally {
    await unlink(lock);
  }
}
