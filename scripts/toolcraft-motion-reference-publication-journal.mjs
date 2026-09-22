import {
  getToolcraftMotionReferenceBackupPath,
  TOOLCRAFT_MOTION_PUBLICATION_JOURNAL_VERSION,
  validateToolcraftMotionPublicationJournalScope,
} from "./toolcraft-motion-reference-publication-journal-schema.mjs";
import {
  createToolcraftMotionPublicationJournalStore,
} from "./toolcraft-motion-reference-publication-journal-store.mjs";
import {
  requireToolcraftMotionReferenceStagingScope,
} from "./toolcraft-motion-reference-publication-staging.mjs";

function fail(message, cause) {
  throw new Error(`Toolcraft motion reference publication journal failed: ${message}`, {
    cause,
  });
}

function requireHeartbeat(heartbeat) {
  if (typeof heartbeat !== "function") fail("a lock-owner heartbeat is required");
}

async function rollbackPreparing(store, journal) {
  try {
    if (journal.phase !== "rolling-back") {
      journal.phase = "rolling-back";
      await store.write(journal);
    }
    for (const [index, record] of journal.records.entries()) {
      if (record.published) {
        if (!(await store.status(record.finalDirectory))?.isDirectory()) {
          fail(`published final is incomplete: ${record.finalDirectory}`);
        }
        journal.operation = { index, kind: "remove-published" };
        await store.write(journal);
        await store.checked(() => store.fileSystem.rm(
          record.finalDirectory, { force: true, recursive: true },
        ));
        record.published = false;
        journal.operation = null;
        await store.write(journal);
      }
      if (record.backedUp) {
        const backup = await store.status(record.backupDirectory);
        if (!backup?.isDirectory()) {
          fail(`old group backup is incomplete: ${record.backupDirectory}`);
        }
        if (await store.status(record.finalDirectory)) {
          fail(`old group final blocks restoration: ${record.finalDirectory}`);
        }
        journal.operation = { index, kind: "restore-backup" };
        await store.write(journal);
        await store.checked(() => store.fileSystem.rename(
          record.backupDirectory, record.finalDirectory,
        ));
        record.backedUp = false;
        journal.operation = null;
        await store.write(journal);
      }
    }
    await store.remove();
  } catch (error) {
    if (error.message?.startsWith("Toolcraft motion reference publication journal failed:")) {
      throw error;
    }
    fail("the complete old group could not be restored", error);
  }
}

async function reconcileOperation(store, journal) {
  if (journal.operation === null) return;
  const record = journal.records[journal.operation.index];
  const final = await store.status(record.finalDirectory);
  const backup = await store.status(record.backupDirectory);
  const staging = record.stagingDirectory === null ? undefined :
    await store.status(record.stagingDirectory);
  if (journal.operation.kind === "backup") {
    if (backup?.isDirectory() && !final) record.backedUp = true;
    else if (final?.isDirectory() && !backup) record.backedUp = false;
    else fail("interrupted backup mutation has ambiguous filesystem state");
  } else if (journal.operation.kind === "publish" && final?.isDirectory() && !staging) {
    record.published = true;
  } else if (journal.operation.kind === "publish" && !final && staging?.isDirectory()) {
    record.published = false;
  } else if (journal.operation.kind === "remove-published" && !final) {
    record.published = false;
  } else if (journal.operation.kind === "remove-published" && final?.isDirectory()) {
    record.published = true;
  } else if (journal.operation.kind === "restore-backup" && final?.isDirectory() && !backup) {
    record.backedUp = false;
  } else if (journal.operation.kind === "restore-backup" && !final && backup?.isDirectory()) {
    record.backedUp = true;
  } else {
    fail("interrupted publication or rollback mutation has ambiguous filesystem state");
  }
  journal.operation = null;
}

async function cleanupCommitted(store, journal) {
  const retainedBackups = [];
  const warnings = [];
  for (const record of journal.records) {
    const final = await store.status(record.finalDirectory);
    if (record.kind === "publish" && !final?.isDirectory()) {
      fail(`committed final is missing: ${record.finalDirectory}`);
    }
    if (record.kind === "retire" && final) {
      fail(`committed retired final still exists: ${record.finalDirectory}`);
    }
    if (!record.backedUp) continue;
    await store.heartbeat();
    try {
      await store.fileSystem.rm(
        record.backupDirectory, { force: true, recursive: true },
      );
    } catch {
      retainedBackups.push(record.backupDirectory);
      warnings.push(`Committed study retained backup for cleanup by the next lock holder: ${record.backupDirectory}`);
      continue;
    }
    await store.heartbeat();
    record.backedUp = false;
    await store.write(journal);
  }
  if (journal.records.every(({ backedUp }) => !backedUp)) {
    await store.heartbeat();
    try {
      await store.fileSystem.rm(store.journalPath, { force: true });
    } catch {
      warnings.push(`Committed studies retained publication journal for cleanup by the next lock holder: ${store.journalPath}`);
    }
    await store.heartbeat();
  }
  return { committed: true, retainedBackups, warnings };
}

async function assertNoUnexplainedBackups(store) {
  const entries = await store.checked(() => store.fileSystem.readdir(
    store.transactionRoot, { withFileTypes: true },
  ));
  if (entries.length > 0) {
    fail(`unexplained transaction residue exists without a publication journal: ${store.transactionRoot}`);
  }
}

export async function recoverToolcraftMotionReferencePublication({
  artifactRoot,
  fileSystem,
  heartbeat,
  journalPath,
  sourceIdentity,
  temporaryRoot,
  token,
  transactionRoot,
}) {
  requireHeartbeat(heartbeat);
  const store = createToolcraftMotionPublicationJournalStore({
    fileSystem, heartbeat, journalPath, sourceIdentity, token, transactionRoot,
  });
  const journal = await store.read();
  if (!journal) {
    await assertNoUnexplainedBackups(store);
    return { warnings: [] };
  }
  validateToolcraftMotionPublicationJournalScope(journal, {
    artifactRoot, temporaryRoot, transactionRoot,
  });
  await requireToolcraftMotionReferenceStagingScope(journal.records, {
    allowMissingStagingDirectories: true,
    fileSystem,
    sourceIdentity,
    temporaryRoot,
  });
  if (["preparing", "rolling-back"].includes(journal.phase)) {
    const hadOperation = journal.operation !== null;
    await reconcileOperation(store, journal);
    if (hadOperation) await store.write(journal);
    await rollbackPreparing(store, journal);
    await assertNoUnexplainedBackups(store);
    return { warnings: [] };
  }
  const cleanup = await cleanupCommitted(store, journal);
  if (cleanup.warnings.length > 0) {
    fail(`committed journal cleanup remains incomplete: ${cleanup.warnings.join(" ")}`);
  }
  await assertNoUnexplainedBackups(store);
  return { warnings: [] };
}

async function createJournal(store, pairs, sourceIdentity) {
  const records = [];
  for (const pair of pairs) records.push({
    backedUp: false,
    backupDirectory: getToolcraftMotionReferenceBackupPath(
      store.transactionRoot, pair.finalDirectory,
    ),
    finalDirectory: pair.finalDirectory,
    hadOld: Boolean(await store.status(pair.finalDirectory)),
    kind: pair.stagingDirectory === null ? "retire" : "publish",
    published: false,
    stagingDirectory: pair.stagingDirectory,
  });
  if (records.some((record) => record.kind === "retire" && !record.hadOld)) {
    fail("an obsolete final disappeared before the retirement transaction began");
  }
  return {
    operation: null, phase: "preparing", records, sourceIdentity,
    version: TOOLCRAFT_MOTION_PUBLICATION_JOURNAL_VERSION,
  };
}

export async function publishToolcraftMotionReferenceJournaledGroup(options) {
  requireHeartbeat(options.heartbeat);
  const store = createToolcraftMotionPublicationJournalStore(options);
  const journal = await createJournal(store, options.pairs, options.sourceIdentity);
  await store.write(journal);
  try {
    for (const [index, record] of journal.records.entries()) {
      if (!record.hadOld) continue;
      journal.operation = { index, kind: "backup" };
      await store.write(journal);
      await store.checked(() => store.fileSystem.rename(
        record.finalDirectory, record.backupDirectory,
      ));
      record.backedUp = true;
      journal.operation = null;
      await store.write(journal);
    }
    for (const [index, record] of journal.records.entries()) {
      if (record.kind !== "publish") continue;
      journal.operation = { index, kind: "publish" };
      await store.write(journal);
      await store.checked(() => store.fileSystem.rename(
        record.stagingDirectory, record.finalDirectory,
      ));
      record.published = true;
      journal.operation = null;
      await store.write(journal);
    }
    for (const record of journal.records) {
      const final = await store.status(record.finalDirectory);
      if (record.kind === "publish" && !final?.isDirectory()) {
        fail(`staged final is incomplete: ${record.finalDirectory}`);
      }
      if (record.kind === "retire" && final) {
        fail(`obsolete final was not retired: ${record.finalDirectory}`);
      }
    }
    journal.phase = "committed";
    await store.write(journal);
  } catch (error) {
    journal.phase = "preparing";
    try {
      const hadOperation = journal.operation !== null;
      await reconcileOperation(store, journal);
      if (hadOperation) await store.write(journal);
      await rollbackPreparing(store, journal);
    } catch (restoreError) {
      fail(`${error.message}; rollback also failed: ${restoreError.message}`, error);
    }
    fail(error.message, error);
  }
  return cleanupCommitted(store, journal);
}
