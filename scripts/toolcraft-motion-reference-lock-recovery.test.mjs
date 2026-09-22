import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  publishToolcraftMotionReferenceStudies,
} from "./toolcraft-motion-reference-publication.mjs";
import {
  createToolcraftMotionPublicationEvidenceGroup,
} from "./toolcraft-motion-reference-publication.fixtures.mjs";

const group = createToolcraftMotionPublicationEvidenceGroup();
const sourceIdentity = group.referenceId;

async function exists(target) {
  return fs.stat(target).then(() => true, (error) => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
}

async function fixture(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "motion-lock-recovery-"));
  context.after(() => fs.rm(root, { force: true, recursive: true }));
  const temporaryRoot = path.join(root, ".toolcraft", "tmp");
  const lockDirectory = path.join(temporaryRoot, `${sourceIdentity}.lock`);
  const finalRoot = path.join(root, "src", "app", "reference-studies");
  const finalDirectory = path.join(finalRoot, group.evidences[0].studyId);
  const stagingRoot = path.join(
    temporaryRoot, "work", `${sourceIdentity}.staging`,
  );
  const stagingDirectory = path.join(
    stagingRoot, path.basename(finalDirectory),
  );
  await fs.mkdir(finalRoot, { recursive: true });
  await fs.mkdir(temporaryRoot, { recursive: true });
  await fs.mkdir(stagingDirectory, { recursive: true });
  await fs.writeFile(path.join(stagingDirectory, "version"), "new");
  return { finalDirectory, lockDirectory, root, stagingDirectory, stagingRoot };
}

function owner(pid, leaseExpiresAt, token) {
  return { leaseExpiresAt, pid, sourceIdentity, token };
}

async function ownerDirectory(directory, value) {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "owner.json"),
    `${JSON.stringify(value)}\n`);
}

function settings(value, overrides = {}) {
  return {
    discoverPreviousGroup: async () => ({
      obsoleteStudyIds: [],
    }),
    lockLeaseMilliseconds: 500,
    lockDirectory: value.lockDirectory,
    now: () => 1_000,
    pid: 555,
    sourceIdentity,
    tokenFactory: () => "restarted",
    publicationGroup: {
      evidences: group.evidences,
      referenceStudiesRoot: path.dirname(value.finalDirectory),
      rootDir: value.root,
      stagingRoot: value.stagingRoot,
    },
    ...overrides,
  };
}

async function publish(value, overrides) {
  return publishToolcraftMotionReferenceStudies([{
    finalDirectory: value.finalDirectory,
    stagingDirectory: value.stagingDirectory,
  }], settings(value, overrides));
}

test("a reused PID has no ownership authority after its lease expires", async (context) => {
  const value = await fixture(context);
  await ownerDirectory(value.lockDirectory, owner(555, 999, "old"));
  await publish(value);
  assert.equal(await fs.readFile(path.join(value.finalDirectory, "version"), "utf8"),
    "new");
  assert.equal(await exists(value.lockDirectory), false);
});

test("the next invocation recovers every persisted stale-reclaim mutation",
  async (context) => {
    const states = [
      "legacy-nested-claim",
      "claim-temp-written",
      "claim-linked",
      "claim-temp-removed",
      "stale-renamed",
      "fresh-prepare-created",
      "fresh-owner-written",
      "fresh-promoted",
      "stale-cleaned",
    ];
    for (const state of states) await context.test(state, async (subtest) => {
      const value = await fixture(subtest);
      const old = owner(91, 500, "old");
      const crashed = owner(444, 750, "crashed");
      const stale = `${value.lockDirectory}.stale-crashed`;
      const prepare = `${value.lockDirectory}.prepare-crashed`;
      const claimTempName = ".reclaim-crashed.json";
      const createClaimState = async (directory, { linked, temporary }) => {
        if (temporary) await fs.writeFile(path.join(directory, claimTempName),
          `${JSON.stringify(crashed)}\n`);
        if (linked) await fs.writeFile(path.join(directory, "reclaim.json"),
          `${JSON.stringify(crashed)}\n`);
      };
      if (["legacy-nested-claim", "claim-temp-written", "claim-linked",
        "claim-temp-removed"].includes(state)) {
        await ownerDirectory(value.lockDirectory, old);
        if (state === "legacy-nested-claim") {
          await fs.mkdir(path.join(value.lockDirectory, "reclaim"));
        } else {
          await createClaimState(value.lockDirectory, {
            linked: state !== "claim-temp-written",
            temporary: state !== "claim-temp-removed",
          });
        }
      } else if (!["stale-cleaned"].includes(state)) {
        await ownerDirectory(stale, old);
        await createClaimState(stale, { linked: true, temporary: false });
      }
      if (state === "fresh-prepare-created") await fs.mkdir(prepare);
      if (state === "fresh-owner-written") await ownerDirectory(prepare, crashed);
      if (["fresh-promoted", "stale-cleaned"].includes(state)) {
        await ownerDirectory(value.lockDirectory, crashed);
      }
      await publish(value);
      assert.equal(await fs.readFile(path.join(value.finalDirectory, "version"), "utf8"),
        "new");
      assert.equal(await exists(value.lockDirectory), false);
      assert.deepEqual((await fs.readdir(value.root)).filter((entry) =>
        entry.startsWith(`${path.basename(value.lockDirectory)}.`)), []);
    });
  });
