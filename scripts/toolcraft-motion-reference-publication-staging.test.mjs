import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createToolcraftMotionPublicationEvidenceGroup,
} from "./toolcraft-motion-reference-publication.fixtures.mjs";
import {
  publishToolcraftMotionReferenceStudies,
} from "./toolcraft-motion-reference-publication.mjs";

async function exists(target) {
  return fs.lstat(target).then(() => true, (error) => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
}

async function fixture(context) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "motion-staging-scope-"));
  context.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const group = createToolcraftMotionPublicationEvidenceGroup();
  const temporaryRoot = path.join(rootDir, ".toolcraft", "tmp");
  const finalRoot = path.join(rootDir, "src", "app", "reference-studies");
  const finalDirectory = path.join(finalRoot, group.evidences[0].studyId);
  const lockDirectory = path.join(temporaryRoot, `${group.referenceId}.lock`);
  const transactionRoot = path.join(
    temporaryRoot, `${group.referenceId}.transaction`,
  );
  await Promise.all([
    fs.mkdir(temporaryRoot, { recursive: true }),
    fs.mkdir(finalRoot, { recursive: true }),
  ]);
  return {
    finalDirectory,
    group,
    lockDirectory,
    rootDir,
    temporaryRoot,
    transactionRoot,
  };
}

function settings(value, stagingRoot, fileSystem = fs) {
  return {
    discoverPreviousGroup: async () => ({ obsoleteStudyIds: [] }),
    fileSystem,
    lockLeaseMilliseconds: 500,
    lockDirectory: value.lockDirectory,
    now: () => 1_000,
    pid: 444,
    publicationGroup: {
      evidences: value.group.evidences,
      referenceStudiesRoot: path.dirname(value.finalDirectory),
      rootDir: value.rootDir,
      stagingRoot,
    },
    sourceIdentity: value.group.referenceId,
    tokenFactory: () => "staging-token",
  };
}

function mutationGuard(value) {
  const mutations = [];
  const protectedTargets = [
    value.finalDirectory,
    value.lockDirectory,
    `${value.lockDirectory}.publication.json`,
    value.transactionRoot,
  ];
  const record = (...targets) => {
    if (targets.some((target) => typeof target === "string" &&
        protectedTargets.some((protectedTarget) =>
          target === protectedTarget || target.startsWith(`${protectedTarget}${path.sep}`)))) {
      mutations.push(targets);
    }
  };
  return {
    fileSystem: {
      ...fs,
      mkdir: async (target, options) => {
        record(target);
        return fs.mkdir(target, options);
      },
      rename: async (from, to) => {
        record(from, to);
        return fs.rename(from, to);
      },
      rm: async (target, options) => {
        record(target);
        return fs.rm(target, options);
      },
      writeFile: async (target, ...args) => {
        record(target);
        return fs.writeFile(target, ...args);
      },
    },
    mutations,
  };
}

async function rejectsWithoutPublicationMutation(
  value,
  { stagingDirectory, stagingRoot },
) {
  const guard = mutationGuard(value);
  await assert.rejects(() => publishToolcraftMotionReferenceStudies([{
    finalDirectory: value.finalDirectory,
    stagingDirectory,
  }], settings(value, stagingRoot, guard.fileSystem)),
  /canonical.*staging|staging.*scope|staging.*source|staging.*link/iu);
  assert.deepEqual(guard.mutations, []);
  assert.equal(await exists(value.finalDirectory), false);
  assert.equal(await exists(value.lockDirectory), false);
  assert.equal(await exists(`${value.lockDirectory}.publication.json`), false);
}

test("publishes a direct study from its declared source-owned staging root",
  async (context) => {
    const value = await fixture(context);
    const stagingRoot = path.join(
      value.temporaryRoot, "work", `${value.group.referenceId}.staging`,
    );
    const stagingDirectory = path.join(
      stagingRoot, value.group.evidences[0].studyId,
    );
    await fs.mkdir(stagingDirectory, { recursive: true });
    await fs.writeFile(path.join(stagingDirectory, "version"), "canonical");

    await publishToolcraftMotionReferenceStudies([{
      finalDirectory: value.finalDirectory,
      stagingDirectory,
    }], settings(value, stagingRoot));

    assert.equal(await fs.readFile(
      path.join(value.finalDirectory, "version"), "utf8",
    ), "canonical");
  });

test("rejects staging outside its canonical source scope before publication mutation",
  async (context) => {
    await context.test("external absolute directory", async (subtest) => {
      const value = await fixture(subtest);
      const stagingRoot = path.join(value.rootDir, "external-staging");
      const stagingDirectory = path.join(stagingRoot, value.group.evidences[0].studyId);
      await fs.mkdir(stagingDirectory, { recursive: true });
      await rejectsWithoutPublicationMutation(value, { stagingDirectory, stagingRoot });
    });

    await context.test("symbolic-link leaf", async (subtest) => {
      const value = await fixture(subtest);
      const outside = path.join(value.rootDir, "outside-leaf");
      const stagingRoot = path.join(
        value.temporaryRoot, "work", `${value.group.referenceId}.staging`,
      );
      const stagingDirectory = path.join(stagingRoot, value.group.evidences[0].studyId);
      await Promise.all([
        fs.mkdir(outside),
        fs.mkdir(stagingRoot, { recursive: true }),
      ]);
      await fs.symlink(outside, stagingDirectory, "dir");
      await rejectsWithoutPublicationMutation(value, { stagingDirectory, stagingRoot });
    });

    await context.test("symbolic-link ancestor", async (subtest) => {
      const value = await fixture(subtest);
      const outsideParent = path.join(value.rootDir, "outside-ancestor");
      const outsideRoot = path.join(
        outsideParent, `${value.group.referenceId}.staging`,
      );
      const stagingDirectory = path.join(outsideRoot, value.group.evidences[0].studyId);
      await fs.mkdir(stagingDirectory, { recursive: true });
      const linkedParent = path.join(value.temporaryRoot, "linked-work");
      await fs.symlink(outsideParent, linkedParent, "dir");
      await rejectsWithoutPublicationMutation(value, {
        stagingDirectory: path.join(
          linkedParent, `${value.group.referenceId}.staging`,
          value.group.evidences[0].studyId,
        ),
        stagingRoot: path.join(linkedParent, `${value.group.referenceId}.staging`),
      });
    });

    await context.test("parent traversal", async (subtest) => {
      const value = await fixture(subtest);
      const workRoot = path.join(value.temporaryRoot, "work");
      const stagingRoot = path.join(workRoot, `${value.group.referenceId}.staging`);
      const escaped = path.join(workRoot, "escaped");
      await Promise.all([
        fs.mkdir(stagingRoot, { recursive: true }),
        fs.mkdir(escaped, { recursive: true }),
      ]);
      await rejectsWithoutPublicationMutation(value, {
        stagingDirectory: `${stagingRoot}${path.sep}..${path.sep}escaped`,
        stagingRoot,
      });
    });

    await context.test("another source transaction root", async (subtest) => {
      const value = await fixture(subtest);
      const otherSource = `motion-reference-v1-${"b".repeat(64)}`;
      const stagingRoot = path.join(value.temporaryRoot, `${otherSource}.transaction`);
      const stagingDirectory = path.join(stagingRoot, value.group.evidences[0].studyId);
      await fs.mkdir(stagingDirectory, { recursive: true });
      await rejectsWithoutPublicationMutation(value, { stagingDirectory, stagingRoot });
    });
  });
