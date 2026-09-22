import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createToolcraftMotionReferenceStudy,
} from "./create-toolcraft-motion-reference-study.mjs";
import {
  requireToolcraftMotionReferenceStudiesRoot,
  resolveToolcraftMotionReferenceRoots,
} from "./toolcraft-motion-reference-roots.mjs";

async function exists(target) {
  return fs.lstat(target).then(() => true, (error) => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
}

test("rejects every reference-studies ancestor symlink before any mutation",
  async (context) => {
    for (const linkedPath of ["src", "src/app", "src/app/reference-studies"]) {
      await context.test(linkedPath, async (subtest) => {
        const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "motion-root-safety-"));
        subtest.after(() => fs.rm(fixture, { force: true, recursive: true }));
        const rootDir = path.join(fixture, "root");
        const outside = path.join(fixture, "outside");
        const link = path.join(rootDir, linkedPath);
        const outsideTarget = path.join(outside, ...linkedPath.split("/"));
        await fs.mkdir(path.dirname(link), { recursive: true });
        await fs.mkdir(outsideTarget, { recursive: true });
        try {
          await fs.symlink(outsideTarget, link, "dir");
        } catch (error) {
          if (["EACCES", "ENOSYS", "EPERM"].includes(error?.code)) {
            subtest.skip(`symbolic links are unavailable: ${error.code}`);
            return;
          }
          throw error;
        }
        const before = await fs.readdir(outside, { recursive: true });

        await assert.rejects(() => createToolcraftMotionReferenceStudy({
          kind: "video",
          source: path.join(rootDir, "reference.mkv"),
        }, {
          execute: async ({ binary }) => ({ stdout: `${binary} version 8.0` }),
          rootDir,
        }), /root|resource|outside|boundary/iu);

        assert.deepEqual(await fs.readdir(outside, { recursive: true }), before);
        assert.equal(await exists(path.join(rootDir, ".toolcraft")), false);
      });
    }
  });

test("resolves a nonexistent canonical studies root without creating it",
  async (context) => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "motion-root-create-"));
    context.after(() => fs.rm(rootDir, { force: true, recursive: true }));
    const expectedRoot = path.join(rootDir, "src", "app", "reference-studies");

    assert.equal(
      resolveToolcraftMotionReferenceRoots(rootDir).referenceStudiesRoot,
      expectedRoot,
    );
    assert.equal(await exists(expectedRoot), false);
  });

test("rejects a lexically noncanonical studies root containing parent traversal",
  async (context) => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "motion-root-parent-"));
    context.after(() => fs.rm(rootDir, { force: true, recursive: true }));
    const expectedRoot = path.join(rootDir, "src", "app", "reference-studies");
    await fs.mkdir(expectedRoot, { recursive: true });

    await assert.rejects(() => requireToolcraftMotionReferenceStudiesRoot({
      referenceStudiesRoot:
        `${rootDir}/src/app/../app/reference-studies`,
      rootDir,
    }), /canonical app-owned directory/iu);
  });
