import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function collectJournalSource(projectDir, files = []) {
  const root = await realpath(projectDir);
  const inputPaths = [
    ...new Set([
      "package.json",
      "src/app/app-schema.ts",
      "src/app/app-composition.tsx",
      ...files,
    ]),
  ].sort();
  const inputs = [];
  for (const file of inputPaths) {
    const absolute = path.resolve(root, file);
    const relative = path.relative(root, absolute);
    if (
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    )
      continue;
    try {
      const resolved = await realpath(absolute);
      if (!resolved.startsWith(`${root}${path.sep}`)) continue;
      inputs.push({
        path: relative.replaceAll(path.sep, "/"),
        sha256: digest(await readFile(resolved)),
      });
    } catch (error) {
      inputs.push({
        path: relative.replaceAll(path.sep, "/"),
        unavailable: error.code ?? error.message,
      });
    }
  }
  let git;
  try {
    const options = {
      cwd: root,
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 256 * 1024,
    };
    const [head, status, top] = await Promise.all([
      execute("git", ["rev-parse", "HEAD"], options),
      execute(
        "git",
        ["status", "--porcelain=v1", "--untracked-files=normal", "--", "."],
        options,
      ),
      execute("git", ["rev-parse", "--show-toplevel"], options),
    ]);
    git = {
      head: head.stdout.trim(),
      root: top.stdout.trim(),
      dirty: Boolean(status.stdout),
      status: status.stdout,
    };
  } catch (error) {
    git = { unavailable: error.code ?? error.message };
  }
  return {
    coverage: "selected-files-and-product-entrypoints",
    complete: false,
    git,
    inputs,
    fingerprint: digest(JSON.stringify(inputs)),
  };
}
