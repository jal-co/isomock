import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createToolcraftMotionPublicationJournalStore,
} from "./toolcraft-motion-reference-publication-journal-store.mjs";
import {
  getToolcraftMotionReferenceBackupPath,
} from "./toolcraft-motion-reference-publication-journal-schema.mjs";

const sourceA = `motion-reference-v1-${"a".repeat(64)}`;
const sourceB = `motion-reference-v1-${"b".repeat(64)}`;

async function exists(target) {
  return fs.stat(target).then(() => true, (error) => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
}

function journal(sourceIdentity, transactionRoot, root) {
  const finalDirectory = path.join(root, "final");
  return {
    operation: null,
    phase: "preparing",
    records: [{
      backedUp: false,
      backupDirectory: getToolcraftMotionReferenceBackupPath(
        transactionRoot, finalDirectory,
      ),
      finalDirectory,
      hadOld: false,
      kind: "publish",
      published: false,
      stagingDirectory: path.join(
        root, `${sourceIdentity}.staging`, path.basename(finalDirectory),
      ),
    }],
    sourceIdentity,
    version: 4,
  };
}

test("binds journal writes to the store source identity before filesystem mutation",
  async (context) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "motion-journal-store-"));
    context.after(() => fs.rm(root, { force: true, recursive: true }));
    const journalPath = path.join(root, "source.lock.publication.json");
    const temporaryPath = `${journalPath}.tmp-token`;
    const transactionRoot = path.join(root, "transaction");
    await fs.mkdir(transactionRoot);
    const store = createToolcraftMotionPublicationJournalStore({
      fileSystem: fs,
      heartbeat: async () => {},
      journalPath,
      sourceIdentity: sourceA,
      token: "token",
      transactionRoot,
    });

    await assert.rejects(() => store.write(journal(sourceB, transactionRoot, root)),
      /source identity.*invalid/iu);
    assert.equal(await exists(temporaryPath), false);
    assert.equal(await exists(journalPath), false);

    const matching = journal(sourceA, transactionRoot, root);
    await store.write(matching);
    assert.deepEqual(await store.read(), matching);
    assert.equal(await exists(temporaryPath), false);
    assert.equal(await exists(journalPath), true);
  });
