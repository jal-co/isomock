import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  publishToolcraftMotionReferenceJournaledGroup,
  recoverToolcraftMotionReferencePublication,
} from "./toolcraft-motion-reference-publication-journal.mjs";
import {
  getToolcraftMotionReferenceBackupPath,
  getToolcraftMotionReferencePublicationJournalPath,
} from "./toolcraft-motion-reference-publication-journal-schema.mjs";

const sourceIdentity = `motion-reference-v1-${"a".repeat(64)}`;
const noHeartbeat = async () => {};
const backupPath = (transactionRoot, finalDirectory) =>
  getToolcraftMotionReferenceBackupPath(transactionRoot, finalDirectory);

async function exists(target) {
  return fs.stat(target).then(() => true, (error) => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
}

test("uses a stable journal sibling and atomic temp-to-journal writes around every rename",
  async (context) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "motion-journal-"));
    context.after(() => fs.rm(root, { force: true, recursive: true }));
    const lockDirectory = path.join(root, "source.lock");
    const journalPath = getToolcraftMotionReferencePublicationJournalPath(lockDirectory);
    const transactionRoot = path.join(root, "transaction");
    const finalDirectory = path.join(root, "final");
    const stagingDirectory = path.join(
      root, `${sourceIdentity}.staging`, path.basename(finalDirectory),
    );
    await fs.mkdir(finalDirectory);
    await fs.writeFile(path.join(finalDirectory, "version"), "old");
    await fs.mkdir(stagingDirectory, { recursive: true });
    await fs.mkdir(transactionRoot);
    await fs.writeFile(path.join(stagingDirectory, "version"), "new");
    const renames = [];
    const events = [];
    const heartbeat = async () => { events.push("heartbeat"); };
    const fileSystem = {
      ...fs,
      rm: async (target, options) => {
        if (target === journalPath || target.startsWith(transactionRoot)) {
          events.push("mutation");
        }
        return fs.rm(target, options);
      },
      rename: async (from, to) => {
        renames.push([from, to]);
        if (to === journalPath || from === finalDirectory || from === stagingDirectory) {
          events.push("mutation");
        }
        return fs.rename(from, to);
      },
      writeFile: async (target, ...args) => {
        if (target.startsWith(`${journalPath}.tmp-`)) events.push("mutation");
        return fs.writeFile(target, ...args);
      },
    };
    const result = await publishToolcraftMotionReferenceJournaledGroup({
      fileSystem,
      heartbeat,
      journalPath,
      pairs: [{ finalDirectory, stagingDirectory }],
      sourceIdentity,
      token: "journal-token",
      transactionRoot,
    });
    assert.equal(journalPath, `${lockDirectory}.publication.json`);
    assert.equal(result.committed, true);
    const publicationRename = renames.findIndex(([from]) => from === stagingDirectory);
    assert.ok(publicationRename > 0);
    assert.ok(renames.slice(0, publicationRename).some(([from, to]) =>
      from.startsWith(`${journalPath}.tmp-`) && to === journalPath));
    assert.ok(renames.filter(([from, to]) =>
      from.startsWith(`${journalPath}.tmp-`) && to === journalPath).length >= 4);
    for (const [index, event] of events.entries()) if (event === "mutation") {
      assert.equal(events[index - 1], "heartbeat");
      assert.equal(events[index + 1], "heartbeat");
    }
    assert.equal(await fs.readFile(path.join(finalDirectory, "version"), "utf8"), "new");
    assert.equal(await exists(journalPath), false);
  });

test("rejects noncanonical journal bytes without guessing filesystem state", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "motion-journal-"));
  context.after(() => fs.rm(root, { force: true, recursive: true }));
  const lockDirectory = path.join(root, "source.lock");
  const journalPath = getToolcraftMotionReferencePublicationJournalPath(lockDirectory);
  const transactionRoot = path.join(root, "transaction");
  const finalDirectory = path.join(root, "final");
  const stagingDirectory = path.join(
    root, `${sourceIdentity}.staging`, path.basename(finalDirectory),
  );
  await fs.mkdir(stagingDirectory, { recursive: true });
  await fs.mkdir(transactionRoot);
  await fs.writeFile(journalPath, JSON.stringify({
    operation: null,
    phase: "preparing",
    records: [{ backedUp: false,
      backupDirectory: backupPath(transactionRoot, finalDirectory), finalDirectory,
      hadOld: false, kind: "publish", published: false, stagingDirectory }],
    sourceIdentity,
    version: 4,
  }));
  await assert.rejects(() => recoverToolcraftMotionReferencePublication({
    artifactRoot: root,
    fileSystem: fs,
    heartbeat: noHeartbeat,
    journalPath,
    sourceIdentity,
    temporaryRoot: root,
    token: "journal-token",
    transactionRoot,
  }), /canonical serialization/iu);
  assert.equal(await exists(journalPath), true);
  assert.equal(await exists(finalDirectory), false);
});

test("rejects a journal backup outside its checked transaction root",
  async (context) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "motion-journal-scope-"));
    context.after(() => fs.rm(root, { force: true, recursive: true }));
    const journalPath = `${path.join(root, "source.lock")}.publication.json`;
    const transactionRoot = path.join(root, "transaction");
    const finalDirectory = path.join(root, "final");
    const stagingDirectory = path.join(
      root, `${sourceIdentity}.staging`, path.basename(finalDirectory),
    );
    await Promise.all([
      fs.mkdir(transactionRoot),
      fs.mkdir(stagingDirectory, { recursive: true }),
    ]);
    await fs.writeFile(journalPath, `${JSON.stringify({
      operation: null,
      phase: "preparing",
      records: [{
        backedUp: false,
        backupDirectory: path.join(root, "outside-backup"),
        finalDirectory,
        hadOld: false,
        kind: "publish",
        published: false,
        stagingDirectory,
      }],
      sourceIdentity,
      version: 4,
    }, null, 2)}\n`);

    await assert.rejects(() => recoverToolcraftMotionReferencePublication({
      artifactRoot: root, fileSystem: fs, heartbeat: noHeartbeat, journalPath,
      sourceIdentity, temporaryRoot: root, token: "journal-token", transactionRoot,
    }), /canonical unique absolute publication records|transaction roots/iu);
    assert.equal(await exists(stagingDirectory), true);
    assert.equal(await exists(finalDirectory), false);
  });

test("rejects a journal staging symlink before rollback mutation",
  async (context) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "motion-journal-stage-"));
    context.after(() => fs.rm(root, { force: true, recursive: true }));
    const journalPath = `${path.join(root, "source.lock")}.publication.json`;
    const transactionRoot = path.join(root, "transaction");
    const finalDirectory = path.join(root, "final");
    const backupDirectory = backupPath(transactionRoot, finalDirectory);
    const outsideParent = path.join(root, "outside");
    const linkedParent = path.join(root, "linked");
    const stagingDirectory = path.join(
      linkedParent, `${sourceIdentity}.staging`, path.basename(finalDirectory),
    );
    await Promise.all([
      fs.mkdir(finalDirectory),
      fs.mkdir(backupDirectory, { recursive: true }),
      fs.mkdir(path.join(outsideParent, `${sourceIdentity}.staging`), {
        recursive: true,
      }),
    ]);
    await Promise.all([
      fs.writeFile(path.join(finalDirectory, "version"), "new"),
      fs.writeFile(path.join(backupDirectory, "version"), "old"),
    ]);
    await fs.symlink(outsideParent, linkedParent, "dir");
    await fs.writeFile(journalPath, `${JSON.stringify({
      operation: null,
      phase: "preparing",
      records: [{
        backedUp: true,
        backupDirectory,
        finalDirectory,
        hadOld: true,
        kind: "publish",
        published: true,
        stagingDirectory,
      }],
      sourceIdentity,
      version: 4,
    }, null, 2)}\n`);

    await assert.rejects(() => recoverToolcraftMotionReferencePublication({
      artifactRoot: root, fileSystem: fs, heartbeat: noHeartbeat, journalPath,
      sourceIdentity, temporaryRoot: root, token: "journal-token", transactionRoot,
    }), /staging.*links|staging.*link/iu);
    assert.equal(await fs.readFile(path.join(finalDirectory, "version"), "utf8"),
      "new");
    assert.equal(await fs.readFile(path.join(backupDirectory, "version"), "utf8"),
      "old");
    assert.equal(await exists(journalPath), true);
  });

test("reconciles a crash after final rename but before its published-state write",
  async (context) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "motion-journal-"));
    context.after(() => fs.rm(root, { force: true, recursive: true }));
    const journalPath = `${path.join(root, "source.lock")}.publication.json`;
    const transactionRoot = path.join(root, "transaction");
    const finalDirectory = path.join(root, "final");
    const backupDirectory = backupPath(transactionRoot, finalDirectory);
    const previousStaging = path.join(
      root, "previous", `${sourceIdentity}.staging`, path.basename(finalDirectory),
    );
    await fs.mkdir(finalDirectory);
    await fs.mkdir(transactionRoot);
    await fs.writeFile(path.join(finalDirectory, "version"), "interrupted-new");
    await fs.mkdir(backupDirectory);
    await fs.writeFile(path.join(backupDirectory, "version"), "old");
    const journal = {
      operation: { index: 0, kind: "publish" },
      phase: "preparing",
      records: [{
        backedUp: true,
        backupDirectory,
        finalDirectory,
        hadOld: true,
        kind: "publish",
        published: false,
        stagingDirectory: previousStaging,
      }],
      sourceIdentity,
      version: 4,
    };
    await fs.writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
    const events = [];
    const heartbeat = async () => { events.push("heartbeat"); };
    const fileSystem = {
      ...fs,
      rename: async (from, to) => {
        if (to === journalPath ||
            (from === backupDirectory && to === finalDirectory)) {
          events.push("mutation");
        }
        return fs.rename(from, to);
      },
      rm: async (target, options) => {
        if (target === finalDirectory || target === journalPath) {
          events.push("mutation");
        }
        return fs.rm(target, options);
      },
      writeFile: async (target, ...args) => {
        if (target.startsWith(`${journalPath}.tmp-`)) events.push("mutation");
        return fs.writeFile(target, ...args);
      },
    };
    await recoverToolcraftMotionReferencePublication({
      artifactRoot: root,
      fileSystem,
      heartbeat,
      journalPath,
      sourceIdentity,
      temporaryRoot: root,
      token: "journal-token",
      transactionRoot,
    });
    assert.equal(await fs.readFile(path.join(finalDirectory, "version"), "utf8"), "old");
    assert.equal(await exists(backupDirectory), false);
    assert.equal(await exists(journalPath), false);
    for (const [index, event] of events.entries()) if (event === "mutation") {
      assert.equal(events[index - 1], "heartbeat");
      assert.equal(events[index + 1], "heartbeat");
    }
  });

test("recovers the complete old group after a crash following every rollback mutation",
  async (context) => {
    for (const crashAfter of [1, 2, 3, 4]) await context.test(
      `rollback mutation ${crashAfter}`,
      async (subtest) => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), "motion-rollback-"));
        subtest.after(() => fs.rm(root, { force: true, recursive: true }));
        const journalPath = `${path.join(root, "source.lock")}.publication.json`;
        const transactionRoot = path.join(root, "transaction");
        await fs.mkdir(transactionRoot);
        const records = [];
        const previousStagingRoot = path.join(
          root, "previous", `${sourceIdentity}.staging`,
        );
        for (const name of ["overview", "analysis"]) {
          const finalDirectory = path.join(root, name);
          const backupDirectory = backupPath(transactionRoot, finalDirectory);
          const stagingDirectory = path.join(previousStagingRoot, name);
          await fs.mkdir(finalDirectory);
          await fs.writeFile(path.join(finalDirectory, "version"), `new-${name}`);
          await fs.mkdir(backupDirectory);
          await fs.writeFile(path.join(backupDirectory, "version"), `old-${name}`);
          records.push({
            backedUp: true, backupDirectory, finalDirectory, hadOld: true,
            kind: "publish", published: true, stagingDirectory,
          });
        }
        const journal = {
          operation: null,
          phase: "preparing",
          records,
          sourceIdentity,
          version: 4,
        };
        await fs.writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
        const finals = new Set(records.map(({ finalDirectory }) => finalDirectory));
        const backups = new Set(records.map(({ backupDirectory }) => backupDirectory));
        let mutations = 0;
        const crash = () => {
          mutations += 1;
          if (mutations === crashAfter) {
            throw Object.assign(new Error(`injected rollback crash ${crashAfter}`), {
              code: "EIO",
            });
          }
        };
        const crashingFileSystem = {
          ...fs,
          rename: async (from, to) => {
            await fs.rename(from, to);
            if (backups.has(from) && finals.has(to)) crash();
          },
          rm: async (target, options) => {
            await fs.rm(target, options);
            if (finals.has(target)) crash();
          },
        };
        await assert.rejects(() => recoverToolcraftMotionReferencePublication({
          artifactRoot: root,
          fileSystem: crashingFileSystem,
          heartbeat: noHeartbeat,
          journalPath,
          sourceIdentity,
          temporaryRoot: root,
          token: `crash-${crashAfter}`,
          transactionRoot,
        }), /old group|rollback|injected/iu);
        await recoverToolcraftMotionReferencePublication({
          artifactRoot: root,
          fileSystem: fs,
          heartbeat: noHeartbeat,
          journalPath,
          sourceIdentity,
          temporaryRoot: root,
          token: `restart-${crashAfter}`,
          transactionRoot,
        });
        for (const { backupDirectory, finalDirectory } of records) {
          assert.equal(await fs.readFile(path.join(finalDirectory, "version"), "utf8"),
            `old-${path.basename(finalDirectory)}`);
          assert.equal(await exists(backupDirectory), false);
        }
        assert.equal(await exists(journalPath), false);
        assert.deepEqual(await fs.readdir(transactionRoot), []);
        assert.deepEqual((await fs.readdir(root)).filter((name) =>
          name.includes(".publication.json") || name.includes(".tmp-")), []);
      });
  });
