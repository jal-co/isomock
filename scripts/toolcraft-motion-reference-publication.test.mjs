import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  publishToolcraftMotionReferenceStudies,
} from "./toolcraft-motion-reference-publication.mjs";
import {
  getToolcraftMotionReferenceBackupPath,
} from "./toolcraft-motion-reference-publication-journal-schema.mjs";
import {
  createToolcraftMotionPublicationEvidenceGroup,
} from "./toolcraft-motion-reference-publication.fixtures.mjs";

const sourceIdentity = createToolcraftMotionPublicationEvidenceGroup().referenceId;

async function exists(target) {
  try { await fs.stat(target); return true; } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
async function fixture(context, count = 1) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "motion-publication-"));
  context.after(() => fs.rm(root, { force: true, recursive: true }));
  const temporaryRoot = path.join(root, ".toolcraft", "tmp");
  const lockDirectory = path.join(temporaryRoot, `${sourceIdentity}.lock`);
  const finalRoot = path.join(root, "src", "app", "reference-studies");
  const group = createToolcraftMotionPublicationEvidenceGroup({ count });
  const stagingRoot = path.join(
    temporaryRoot, "work", `${sourceIdentity}.staging`,
  );
  await fs.mkdir(temporaryRoot, { recursive: true });
  await fs.mkdir(finalRoot, { recursive: true });
  await fs.mkdir(stagingRoot, { recursive: true });
  const pairs = [];
  for (const [index, evidence] of group.evidences.entries()) {
    const stagingDirectory = path.join(stagingRoot, evidence.studyId);
    const finalDirectory = path.join(finalRoot, evidence.studyId);
    await fs.mkdir(stagingDirectory);
    await fs.writeFile(path.join(stagingDirectory, "version"), `new-${index}`);
    pairs.push({ finalDirectory, stagingDirectory });
  }
  return {
    evidences: group.evidences, finalRoot, lockDirectory, pairs, root,
    stagingRoot, temporaryRoot,
  };
}
async function version(directory) {
  return fs.readFile(path.join(directory, "version"), "utf8");
}
function options(fixture, overrides = {}) {
  const { stagingRoot = fixture.stagingRoot, ...settings } = overrides;
  return {
    discoverPreviousGroup: async () => ({
      obsoleteStudyIds: [],
    }),
    lockLeaseMilliseconds: 500,
    lockDirectory: fixture.lockDirectory,
    now: () => 1_000,
    pid: 444,
    sourceIdentity,
    tokenFactory: () => "holder-token",
    publicationGroup: {
      evidences: fixture.evidences,
      referenceStudiesRoot: fixture.finalRoot,
      rootDir: fixture.root,
      stagingRoot,
    },
    ...settings,
  };
}
const transactionRoot = (value) => path.join(
  value.temporaryRoot, `${sourceIdentity}.transaction`,
);
const backupPath = (value, finalDirectory) =>
  getToolcraftMotionReferenceBackupPath(transactionRoot(value), finalDirectory);

test("publishes one or more new staged studies as one group", async (context) => {
  const value = await fixture(context, 2);
  const result = await publishToolcraftMotionReferenceStudies(
    value.pairs, options(value),
  );
  assert.deepEqual(result, { committed: true, retainedBackups: [], warnings: [] });
  assert.deepEqual(await Promise.all(value.pairs.map(({ finalDirectory }) =>
    version(finalDirectory))), ["new-0", "new-1"]);
  assert.equal(await exists(value.lockDirectory), false);
});

test("atomically replaces old studies and removes complete backups", async (context) => {
  const value = await fixture(context, 2);
  for (const [index, pair] of value.pairs.entries()) {
    await fs.mkdir(pair.finalDirectory);
    await fs.writeFile(path.join(pair.finalDirectory, "version"), `old-${index}`);
  }
  await publishToolcraftMotionReferenceStudies(value.pairs, options(value));
  assert.deepEqual(await Promise.all(value.pairs.map(({ finalDirectory }) =>
    version(finalDirectory))), ["new-0", "new-1"]);
  assert.deepEqual(await Promise.all(value.pairs.map(({ finalDirectory }) =>
    exists(backupPath(value, finalDirectory)))), [false, false]);
});

test("a pre-commit staged rename failure restores the complete old group", async (context) => {
  const value = await fixture(context, 2);
  for (const [index, pair] of value.pairs.entries()) {
    await fs.mkdir(pair.finalDirectory);
    await fs.writeFile(path.join(pair.finalDirectory, "version"), `old-${index}`);
  }
  let stagedRenames = 0;
  const fileSystem = {
    ...fs,
    rename: async (from, to) => {
      if (value.pairs.some(({ stagingDirectory }) => from === stagingDirectory) &&
          ++stagedRenames === 2) throw Object.assign(new Error("injected rename failure"), {
        code: "EIO",
      });
      return fs.rename(from, to);
    },
  };
  await assert.rejects(() => publishToolcraftMotionReferenceStudies(
    value.pairs, options(value, { fileSystem }),
  ), /publication.*injected rename failure/iu);
  assert.deepEqual(await Promise.all(value.pairs.map(({ finalDirectory }) =>
    version(finalDirectory))), ["old-0", "old-1"]);
  assert.deepEqual(await Promise.all(value.pairs.map(({ finalDirectory }) =>
    exists(backupPath(value, finalDirectory)))), [false, false]);
});

test("rejects an unexplained backup instead of guessing pair state", async (context) => {
  const value = await fixture(context);
  const pair = value.pairs[0];
  const backup = backupPath(value, pair.finalDirectory);
  await fs.mkdir(transactionRoot(value));
  await fs.mkdir(backup);
  await fs.writeFile(path.join(backup, "version"), "old");
  await assert.rejects(() => publishToolcraftMotionReferenceStudies(
    value.pairs, options(value),
  ), /unexplained backup|journal/iu);
  assert.equal(await version(backup), "old");
  assert.equal(await exists(pair.finalDirectory), false);
});

test("journal recovery restores the complete old group before a failing next publish", async (context) => {
  const value = await fixture(context, 2);
  const [first, second] = value.pairs;
  const firstBackup = backupPath(value, first.finalDirectory);
  const secondBackup = backupPath(value, second.finalDirectory);
  await fs.mkdir(transactionRoot(value));
  await fs.mkdir(first.finalDirectory);
  await fs.writeFile(path.join(first.finalDirectory, "version"), "interrupted-new-a");
  for (const [backup, content] of [[firstBackup, "old-a"], [secondBackup, "old-b"]]) {
    await fs.mkdir(backup);
    await fs.writeFile(path.join(backup, "version"), content);
  }
  const previousStagingRoot = path.join(
    value.temporaryRoot, "previous", `${sourceIdentity}.staging`,
  );
  await fs.writeFile(`${value.lockDirectory}.publication.json`, `${JSON.stringify({
    operation: null,
    phase: "preparing",
    records: [
      { backedUp: true, backupDirectory: firstBackup,
        finalDirectory: first.finalDirectory, hadOld: true, kind: "publish", published: true,
        stagingDirectory: path.join(
          previousStagingRoot, path.basename(first.finalDirectory),
        ) },
      { backedUp: true, backupDirectory: secondBackup,
        finalDirectory: second.finalDirectory, hadOld: true, kind: "publish", published: false,
        stagingDirectory: path.join(
          previousStagingRoot, path.basename(second.finalDirectory),
        ) },
    ],
    sourceIdentity,
    version: 4,
  }, null, 2)}\n`);
  let stagedRenames = 0;
  const fileSystem = {
    ...fs,
    rename: async (from, to) => {
      if (value.pairs.some(({ stagingDirectory }) => from === stagingDirectory) &&
          ++stagedRenames === 2) throw Object.assign(new Error("next publish failed"), {
        code: "EIO",
      });
      return fs.rename(from, to);
    },
  };
  await assert.rejects(() => publishToolcraftMotionReferenceStudies(
    value.pairs, options(value, { fileSystem }),
  ), /next publish failed/iu);
  assert.deepEqual(await Promise.all(value.pairs.map(({ finalDirectory }) =>
    version(finalDirectory))), ["old-a", "old-b"]);
  assert.equal(await exists(`${value.lockDirectory}.publication.json`), false);
});

test("post-commit backup cleanup failure is success with a retained warning", async (context) => {
  const value = await fixture(context);
  const pair = value.pairs[0];
  await fs.mkdir(pair.finalDirectory);
  await fs.writeFile(path.join(pair.finalDirectory, "version"), "old");
  const backup = backupPath(value, pair.finalDirectory);
  let failCleanup = true;
  const fileSystem = {
    ...fs,
    rm: async (target, settings) => {
      if (target === backup && failCleanup) {
        failCleanup = false;
        throw Object.assign(new Error("cleanup unavailable"), { code: "EBUSY" });
      }
      return fs.rm(target, settings);
    },
  };
  const result = await publishToolcraftMotionReferenceStudies(
    value.pairs, options(value, { fileSystem }),
  );
  assert.equal(result.committed, true);
  assert.deepEqual(result.retainedBackups, [backup]);
  assert.match(result.warnings.join("\n"), /retained.*backup/iu);
  assert.equal(await version(pair.finalDirectory), "new-0");
  assert.equal(await exists(`${value.lockDirectory}.publication.json`), true);

  const nextStaging = path.join(
    value.stagingRoot, path.basename(pair.finalDirectory),
  );
  await fs.mkdir(nextStaging);
  await fs.writeFile(path.join(nextStaging, "version"), "newer");
  await publishToolcraftMotionReferenceStudies(
    [{ ...pair, stagingDirectory: nextStaging }], options(value),
  );
  assert.equal(await exists(backup), false);
  assert.equal(await version(pair.finalDirectory), "newer");
  assert.equal(await exists(`${value.lockDirectory}.publication.json`), false);
});

test("an unexpired lease fails actionably without mutating staging or final", async (context) => {
  const value = await fixture(context);
  await fs.mkdir(value.lockDirectory);
  await fs.writeFile(path.join(value.lockDirectory, "owner.json"), JSON.stringify({
    leaseExpiresAt: 1_500, pid: 91, sourceIdentity,
    token: "live-owner",
  }));
  await assert.rejects(() => publishToolcraftMotionReferenceStudies(
    value.pairs, options(value),
  ), /unexpired.*lease/iu);
  assert.equal(await exists(value.pairs[0].stagingDirectory), true);
  assert.equal(await exists(value.pairs[0].finalDirectory), false);
});

test("an expired owner lease is reclaimed before publication", async (context) => {
  const value = await fixture(context);
  await fs.mkdir(value.lockDirectory);
  await fs.writeFile(path.join(value.lockDirectory, "owner.json"), JSON.stringify({
    leaseExpiresAt: 999, pid: 91, sourceIdentity,
    token: "stale-owner",
  }));
  await publishToolcraftMotionReferenceStudies(value.pairs, options(value));
  assert.equal(await version(value.pairs[0].finalDirectory), "new-0");
});

test("two stale-lock contenders allow only one publisher and preserve the winner lock", async (context) => {
  const value = await fixture(context);
  const secondStagingRoot = path.join(
    value.temporaryRoot, "second-work", `${sourceIdentity}.staging`,
  );
  const secondStaging = path.join(
    secondStagingRoot, path.basename(value.pairs[0].finalDirectory),
  );
  await fs.mkdir(secondStaging, { recursive: true });
  await fs.writeFile(path.join(secondStaging, "version"), "second-new");
  await fs.mkdir(value.lockDirectory);
  await fs.writeFile(path.join(value.lockDirectory, "owner.json"), JSON.stringify({
    leaseExpiresAt: 999, pid: 91, sourceIdentity,
    token: "stale-owner",
  }));
  let winnerEntered;
  let releaseWinner;
  const winnerBlocked = new Promise((resolve) => { winnerEntered = resolve; });
  const winnerGate = new Promise((resolve) => { releaseWinner = resolve; });
  const stagingDirectories = new Set([value.pairs[0].stagingDirectory, secondStaging]);
  const fileSystem = {
    ...fs,
    rename: async (from, to) => {
      if (stagingDirectories.has(from)) {
        winnerEntered();
        await winnerGate;
      }
      return fs.rename(from, to);
    },
  };
  let loserRejected;
  const loser = new Promise((resolve) => { loserRejected = resolve; });
  const attempts = [
    publishToolcraftMotionReferenceStudies(value.pairs, options(value, {
      fileSystem, tokenFactory: () => "contender-a",
    })),
    publishToolcraftMotionReferenceStudies([{ ...value.pairs[0],
      stagingDirectory: secondStaging }], options(value, {
      fileSystem, stagingRoot: secondStagingRoot,
      tokenFactory: () => "contender-b",
    })),
  ].map((attempt) => attempt.then(
    (value) => ({ status: "fulfilled", value }),
    (reason) => {
      loserRejected(reason);
      return { reason, status: "rejected" };
    },
  ));
  await winnerBlocked;
  const loserError = await loser;
  assert.match(loserError.message, /reclaim|another command|lock/iu);
  const activeOwner = JSON.parse(await fs.readFile(
    path.join(value.lockDirectory, "owner.json"), "utf8",
  ));
  assert.ok(["contender-a", "contender-b"].includes(activeOwner.token));
  assert.equal(await exists(value.lockDirectory), true);
  releaseWinner();
  const results = await Promise.all(attempts);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(results.filter(({ status }) => status === "rejected").length, 1);
  assert.ok(["new-0", "second-new"].includes(await version(value.pairs[0].finalDirectory)));
  assert.equal(await exists(value.lockDirectory), false);
});

test("an active publisher renews before a staged mutation so an expired original lease cannot be reclaimed",
  async (context) => {
    const value = await fixture(context, 2);
    const contenderStagingRoot = path.join(
      value.temporaryRoot, "contender-work", `${sourceIdentity}.staging`,
    );
    await fs.mkdir(contenderStagingRoot, { recursive: true });
    const contenderPairs = [];
    for (const [index, pair] of value.pairs.entries()) {
      const stagingDirectory = path.join(
        contenderStagingRoot, path.basename(pair.finalDirectory),
      );
      await fs.mkdir(stagingDirectory);
      await fs.writeFile(path.join(stagingDirectory, "version"), `contender-${index}`);
      contenderPairs.push({ ...pair, stagingDirectory });
    }
    let clock = 1_000;
    let journalWrites = 0;
    let stagedRenameEntered;
    let releaseStagedRename;
    const stagedRenameStarted = new Promise((resolve) => {
      stagedRenameEntered = resolve;
    });
    const stagedRenameGate = new Promise((resolve) => {
      releaseStagedRename = resolve;
    });
    const journalPath = `${value.lockDirectory}.publication.json`;
    const fileSystem = {
      ...fs,
      rename: async (from, to) => {
        if (to === journalPath && ++journalWrites === 2) clock = 1_090;
        if (from === value.pairs[0].stagingDirectory) {
          stagedRenameEntered();
          await stagedRenameGate;
        }
        return fs.rename(from, to);
      },
    };
    const publisher = publishToolcraftMotionReferenceStudies(
      value.pairs, options(value, {
        fileSystem,
        lockLeaseMilliseconds: 100,
        now: () => clock,
        tokenFactory: () => "active-publisher",
      }),
    ).then((result) => ({ result, status: "fulfilled" }),
      (reason) => ({ reason, status: "rejected" }));
    await stagedRenameStarted;
    clock = 1_150;
    const contender = await publishToolcraftMotionReferenceStudies(
      contenderPairs, options(value, {
        lockLeaseMilliseconds: 100,
        now: () => clock,
        stagingRoot: contenderStagingRoot,
        tokenFactory: () => "late-contender",
      }),
    ).then((result) => ({ result, status: "fulfilled" }),
      (reason) => ({ reason, status: "rejected" }));
    releaseStagedRename();
    const published = await publisher;

    assert.equal(contender.status, "rejected");
    assert.match(contender.reason.message, /lease|lock|publisher/iu);
    assert.equal(published.status, "fulfilled");
    assert.deepEqual(await Promise.all(value.pairs.map(({ finalDirectory }) =>
      version(finalDirectory))), ["new-0", "new-1"]);
    assert.deepEqual(await Promise.all(contenderPairs.map(({ stagingDirectory }) =>
      version(stagingDirectory))), ["contender-0", "contender-1"]);
  });

test("token loss fails closed before finals and never removes the replacement lock", async (context) => {
  const value = await fixture(context);
  const fileSystem = {
    ...fs,
    readFile: async (target, ...args) => {
      if (target === path.join(value.lockDirectory, "owner.json")) {
        return JSON.stringify({ leaseExpiresAt: 1_500, pid: 999, sourceIdentity,
          token: "replacement-owner" });
      }
      return fs.readFile(target, ...args);
    },
  };
  await assert.rejects(() => publishToolcraftMotionReferenceStudies(
    value.pairs, options(value, { fileSystem, tokenFactory: () => "holder-token" }),
  ), /ownership|token|journal/iu);
  assert.equal(await exists(value.lockDirectory), true);
  assert.equal(await exists(value.pairs[0].stagingDirectory), true);
  assert.equal(await exists(value.pairs[0].finalDirectory), false);
  await fs.rm(value.lockDirectory, { force: true, recursive: true });
});

test("rejects cross-device staging before any rename", async (context) => {
  const value = await fixture(context);
  const renames = [];
  const fileSystem = {
    ...fs,
    rename: async (...args) => { renames.push(args); return fs.rename(...args); },
    stat: async (target) => {
      const status = await fs.stat(target);
      return Object.create(status, {
        dev: { value: target === value.pairs[0].stagingDirectory ? 20 : 10 },
      });
    },
  };
  await assert.rejects(() => publishToolcraftMotionReferenceStudies(
    value.pairs, options(value, { fileSystem }),
  ), /same filesystem/iu);
  assert.deepEqual(renames, []);
});
