import path from "node:path";

import {
  defineToolcraftMotionReferenceStagingScope,
} from "./toolcraft-motion-reference-publication-staging.mjs";

export const TOOLCRAFT_MOTION_PUBLICATION_JOURNAL_VERSION = 4;

function fail(message, cause) {
  throw new Error(`Toolcraft motion reference publication journal failed: ${message}`, {
    cause,
  });
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortJson(value[key])]),
  );
  return value;
}

export function serializeToolcraftMotionPublicationJournal(journal) {
  return `${JSON.stringify(sortJson(journal), null, 2)}\n`;
}

export function getToolcraftMotionReferenceBackupPath(
  transactionRoot,
  finalDirectory,
) {
  return path.join(transactionRoot, path.basename(finalDirectory));
}

export function getToolcraftMotionReferencePublicationJournalPath(lockDirectory) {
  return `${lockDirectory}.publication.json`;
}

function validateRecord(record, seen, transactionRoot) {
  const keys = ["backedUp", "backupDirectory", "finalDirectory", "hadOld",
    "kind", "published", "stagingDirectory"];
  if (!exactKeys(record, keys) ||
      !path.isAbsolute(record.backupDirectory ?? "") ||
      !path.isAbsolute(record.finalDirectory ?? "") ||
      !["publish", "retire"].includes(record.kind) ||
      (record.kind === "publish" && !path.isAbsolute(record.stagingDirectory ?? "")) ||
      (record.kind === "retire" && record.stagingDirectory !== null) ||
      record.backupDirectory !==
        getToolcraftMotionReferenceBackupPath(transactionRoot, record.finalDirectory) ||
      typeof record.backedUp !== "boolean" || typeof record.hadOld !== "boolean" ||
      typeof record.published !== "boolean" || seen.has(record.finalDirectory)) {
    fail("journal records must be canonical unique absolute publication records");
  }
  if (record.backedUp && !record.hadOld) {
    fail("a journal record cannot back up a final that did not previously exist");
  }
  if (record.kind === "retire" && (!record.hadOld || record.published)) {
    fail("a retirement record must describe an unpublished previous final");
  }
  seen.add(record.finalDirectory);
}

export function validateToolcraftMotionPublicationJournal(
  journal,
  sourceIdentity,
  transactionRoot,
) {
  if (!exactKeys(journal,
    ["operation", "phase", "records", "sourceIdentity", "version"]) ||
      journal.version !== TOOLCRAFT_MOTION_PUBLICATION_JOURNAL_VERSION ||
      !["preparing", "rolling-back", "committed"].includes(journal.phase) ||
      journal.sourceIdentity !== sourceIdentity ||
      !Array.isArray(journal.records) || journal.records.length === 0) {
    fail("journal shape, version, phase, or source identity is invalid");
  }
  if (journal.operation !== null &&
      (!exactKeys(journal.operation, ["index", "kind"]) ||
        !Number.isSafeInteger(journal.operation.index) ||
        journal.operation.index < 0 || journal.operation.index >= journal.records.length ||
        !["backup", "publish", "remove-published", "restore-backup"]
          .includes(journal.operation.kind))) {
    fail("journal operation must be null or a canonical record mutation");
  }
  if (journal.phase === "committed" && journal.operation !== null) {
    fail("a committed journal cannot retain an active mutation");
  }
  if (journal.operation &&
      ((journal.phase === "preparing" &&
        !["backup", "publish"].includes(journal.operation.kind)) ||
       (journal.phase === "rolling-back" &&
        !["remove-published", "restore-backup"].includes(journal.operation.kind)))) {
    fail("journal operation does not match its publication phase");
  }
  if (journal.operation?.kind === "publish" &&
      journal.records[journal.operation.index]?.kind !== "publish") {
    fail("only a staged publication record may own a publish mutation");
  }
  const seen = new Set();
  journal.records.forEach((record) =>
    validateRecord(record, seen, transactionRoot));
  return journal;
}

export function validateToolcraftMotionPublicationJournalScope(
  journal,
  { artifactRoot, temporaryRoot, transactionRoot },
) {
  defineToolcraftMotionReferenceStagingScope(journal.records, {
    sourceIdentity: journal.sourceIdentity,
    temporaryRoot,
  });
  for (const record of journal.records) {
    if (path.dirname(record.finalDirectory) !== artifactRoot ||
        path.dirname(record.backupDirectory) !== transactionRoot) {
      fail("journal records escape the checked artifact or transaction roots");
    }
  }
}
