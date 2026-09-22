import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  writeCanonicalToolcraftMotionReferenceEvidence,
} from "../src/app/acceptance/motion-reference-evidence.mjs";
import {
  createToolcraftMotionPublicationEvidenceGroup,
} from "./toolcraft-motion-reference-publication.fixtures.mjs";
import {
  publishToolcraftMotionReferenceStudies,
} from "./toolcraft-motion-reference-publication.mjs";

async function exists(target) {
  return fs.stat(target).then(() => true, (error) => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
}

async function writeStudy(directory, evidence, sheetBytes) {
  await fs.mkdir(directory, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(directory, "contact-sheet.png"), sheetBytes),
    fs.writeFile(path.join(directory, "evidence.json"),
      writeCanonicalToolcraftMotionReferenceEvidence(evidence)),
  ]);
}

async function fixture(context) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "motion-isolation-"));
  context.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const finalRoot = path.join(rootDir, "src", "app", "reference-studies");
  const temporaryRoot = path.join(rootDir, ".toolcraft", "tmp");
  await Promise.all([
    fs.mkdir(finalRoot, { recursive: true }),
    fs.mkdir(temporaryRoot, { recursive: true }),
  ]);
  const createSource = async (sourceCharacter, count) => {
    const group = createToolcraftMotionPublicationEvidenceGroup({
      count, sourceCharacter,
    });
    const finalDirectories = group.evidences.map(({ studyId }) =>
      path.join(finalRoot, studyId));
    await Promise.all(group.evidences.map((evidence, index) =>
      writeStudy(finalDirectories[index], evidence, group.sheetBytes[index])));
    return {
      ...group,
      finalDirectories,
      finalRoot,
      lockDirectory: path.join(temporaryRoot, `${group.referenceId}.lock`),
      rootDir,
      temporaryRoot,
    };
  };
  return {
    a: await createSource("a", 2),
    b: await createSource("b", 1),
    finalRoot,
    rootDir,
  };
}

async function stage(source, label) {
  const stagingRoot = path.join(
    source.temporaryRoot, `work-${label}`, `${source.referenceId}.staging`,
  );
  const stagingDirectories = [];
  for (const [index, evidence] of source.evidences.entries()) {
    const directory = path.join(stagingRoot, evidence.studyId);
    await writeStudy(directory, evidence, source.sheetBytes[index]);
    stagingDirectories.push(directory);
  }
  return { ...source, stagingDirectories, stagingRoot };
}

function settings(source, fileSystem = fs) {
  return {
    fileSystem,
    lockLeaseMilliseconds: 500,
    lockDirectory: source.lockDirectory,
    now: () => 1_000,
    pid: 444,
    publicationGroup: {
      evidences: source.evidences,
      referenceStudiesRoot: source.finalRoot,
      rootDir: source.rootDir,
      stagingRoot: source.stagingRoot,
    },
    sourceIdentity: source.referenceId,
    tokenFactory: () => `token-${source.referenceId}`,
  };
}

function publish(source, fileSystem) {
  return publishToolcraftMotionReferenceStudies(
    source.finalDirectories.map((finalDirectory, index) => ({
      finalDirectory,
      stagingDirectory: source.stagingDirectories[index],
    })),
    settings(source, fileSystem),
  );
}

test("transaction backups stay outside the committed artifact root",
  async (context) => {
    const value = await fixture(context);
    const a = await stage(value.a, "a");
    const renames = [];
    await publish(a, {
      ...fs,
      rename: async (from, to) => {
        renames.push([from, to]);
        return fs.rename(from, to);
      },
    });
    const transactionRoot = path.join(
      a.temporaryRoot, `${a.referenceId}.transaction`,
    );
    assert.deepEqual(renames.filter(([from]) =>
      a.finalDirectories.includes(from)), a.finalDirectories.map((finalDirectory) => [
      finalDirectory, path.join(transactionRoot, path.basename(finalDirectory)),
    ]));
    assert.deepEqual((await fs.readdir(value.finalRoot)).sort(), [
      ...a.finalDirectories, ...value.b.finalDirectories,
    ].map((directory) => path.basename(directory)).sort());
  });

test("a partial real source transaction is invisible to another source",
  async (context) => {
    const value = await fixture(context);
    const a = await stage(value.a, "a");
    const b = await stage(value.b, "b");
    let releaseA;
    let reportPaused;
    const paused = new Promise((resolve) => { reportPaused = resolve; });
    const resume = new Promise((resolve) => { releaseA = resolve; });
    let held = false;
    const aFileSystem = {
      ...fs,
      rename: async (from, to) => {
        await fs.rename(from, to);
        if (!held && from === a.stagingDirectories[0] &&
            to === a.finalDirectories[0]) {
          held = true;
          reportPaused();
          await resume;
        }
      },
    };
    const aPublication = publish(a, aFileSystem);
    await paused;

    assert.equal(await exists(a.finalDirectories[0]), true);
    assert.equal(await exists(a.finalDirectories[1]), false);
    const bMutations = [];
    const bFileSystem = {
      ...fs,
      rename: async (from, to) => {
        bMutations.push([from, to]);
        return fs.rename(from, to);
      },
      rm: async (target, options) => {
        bMutations.push([target]);
        return fs.rm(target, options);
      },
    };
    await publish(b, bFileSystem);
    assert.equal(await exists(b.finalDirectories[0]), true);
    assert.equal(bMutations.some((paths) => paths.some((target) =>
      a.finalDirectories.includes(target) ||
      target.includes(`${a.referenceId}.transaction`))), false);

    releaseA();
    await aPublication;
    assert.deepEqual((await fs.readdir(value.finalRoot)).sort(), [
      ...a.finalDirectories, ...b.finalDirectories,
    ].map((directory) => path.basename(directory)).sort());
  });

test("retained cleanup residue is source-owned and cleaned by that source later",
  async (context) => {
    const value = await fixture(context);
    let a = await stage(value.a, "a-first");
    const b = await stage(value.b, "b");
    let retainedBackup;
    const cleanupFailure = {
      ...fs,
      rm: async (target, options) => {
        if (target.includes(`${a.referenceId}.transaction`) &&
            retainedBackup === undefined) {
          retainedBackup = target;
          throw Object.assign(new Error("retained A cleanup"), { code: "EBUSY" });
        }
        return fs.rm(target, options);
      },
    };
    const aResult = await publish(a, cleanupFailure);
    assert.equal(aResult.committed, true);
    assert.equal(await exists(retainedBackup), true);

    await publish(b);
    assert.equal(await exists(retainedBackup), true);

    a = await stage(value.a, "a-later");
    await publish(a);
    assert.equal(await exists(retainedBackup), false);
    assert.equal(await exists(value.b.finalDirectories[0]), true);
  });

test("same-source residue without its journal fails closed", async (context) => {
  const value = await fixture(context);
  let a = await stage(value.a, "a-first");
  let retainedBackup;
  await publish(a, {
    ...fs,
    rm: async (target, options) => {
      if (target.includes(`${a.referenceId}.transaction`) &&
          retainedBackup === undefined) {
        retainedBackup = target;
        throw Object.assign(new Error("retain backup"), { code: "EBUSY" });
      }
      return fs.rm(target, options);
    },
  });
  await fs.rm(`${a.lockDirectory}.publication.json`);
  a = await stage(value.a, "a-unexpected");

  await assert.rejects(() => publish(a), /unexplained transaction residue/iu);
  assert.equal(await exists(retainedBackup), true);
});
