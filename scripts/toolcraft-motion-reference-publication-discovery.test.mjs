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
  return fs.stat(target).then(() => true, (error) => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
}

async function fixture(context) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "motion-discovery-"));
  context.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const group = createToolcraftMotionPublicationEvidenceGroup();
  const finalRoot = path.join(rootDir, "src", "app", "reference-studies");
  const temporaryRoot = path.join(rootDir, ".toolcraft", "tmp");
  const finalDirectory = path.join(finalRoot, group.evidences[0].studyId);
  const stagingRoot = path.join(
    temporaryRoot, "work", `${group.referenceId}.staging`,
  );
  const stagingDirectory = path.join(
    stagingRoot, path.basename(finalDirectory),
  );
  await Promise.all([
    fs.mkdir(finalRoot, { recursive: true }),
    fs.mkdir(stagingDirectory, { recursive: true }),
  ]);
  const publicationGroup = {
    evidences: group.evidences,
    referenceStudiesRoot: finalRoot,
    rootDir,
    stagingRoot,
  };
  const settings = {
    discoverPreviousGroup: async () => ({ obsoleteStudyIds: [] }),
    lockLeaseMilliseconds: 500,
    lockDirectory: path.join(temporaryRoot, `${group.referenceId}.lock`),
    now: () => 1_000,
    pid: 444,
    publicationGroup,
    sourceIdentity: group.referenceId,
    tokenFactory: () => "discovery-token",
  };
  return {
    finalDirectory, finalRoot, publicationGroup, rootDir, settings,
    stagingDirectory,
  };
}

test("requires canonical group authority before publication", async (context) => {
  const value = await fixture(context);
  const settings = { ...value.settings };
  delete settings.publicationGroup;

  await assert.rejects(() => publishToolcraftMotionReferenceStudies([{
    finalDirectory: value.finalDirectory,
    stagingDirectory: value.stagingDirectory,
  }], settings), /canonical publication group/iu);
  assert.equal(await exists(value.stagingDirectory), true);
  assert.equal(await exists(value.finalDirectory), false);
});

test("rejects a final outside the checked canonical root before mutation",
  async (context) => {
    const value = await fixture(context);
    const outsideFinal = path.join(value.rootDir, "outside-final");

    await assert.rejects(() => publishToolcraftMotionReferenceStudies([{
      finalDirectory: outsideFinal,
      stagingDirectory: value.stagingDirectory,
    }], value.settings), /direct children.*canonical reference root/iu);
    assert.equal(await exists(value.settings.lockDirectory), false);
    assert.equal(await exists(value.stagingDirectory), true);
    assert.equal(await exists(outsideFinal), false);
  });

test("rejects a source transaction symlink before artifact mutation",
  async (context) => {
    const value = await fixture(context);
    const outside = path.join(value.rootDir, "outside");
    const transactionRoot = path.join(
      path.dirname(value.settings.lockDirectory),
      `${value.settings.sourceIdentity}.transaction`,
    );
    await fs.mkdir(outside);
    try {
      await fs.symlink(outside, transactionRoot, "dir");
    } catch (error) {
      if (["EACCES", "ENOSYS", "EPERM"].includes(error?.code)) {
        context.skip(`symbolic links are unavailable: ${error.code}`);
        return;
      }
      throw error;
    }

    await assert.rejects(() => publishToolcraftMotionReferenceStudies([{
      finalDirectory: value.finalDirectory,
      stagingDirectory: value.stagingDirectory,
    }], value.settings), /transaction root.*direct directory|link/iu);
    assert.deepEqual(await fs.readdir(outside), []);
    assert.equal(await exists(value.stagingDirectory), true);
    assert.equal(await exists(value.finalDirectory), false);
  });

test("rejects path-like obsolete study ids from discovery without data mutation",
  async (context) => {
    for (const obsoleteStudyId of [
      "../../outside",
      path.join(os.tmpdir(), "absolute-outside"),
      `motion-v1-${"a".repeat(64)}/nested`,
    ]) await context.test(obsoleteStudyId, async (subtest) => {
      const value = await fixture(subtest);
      const outside = path.join(value.rootDir, "outside");
      await fs.mkdir(outside);
      await fs.writeFile(path.join(outside, "version"), "untouched");
      const settings = {
        ...value.settings,
        discoverPreviousGroup: async () => ({
          obsoleteStudyIds: [obsoleteStudyId],
        }),
      };

      await assert.rejects(() => publishToolcraftMotionReferenceStudies([{
        finalDirectory: value.finalDirectory,
        stagingDirectory: value.stagingDirectory,
      }], settings), /obsolete study ids.*canonical/iu);
      assert.equal(await exists(value.stagingDirectory), true);
      assert.equal(await exists(value.finalDirectory), false);
      assert.equal(await fs.readFile(path.join(outside, "version"), "utf8"),
        "untouched");
    });
  });
