import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  acquireToolcraftMotionReferenceLease,
} from "./toolcraft-motion-reference-publication-lease.mjs";
import {
  defineToolcraftMotionReferencePublicationGroup,
  discoverToolcraftMotionReferencePreviousGroup,
} from "./toolcraft-motion-reference-group-inventory.mjs";
import {
  isStudyId,
} from "../src/app/acceptance/motion-reference-evidence-validation.mjs";
import {
  publishToolcraftMotionReferenceJournaledGroup,
  recoverToolcraftMotionReferencePublication,
} from "./toolcraft-motion-reference-publication-journal.mjs";
import {
  getToolcraftMotionReferencePublicationJournalPath,
} from "./toolcraft-motion-reference-publication-journal-schema.mjs";
import {
  requireToolcraftMotionReferenceStagingScope,
} from "./toolcraft-motion-reference-publication-staging.mjs";
import {
  defineToolcraftMotionReferenceTransactionPaths,
  requireToolcraftMotionReferenceStudiesRoot,
  requireToolcraftMotionReferenceTemporaryRoot,
} from "./toolcraft-motion-reference-roots.mjs";

const DEFAULT_LOCK_LEASE_MILLISECONDS = 300_000;
const DEFAULT_MAXIMUM_UNINTERRUPTIBLE_OPERATION_MILLISECONDS = 60_000;

function fail(message, cause) {
  throw new Error(`Toolcraft motion reference publication failed: ${message}`, {
    cause,
  });
}

async function status(fileSystem, target) {
  try {
    return await fileSystem.stat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function validatePairs(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) {
    fail("at least one staging/final pair is required");
  }
  const staging = new Set();
  const finals = new Set();
  for (const pair of pairs) {
    if (!pair || !path.isAbsolute(pair.stagingDirectory ?? "") ||
        !path.isAbsolute(pair.finalDirectory ?? "") ||
        staging.has(pair.stagingDirectory) || finals.has(pair.finalDirectory)) {
      fail("staging and final directories must be absolute and unique");
    }
    staging.add(pair.stagingDirectory);
    finals.add(pair.finalDirectory);
  }
}

async function validateSameFileSystem(pairs, fileSystem) {
  let device;
  for (const pair of pairs) {
    const staging = pair.stagingDirectory === null ? undefined :
      await status(fileSystem, pair.stagingDirectory);
    const finalParent = await status(fileSystem, path.dirname(pair.finalDirectory));
    if ((pair.stagingDirectory !== null && !staging?.isDirectory()) ||
        !finalParent?.isDirectory()) {
      fail("every staging directory and final parent must already exist");
    }
    device ??= finalParent.dev;
    if ((staging && staging.dev !== device) || finalParent.dev !== device) {
      fail("staging and final studies must use the same filesystem");
    }
  }
}

async function prepareTransactionRoot(
  fileSystem, artifactRoot, transactionRoot,
) {
  await fileSystem.mkdir(transactionRoot, { mode: 0o700, recursive: true });
  const [artifactStatus, transactionStatus] = await Promise.all([
    fileSystem.stat(artifactRoot),
    fileSystem.lstat(transactionRoot),
  ]);
  if (!transactionStatus.isDirectory() || transactionStatus.isSymbolicLink()) {
    fail("transaction root must be a direct directory, not a link");
  }
  if (artifactStatus.dev !== transactionStatus.dev) {
    fail("transaction and committed studies must use the same filesystem");
  }
}

function obsoleteFinalDirectories(discovery, checkedRoot, newStudyIds) {
  if (!discovery || typeof discovery !== "object" || Array.isArray(discovery) ||
      Object.keys(discovery).join("\0") !== "obsoleteStudyIds" ||
      !Array.isArray(discovery.obsoleteStudyIds)) {
    fail("discovery must return exactly canonical obsolete study ids");
  }
  const seen = new Set();
  return discovery.obsoleteStudyIds.map((studyId) => {
    if (!isStudyId(studyId) || seen.has(studyId) || newStudyIds.has(studyId)) {
      fail("obsolete study ids must be canonical, unique, and distinct from new studies");
    }
    seen.add(studyId);
    const finalDirectory = path.join(checkedRoot, studyId);
    if (path.dirname(finalDirectory) !== checkedRoot) {
      fail("obsolete study ids must resolve to direct canonical reference children");
    }
    return finalDirectory;
  });
}

function combineTransactionPairs(pairs, obsoleteDirectories) {
  const combined = [...pairs];
  for (const finalDirectory of obsoleteDirectories) {
    combined.push({ finalDirectory, stagingDirectory: null });
  }
  return combined;
}

function getBoundPublicationStudyIds(pairs, expectedRoot) {
  return pairs.map(({ finalDirectory }) => {
    if (path.dirname(finalDirectory) !== expectedRoot) {
      fail("new study finals must be direct children of the canonical reference root");
    }
    return path.basename(finalDirectory);
  }).sort();
}

function validatePublicationGroupBindings(actualIds, authority) {
  if (actualIds.join("\0") !== authority.studyIds.join("\0")) {
    fail("new study finals must match the complete canonical evidence group");
  }
}

export async function publishToolcraftMotionReferenceStudies(pairs, settings = {}) {
  const lockLeaseMilliseconds = settings.lockLeaseMilliseconds ??
    DEFAULT_LOCK_LEASE_MILLISECONDS;
  const options = {
    fileSystem: fs,
    discoverPreviousGroup: discoverToolcraftMotionReferencePreviousGroup,
    lockLeaseMilliseconds,
    maximumUninterruptibleOperationMilliseconds:
      Math.min(DEFAULT_MAXIMUM_UNINTERRUPTIBLE_OPERATION_MILLISECONDS,
        lockLeaseMilliseconds / 2),
    now: Date.now,
    pid: process.pid,
    tokenFactory: randomUUID,
    ...settings,
  };
  validatePairs(pairs);
  if (!options.publicationGroup) {
    fail("a canonical publication group is required");
  }
  const checkedRoot = await requireToolcraftMotionReferenceStudiesRoot({
    fileSystem: options.fileSystem,
    referenceStudiesRoot: options.publicationGroup.referenceStudiesRoot,
    rootDir: options.publicationGroup.rootDir,
  });
  const temporaryRoot = await requireToolcraftMotionReferenceTemporaryRoot({
    fileSystem: options.fileSystem,
    rootDir: options.publicationGroup.rootDir,
    temporaryRoot: path.dirname(options.lockDirectory),
  });
  const transactionPaths = defineToolcraftMotionReferenceTransactionPaths(
    temporaryRoot, options.sourceIdentity,
  );
  if (options.lockDirectory !== transactionPaths.lockDirectory) {
    fail("publication lock must be the canonical source-scoped lock");
  }
  if (typeof options.publicationGroup.stagingRoot !== "string") {
    fail("a declared canonical staging root is required");
  }
  const boundStudyIds = getBoundPublicationStudyIds(pairs, checkedRoot);
  const authority = defineToolcraftMotionReferencePublicationGroup(
    options.publicationGroup.evidences,
  );
  if (authority.referenceId !== options.sourceIdentity) {
    fail("publication source identity does not match the canonical evidence group");
  }
  validatePublicationGroupBindings(boundStudyIds, authority);
  await requireToolcraftMotionReferenceStagingScope(pairs, {
    fileSystem: options.fileSystem,
    sourceIdentity: options.sourceIdentity,
    stagingRoot: options.publicationGroup.stagingRoot,
    temporaryRoot,
  });
  await validateSameFileSystem(pairs, options.fileSystem);
  const lease = await acquireToolcraftMotionReferenceLease(options);
  const journalPath = getToolcraftMotionReferencePublicationJournalPath(
    options.lockDirectory,
  );
  let result;
  let operationError;
  try {
    await prepareTransactionRoot(
      options.fileSystem, checkedRoot, transactionPaths.transactionRoot,
    );
    await recoverToolcraftMotionReferencePublication({
      artifactRoot: checkedRoot,
      fileSystem: options.fileSystem,
      heartbeat: lease.heartbeat,
      journalPath,
      sourceIdentity: options.sourceIdentity,
      temporaryRoot,
      token: lease.token,
      transactionRoot: transactionPaths.transactionRoot,
    });
    const discovery = await options.discoverPreviousGroup({
      evidences: options.publicationGroup.evidences,
      fileSystem: options.fileSystem,
      referenceStudiesRoot: options.publicationGroup.referenceStudiesRoot,
      rootDir: options.publicationGroup.rootDir,
    });
    const obsoleteDirectories = obsoleteFinalDirectories(
      discovery, checkedRoot, new Set(boundStudyIds),
    );
    const transactionPairs = combineTransactionPairs(
      pairs, obsoleteDirectories,
    );
    await validateSameFileSystem(transactionPairs, options.fileSystem);
    result = await publishToolcraftMotionReferenceJournaledGroup({
      fileSystem: options.fileSystem,
      heartbeat: lease.heartbeat,
      journalPath,
      pairs: transactionPairs,
      sourceIdentity: options.sourceIdentity,
      token: lease.token,
      transactionRoot: transactionPaths.transactionRoot,
    });
  } catch (error) {
    operationError = error;
  }
  const unlockWarning = await lease.release();
  if (unlockWarning && result) result.warnings.push(unlockWarning);
  if (operationError) {
    if (operationError.message?.startsWith("Toolcraft motion reference publication")) {
      throw operationError;
    }
    fail(operationError.message, operationError);
  }
  return result;
}
