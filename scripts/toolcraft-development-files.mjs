import fs from "node:fs/promises";
import path from "node:path";
import {
  developmentFileGraceMs, disposableDevelopmentRoots,
  getMisplacedDevelopmentFileReason, isDevelopmentFileExcluded,
} from "./toolcraft-development-file-policy.mjs";

async function existingDirectory(root, relative) {
  let current = root;
  for (const part of relative.split("/").filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = await fs.lstat(current); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Development directory must not be a link or special file: ${relative}`);
  }
  return current;
}

export async function findMisplacedDevelopmentFiles(projectRoot) {
  const root = await fs.realpath(projectRoot);
  const findings = [];
  async function visit(relative) {
    for (const child of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
      const file = relative ? `${relative}/${child.name}` : child.name;
      if (isDevelopmentFileExcluded(file)) continue;
      if (child.isSymbolicLink()) {
        findings.push({ path: file, reason: "Cannot inspect a symbolic link as project content." });
      } else if (child.isDirectory()) await visit(file);
      else {
        const reason = getMisplacedDevelopmentFileReason(file);
        if (reason) findings.push({ path: file, reason });
      }
    }
  }
  await visit("");
  return findings.sort((a, b) => a.path.localeCompare(b.path));
}

function identity(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(":");
}

// Only these dedicated disposable roots participate. Journals, receipts,
// defaults cleanup records and reference transaction scratch are unreachable.
export async function cleanDevelopmentFiles(projectRoot, { apply = false, now = Date.now() } = {}) {
  const root = await fs.realpath(projectRoot);
  const candidates = [];
  async function visit(relative) {
    const directory = await existingDirectory(root, relative);
    if (!directory) return;
    for (const child of await fs.readdir(directory, { withFileTypes: true })) {
      const file = `${relative}/${child.name}`;
      if (child.isDirectory()) await visit(file);
      else {
        const stat = await fs.lstat(path.join(root, file));
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Refusing to clean a link or special file: ${file}`);
        if (Math.max(stat.mtimeMs, stat.ctimeMs) <= now - developmentFileGraceMs) {
          candidates.push({ path: file, bytes: stat.size, identity: identity(stat) });
        }
      }
    }
  }
  // Inspect everything before deleting anything, so a bad path fails closed.
  for (const relative of disposableDevelopmentRoots) await visit(relative);
  const result = { apply, eligibleBytes: 0, files: [] };
  for (const candidate of candidates.sort((a, b) => a.path.localeCompare(b.path))) {
    let removed = false;
    if (apply && await existingDirectory(root, path.posix.dirname(candidate.path))) {
      const file = path.join(root, candidate.path);
      const stat = await fs.lstat(file).catch(error => { if (error.code !== "ENOENT") throw error; return null; });
      if (stat?.isFile() && !stat.isSymbolicLink() && identity(stat) === candidate.identity) {
        await fs.unlink(file);
        removed = true;
      }
    }
    result.eligibleBytes += candidate.bytes;
    result.files.push({ path: candidate.path, bytes: candidate.bytes, removed });
  }
  return result;
}
