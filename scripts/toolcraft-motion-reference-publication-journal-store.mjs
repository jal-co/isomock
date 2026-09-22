import {
  serializeToolcraftMotionPublicationJournal,
  validateToolcraftMotionPublicationJournal,
} from "./toolcraft-motion-reference-publication-journal-schema.mjs";

function fail(message, cause) {
  throw new Error(`Toolcraft motion reference publication journal failed: ${message}`, {
    cause,
  });
}

export function createToolcraftMotionPublicationJournalStore({
  fileSystem,
  heartbeat,
  journalPath,
  sourceIdentity,
  token,
  transactionRoot,
}) {
  async function checked(operation) {
    await heartbeat();
    const result = await operation();
    await heartbeat();
    return result;
  }

  async function status(target) {
    try {
      return await checked(() => fileSystem.stat(target));
    } catch (error) {
      if (error?.code === "ENOENT") return undefined;
      throw error;
    }
  }

  async function read() {
    let raw;
    try {
      raw = await checked(() => fileSystem.readFile(journalPath, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return undefined;
      fail("journal could not be read", error);
    }
    let journal;
    try {
      journal = JSON.parse(raw);
    } catch (error) {
      fail("journal must contain strict JSON", error);
    }
    validateToolcraftMotionPublicationJournal(
      journal, sourceIdentity, transactionRoot,
    );
    if (raw !== serializeToolcraftMotionPublicationJournal(journal)) {
      fail("journal must use canonical serialization");
    }
    return journal;
  }

  async function write(journal) {
    validateToolcraftMotionPublicationJournal(
      journal, sourceIdentity, transactionRoot,
    );
    const temporaryPath = `${journalPath}.tmp-${token}`;
    try {
      await checked(() => fileSystem.writeFile(
        temporaryPath, serializeToolcraftMotionPublicationJournal(journal),
        { flag: "wx" },
      ));
      await checked(() => fileSystem.rename(temporaryPath, journalPath));
    } catch (error) {
      try {
        await checked(() => fileSystem.rm(temporaryPath, { force: true }));
      } catch {}
      fail("atomic journal write failed", error);
    }
  }

  return {
    checked,
    fileSystem,
    heartbeat,
    journalPath,
    read,
    remove: () => checked(() => fileSystem.rm(journalPath, { force: true })),
    status,
    transactionRoot,
    write,
  };
}
