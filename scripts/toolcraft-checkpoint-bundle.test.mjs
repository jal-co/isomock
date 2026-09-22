import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createToolcraftCheckpointBundle,
  getToolcraftCheckpointBundleShapeError,
  readToolcraftCheckpointBundle,
  updateToolcraftCheckpointBundle,
  writeToolcraftCheckpointBundle,
} from "./toolcraft-checkpoint-bundle.mjs";
import {
  getToolcraftCheckpointBundlePath,
  getToolcraftObsoleteCheckpointReceiptPaths,
} from "./toolcraft-checkpoint-paths.mjs";
import {
  collectToolcraftVerificationInputs,
} from "./toolcraft-verification-inventory.mjs";

async function createFixture() {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-checkpoint-bundle-"),
  );
  return rootDir;
}

test("writes and reads one canonical checkpoint bundle", async (t) => {
  const rootDir = await createFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const bundle = createToolcraftCheckpointBundle({
    delivery: { kind: "delivery" },
  });

  await writeToolcraftCheckpointBundle({ bundle, rootDir });

  assert.deepEqual(await readToolcraftCheckpointBundle(rootDir), {
    bundle,
    source: "canonical",
  });
  assert.deepEqual(
    JSON.parse(
      await fs.readFile(getToolcraftCheckpointBundlePath(rootDir), "utf8"),
    ),
    bundle,
  );
});

test("reports a missing checkpoint when no checkpoint files exist", async (t) => {
  const rootDir = await createFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));

  assert.deepEqual(await readToolcraftCheckpointBundle(rootDir), {
    missing: true,
  });
});

test("rejects malformed or extended bundle envelopes", () => {
  const bundle = createToolcraftCheckpointBundle({
    delivery: { kind: "delivery" },
  });
  assert.equal(getToolcraftCheckpointBundleShapeError(bundle), undefined);
  assert.match(
    getToolcraftCheckpointBundleShapeError({ ...bundle, extra: true }),
    /malformed/iu,
  );
  assert.match(
    getToolcraftCheckpointBundleShapeError({ ...bundle, delivery: null }),
    /malformed/iu,
  );
});

test("rejects every obsolete split filename without parsing its contents", async (t) => {
  const rootDir = await createFixture();
  const obsoletePaths = Object.values(
    getToolcraftObsoleteCheckpointReceiptPaths(rootDir),
  );
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));

  for (const obsoletePath of obsoletePaths) {
    await fs.mkdir(path.dirname(obsoletePath), { recursive: true });
    await fs.writeFile(obsoletePath, "{not-json");
    assert.deepEqual(await readToolcraftCheckpointBundle(rootDir), {
      error:
        "Toolcraft verification checkpoint uses an unsupported old split-file layout.",
    });
    await fs.rm(obsoletePath);
  }
});

test("rejects dangling symlinks with obsolete split filenames before checkpoint work", async (t) => {
  const rootDir = await createFixture();
  const obsoletePaths = Object.values(
    getToolcraftObsoleteCheckpointReceiptPaths(rootDir),
  );
  const canonicalPath = getToolcraftCheckpointBundlePath(rootDir);
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));

  for (const obsoletePath of obsoletePaths) {
    await fs.mkdir(path.dirname(obsoletePath), { recursive: true });
    await fs.symlink(
      path.join(rootDir, "missing-obsolete-checkpoint-target"),
      obsoletePath,
    );
    assert.deepEqual(await readToolcraftCheckpointBundle(rootDir), {
      error:
        "Toolcraft verification checkpoint uses an unsupported old split-file layout.",
    });

    let commitPreconditions = 0;
    let durabilityBarriers = 0;
    await assert.rejects(
      writeToolcraftCheckpointBundle({
        assertCommitPrecondition: async () => {
          commitPreconditions += 1;
        },
        bundle: createToolcraftCheckpointBundle({
          delivery: { kind: "current" },
        }),
        observeDurabilityBarrier: async () => {
          durabilityBarriers += 1;
        },
        rootDir,
      }),
      /unsupported old split-file layout/iu,
    );
    assert.equal(commitPreconditions, 0);
    assert.equal(durabilityBarriers, 0);
    await assert.rejects(fs.lstat(canonicalPath), /ENOENT/iu);
    await fs.rm(obsoletePath);
  }
});

test("rejects canonical plus obsolete files as an ambiguous unsupported layout", async (t) => {
  const rootDir = await createFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const canonical = createToolcraftCheckpointBundle({
    delivery: { kind: "canonical-delivery" },
  });
  await writeToolcraftCheckpointBundle({ bundle: canonical, rootDir });
  const obsoletePath =
    getToolcraftObsoleteCheckpointReceiptPaths(rootDir).delivery;
  await fs.writeFile(obsoletePath, "{not-json");

  assert.deepEqual(await readToolcraftCheckpointBundle(rootDir), {
    error:
      "Toolcraft verification checkpoint uses an ambiguous unsupported layout: checkpoint.json exists with obsolete split files.",
  });
});

test("rejects a dangling canonical checkpoint entry before checkpoint work", async (t) => {
  const rootDir = await createFixture();
  const canonicalPath = getToolcraftCheckpointBundlePath(rootDir);
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  await fs.mkdir(path.dirname(canonicalPath), { recursive: true });
  await fs.symlink(
    path.join(rootDir, "missing-canonical-checkpoint-target"),
    canonicalPath,
  );

  assert.deepEqual(await readToolcraftCheckpointBundle(rootDir), {
    error:
      "Toolcraft verification checkpoint bundle is malformed or unreadable.",
  });

  let commitPreconditions = 0;
  let durabilityBarriers = 0;
  await assert.rejects(
    writeToolcraftCheckpointBundle({
      assertCommitPrecondition: async () => {
        commitPreconditions += 1;
      },
      bundle: createToolcraftCheckpointBundle({
        delivery: { kind: "current" },
      }),
      observeDurabilityBarrier: async () => {
        durabilityBarriers += 1;
      },
      rootDir,
    }),
    /checkpoint bundle is malformed or unreadable/iu,
  );
  assert.equal(commitPreconditions, 0);
  assert.equal(durabilityBarriers, 0);
  assert.equal((await fs.lstat(canonicalPath)).isSymbolicLink(), true);
});

test("fails closed for malformed canonical JSON", async (t) => {
  const rootDir = await createFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const bundlePath = getToolcraftCheckpointBundlePath(rootDir);
  await fs.mkdir(path.dirname(bundlePath), { recursive: true });
  await fs.writeFile(bundlePath, "{");
  assert.match(
    (await readToolcraftCheckpointBundle(rootDir)).error,
    /malformed JSON/iu,
  );
});

test("refuses to write before an obsolete checkpoint layout is removed", async (t) => {
  const rootDir = await createFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const obsoletePath =
    getToolcraftObsoleteCheckpointReceiptPaths(rootDir).currentPerformance;
  await fs.mkdir(path.dirname(obsoletePath), { recursive: true });
  await fs.writeFile(obsoletePath, "old");

  await assert.rejects(
    writeToolcraftCheckpointBundle({
      bundle: createToolcraftCheckpointBundle({
        delivery: { kind: "current" },
      }),
      rootDir,
    }),
    /unsupported old split-file layout/iu,
  );
  await assert.rejects(
    fs.access(getToolcraftCheckpointBundlePath(rootDir)),
    /ENOENT/iu,
  );
});

test("near-commit source mutation rejects the update and preserves the bundle", async (t) => {
  const rootDir = await createFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const sourcePath = path.join(rootDir, "src", "app.ts");
  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.writeFile(sourcePath, "export const value = 1;\n");
  const bundle = createToolcraftCheckpointBundle({
    delivery: { kind: "delivery" },
  });
  await writeToolcraftCheckpointBundle({ bundle, rootDir });
  const bundlePath = getToolcraftCheckpointBundlePath(rootDir);
  const before = await fs.readFile(bundlePath);
  const expectedSourceInventory =
    await collectToolcraftVerificationInputs(rootDir);

  await assert.rejects(
    updateToolcraftCheckpointBundle({
      expectedSourceInventory,
      observeDurabilityBarrier: async ({ phase }) => {
        if (phase === "checkpoint-prepared") {
          await fs.writeFile(sourcePath, "export const value = 2;\n");
        }
      },
      rootDir,
      update: (current) => ({
        ...current,
        currentPerformance: { kind: "candidate" },
      }),
    }),
    /verification inputs changed immediately before checkpoint commit/iu,
  );

  assert.deepEqual(await fs.readFile(bundlePath), before);
});

test("near-commit obsolete layout mutation rejects the write and preserves the bundle", async (t) => {
  const rootDir = await createFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const original = createToolcraftCheckpointBundle({
    delivery: { kind: "original" },
  });
  await writeToolcraftCheckpointBundle({ bundle: original, rootDir });
  const bundlePath = getToolcraftCheckpointBundlePath(rootDir);
  const obsoletePath =
    getToolcraftObsoleteCheckpointReceiptPaths(rootDir).delivery;
  const before = await fs.readFile(bundlePath);
  const events = [];

  await assert.rejects(
    writeToolcraftCheckpointBundle({
      bundle: createToolcraftCheckpointBundle({
        delivery: { kind: "replacement" },
      }),
      observeDurabilityBarrier: async ({ phase }) => {
        events.push(phase);
        if (phase === "checkpoint-prepared") {
          await fs.writeFile(obsoletePath, "obsolete");
        }
      },
      rootDir,
    }),
    /ambiguous unsupported layout/iu,
  );

  assert.deepEqual(events, ["checkpoint-prepared"]);
  assert.deepEqual(await fs.readFile(bundlePath), before);
  assert.equal(await fs.readFile(obsoletePath, "utf8"), "obsolete");
  assert.deepEqual(
    (await fs.readdir(path.dirname(bundlePath))).filter((entry) =>
      /^\.checkpoint-.*\.tmp$/u.test(entry),
    ),
    [],
  );
});
