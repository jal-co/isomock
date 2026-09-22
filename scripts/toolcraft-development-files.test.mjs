import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cleanDevelopmentFiles, findMisplacedDevelopmentFiles } from "./toolcraft-development-files.mjs";
import { developmentFileGraceMs, isDevelopmentFileExcluded } from "./toolcraft-development-file-policy.mjs";

async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "development-files-"));
  const write = async (relative, text = relative) => {
    const file = path.join(root, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text);
  };
  try { await run({ root, write }); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}

test("reports misplaced diagnostics without treating assets, fixtures or reference evidence as trash", () => fixture(async ({ root, write }) => {
  const misplaced = ["screenshot.png", "public/debug.png", "docs/shot.jpg", "src/temp.tmp"];
  const owned = ["public/logo.png", "docs/assets/screenshot.png", "e2e/fixtures/trace.zip", "src/app/reference-studies/id/contact-sheet.png", ".toolcraft/browser-artifacts/screenshot.png", ".toolcraft/journal/runs/id/events.jsonl"];
  await Promise.all([...misplaced, ...owned].map(file => write(file)));
  assert.deepEqual((await findMisplacedDevelopmentFiles(root)).map(file => file.path), [...misplaced].sort());
  for (const file of [...misplaced, ...owned]) assert.equal(await fs.readFile(path.join(root, file), "utf8"), file);
}));

test("Git and template transient paths have one portable classification", () => {
  for (const file of [".env", ".env.local", ".toolcraft/a", ".playwright-mcp/a", ".vite/a", ".output/a", "dist/a", "test-results/trace.zip", "logs/a", "a.log", "tsconfig.tsbuildinfo", ".agents/skills/x"]) {
    assert.equal(isDevelopmentFileExcluded(file), true, file);
    assert.equal(isDevelopmentFileExcluded(file.replaceAll("/", "\\")), true, file);
  }
  for (const file of [".env.example", "public/logo.png", "src/build/mesh.ts", "docs/agent-journal/changes/id.json", "src/app/reference-studies/id/evidence.json"]) assert.equal(isDevelopmentFileExcluded(file), false, file);
});

test("cleanup previews and then removes only old disposable files, preserving every durable owner", () => fixture(async ({ root, write }) => {
  const disposable = [".toolcraft/browser-artifacts/a/shot.png", ".toolcraft/scratch/upload.csv"];
  const durable = [".toolcraft/journal/runs/id/events.jsonl", ".toolcraft/initial-delivery.json", ".toolcraft/default-resource-cleanup.json", ".toolcraft/tmp/study.transaction/journal.json", "public/toolcraft-defaults/files/asset.bin", "docs/agent-journal/changes/id.json", "src/app/reference-studies/id/contact-sheet.png"];
  await Promise.all([...disposable, ...durable].map(file => write(file)));
  assert.deepEqual((await cleanDevelopmentFiles(root, { apply: true })).files, [], "Fresh work is retained");
  const now = Date.now() + developmentFileGraceMs + 1000;
  const preview = await cleanDevelopmentFiles(root, { now });
  assert.deepEqual(preview.files.map(file => file.path), disposable);
  assert.ok(preview.files.every(file => !file.removed));
  for (const file of disposable) await fs.access(path.join(root, file));
  const applied = await cleanDevelopmentFiles(root, { apply: true, now });
  assert.ok(applied.files.every(file => file.removed));
  for (const file of disposable) await assert.rejects(fs.access(path.join(root, file)), { code: "ENOENT" });
  for (const file of durable) assert.equal(await fs.readFile(path.join(root, file), "utf8"), file);
}));

for (const linkPath of [".toolcraft", ".toolcraft/scratch", ".toolcraft/scratch/nested"]) {
  test(`cleanup refuses symlink traversal at ${linkPath}`, () => fixture(async ({ root, write }) => {
    await write("outside/keep.png");
    await fs.mkdir(path.dirname(path.join(root, linkPath)), { recursive: true });
    await fs.symlink(path.join(root, "outside"), path.join(root, linkPath), "dir");
    await assert.rejects(cleanDevelopmentFiles(root, { apply: true, now: Date.now() + 2 * developmentFileGraceMs }), /link|special file/);
    assert.equal(await fs.readFile(path.join(root, "outside/keep.png"), "utf8"), "outside/keep.png");
  }));
}

test("a file symlink aborts the entire cleanup before any deletion", () => fixture(async ({ root, write }) => {
  await write(".toolcraft/browser-artifacts/old.png");
  await write("outside/keep.png");
  await fs.mkdir(path.join(root, ".toolcraft/scratch"));
  await fs.symlink(path.join(root, "outside/keep.png"), path.join(root, ".toolcraft/scratch/link.png"));
  await assert.rejects(cleanDevelopmentFiles(root, { apply: true, now: Date.now() + 2 * developmentFileGraceMs }), /link|special file/);
  await fs.access(path.join(root, ".toolcraft/browser-artifacts/old.png"));
  await fs.access(path.join(root, "outside/keep.png"));
}));
