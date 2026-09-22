import { randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export const TOOLCRAFT_JOURNAL_VERSION = 1;

export function requireJournalId(id) {
  if (
    typeof id !== "string" ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(id)
  ) {
    throw new Error("Journal IDs must be UUIDs.");
  }
  return id;
}

export function getJournalPaths(projectDir) {
  const project = path.resolve(projectDir);
  return {
    project,
    changes: path.join(project, "docs/agent-journal/changes"),
    archive: path.join(project, "docs/agent-journal/archive"),
    runs: path.join(project, ".toolcraft/journal/runs"),
  };
}

export async function requireJournalDirectory(projectDir, directory) {
  const root = await realpath(projectDir);
  const relative = path.relative(
    path.resolve(projectDir),
    path.resolve(directory),
  );
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Journal directory must remain within its project.");
  }
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      await mkdir(current);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error(
        "Journal directories must be regular project directories, not symlinks.",
      );
  }
  return current;
}

export async function readJournalJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

export async function writeJournalJson(
  file,
  value,
  { exclusive = false } = {},
) {
  const source = `${JSON.stringify(value, null, 2)}\n`;
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, source, { flag: "wx", mode: 0o600 });
    if (exclusive) await link(temporary, file);
    else await rename(temporary, file);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

export function requireJournalText(value, field, { optional = false } = {}) {
  if (optional && value === null) return null;
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Journal ${field} must be nonempty text.`);
  return value;
}

export function requireJournalStrings(value, field) {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  ) {
    throw new Error(`Journal ${field} must be a text array.`);
  }
  return [...value];
}
