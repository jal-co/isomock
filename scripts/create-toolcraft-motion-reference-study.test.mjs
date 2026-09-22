import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createToolcraftMotionReferenceExecutor,
  createToolcraftMotionReferenceStudy,
  main,
} from "./create-toolcraft-motion-reference-study.mjs";
import {
  createToolcraftSha256,
  getToolcraftMotionReferenceArtifactErrors,
} from "./toolcraft-motion-reference-artifacts.mjs";
import {
  publishToolcraftMotionReferenceStudies,
} from "./toolcraft-motion-reference-publication.mjs";
import {
  recoverToolcraftMotionReferencePublication,
} from "./toolcraft-motion-reference-publication-journal.mjs";
import {
  ToolcraftMotionReferenceStageError,
} from "./toolcraft-motion-reference-stage.mjs";
import {
  TOOLCRAFT_MOTION_REFERENCE_STAGES,
} from "./toolcraft-motion-reference-stage-registry.mjs";

const hex = (character) => character.repeat(64);

async function harness(context, {
  frameCount = 30,
  loopSeamScore = 0,
  sourceKind = "video",
} = {}) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "motion-command-"));
  context.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const source = path.join(rootDir, sourceKind === "frame-sequence" ? "frames" :
    sourceKind === "contact-sheet" ? "sheet.png" : "reference.mkv");
  if (sourceKind === "frame-sequence") await fs.mkdir(source);
  else await fs.writeFile(source, "source");
  const calls = { contact: 0, execute: [], hash: 0, inspect: [], materialize: [],
    publish: 0, scan: [] };
  const frameTimes = Array.from({ length: frameCount }, (_, index) => index / 30);
  const owner = {
    inspect: async (input) => {
      calls.inspect.push(input);
      return {
        decodedFrameCount: frameCount,
        ffmpegVersion: "ffmpeg 8.0",
        ffprobeVersion: "ffprobe 8.0",
        hasAlpha: false,
        height: 180,
        inputPath: source,
        pixelFormat: "yuv444p",
        sourceBasename: path.basename(source),
        sourceKind,
        sourceSha256: sourceKind === "video" ? undefined : hex("a"),
        timingMode: sourceKind === "video" ? "seconds" : "ordinal",
        width: 320,
        ...(sourceKind === "video" ? {
          durationSeconds: frameCount / 30,
          frameTimes,
          nominalFrameRate: 30,
        } : {}),
        ...(sourceKind === "contact-sheet" ? {
          sourceGrid: { columns: 5, rows: Math.ceil(frameCount / 5) },
        } : {}),
      };
    },
    materializeReviewedFrames: async ({ inspection, outputDirectory,
      sourceFrameIndices }) => {
      calls.materialize.push([...sourceFrameIndices]);
      await fs.mkdir(outputDirectory, { recursive: true });
      return Promise.all(sourceFrameIndices.map(async (sourceFrameIndex, ordinal) => {
        const framePath = path.join(outputDirectory,
          `review-${String(ordinal).padStart(6, "0")}.png`);
        await fs.writeFile(framePath, `frame:${sourceFrameIndex}`);
        return {
          path: framePath,
          sourceFrameIndex,
          sourceLocator: `${source}#frame=${sourceFrameIndex}`,
          ...(inspection.timingMode === "seconds" ? {
            timeSeconds: inspection.frameTimes[sourceFrameIndex],
          } : {}),
        };
      }));
    },
    scan: async () => {
      calls.scan.push(sourceKind);
      const changeScores = Array(frameCount).fill(0);
      if (frameCount > 92) changeScores[91] = 1;
      return {
        changeMetric: "max-yuva-diff-v1",
        changeScores,
        componentDifferences: [],
        loopSeamScore,
        scannedFrameCount: frameCount,
      };
    },
  };
  const execute = async (request) => {
    calls.execute.push(request);
    return { stdout: `${request.binary} version 8.0` };
  };
  const createContactSheet = async ({ frames, outputPath, sourceHeight, sourceWidth }) => {
    calls.contact += 1;
    const columns = Math.ceil(Math.sqrt(frames.length * sourceWidth / sourceHeight));
    const rows = Math.ceil(frames.length / columns);
    await fs.writeFile(outputPath,
      `sheet:${frames.map(({ sourceFrameIndex }) => sourceFrameIndex).join(",")}`);
    return {
      cells: frames.map(({ sourceFrameIndex }, index) => ({
        column: index % columns,
        frameId: `source-frame:${sourceFrameIndex}`,
        height: sourceHeight,
        row: Math.floor(index / columns),
        sourceFrameIndex,
        width: sourceWidth,
        x: (index % columns) * sourceWidth,
        y: Math.floor(index / columns) * sourceHeight,
      })),
      columns,
      height: rows * sourceHeight,
      outputPath,
      rows,
      width: columns * sourceWidth,
    };
  };
  const dependencies = {
    createContactSheet,
    execute,
    fileSystem: fs,
    hashSource: async () => { calls.hash += 1; return hex("a"); },
    imageSource: owner,
    mediaSource: owner,
    publishStudies: async (pairs, settings) => {
      calls.publish += 1;
      return publishToolcraftMotionReferenceStudies(pairs, {
        ...settings, lockLeaseMilliseconds: 500, now: () => 1_000,
      });
    },
    rootDir,
  };
  const options = {
    kind: sourceKind,
    source,
    ...(sourceKind === "contact-sheet" ? { grid: { columns: 5, rows: 6 } } : {}),
  };
  return { calls, dependencies, options, owner, rootDir, source };
}

function referenceInput(result) {
  return [{
    behaviors: [],
    kind: "motion-reference",
    referenceId: result.referenceId,
    studies: result.studies.map(({ evidence, evidencePath, studyId }) => ({
      evidence, evidencePath, events: [], phases: [], studyId,
    })),
  }];
}

test("fails at binary detection before creating temporary state", async (context) => {
  const value = await harness(context);
  value.dependencies.execute = async ({ binary }) => ({
    error: Object.assign(new Error(`${binary} unavailable`), { code: "ENOENT" }),
    exitCode: 1,
  });
  await assert.rejects(() => createToolcraftMotionReferenceStudy(
    value.options, value.dependencies,
  ), (error) => error.stage === "binary-detection");
  assert.equal(await fs.stat(path.join(value.rootDir, ".toolcraft"))
    .then(() => true, () => false), false);
});

test("selects media and image owners in one exhaustive source boundary", async (context) => {
  for (const sourceKind of ["video", "gif", "screen-recording", "frame-sequence",
    "contact-sheet"]) {
    const value = await harness(context, { frameCount: 3, sourceKind });
    const selected = [];
    value.dependencies.mediaSource = { ...value.owner,
      inspect: async (input) => { selected.push("media"); return value.owner.inspect(input); } };
    value.dependencies.imageSource = { ...value.owner,
      inspect: async (input) => { selected.push("image"); return value.owner.inspect(input); } };
    await createToolcraftMotionReferenceStudy(value.options, value.dependencies);
    assert.deepEqual(selected, [["video", "gif", "screen-recording"].includes(sourceKind) ?
      "media" : "image"]);
    assert.equal(value.calls.hash,
      ["video", "gif", "screen-recording"].includes(sourceKind) ? 1 : 0);
  }
});

test("publishes a verifier-valid single study with exactly two final files", async (context) => {
  const value = await harness(context, { frameCount: 30 });
  const result = await createToolcraftMotionReferenceStudy(value.options, value.dependencies);
  assert.equal(value.calls.scan.length, 1);
  assert.equal(value.calls.materialize.length, 1);
  assert.equal(value.calls.publish, 1);
  assert.equal(result.studies.length, 1);
  assert.deepEqual(await fs.readdir(path.join(value.rootDir,
    path.dirname(result.studies[0].evidencePath))), ["contact-sheet.png", "evidence.json"]);
  assert.deepEqual(await getToolcraftMotionReferenceArtifactErrors({
    referenceInputs: referenceInput(result), rootDir: value.rootDir,
  }), []);
});

test("normalizes declared image timing before selection without omitting source frames",
  async (context) => {
    const value = await harness(context, { frameCount: 2, sourceKind: "frame-sequence" });
    const timestampsFile = path.join(value.rootDir, "timestamps.json");
    await fs.writeFile(timestampsFile, "[10,11]\n");
    value.options = {
      ...value.options,
      focus: [{ endSeconds: 1, startSeconds: 0 }],
      segment: { endSeconds: 2, startSeconds: 0 },
      timestampsFile,
    };
    const result = await createToolcraftMotionReferenceStudy(
      value.options, value.dependencies,
    );
    assert.deepEqual(result.studies[0].evidence.reviewedFrames.map((frame) =>
      ({ sourceFrameIndex: frame.sourceFrameIndex, timeSeconds: frame.timeSeconds })), [
      { sourceFrameIndex: 0, timeSeconds: 0 },
      { sourceFrameIndex: 1, timeSeconds: 1 },
    ]);
    assert.equal(result.studies[0].evidence.timing.timestampsSha256,
      createToolcraftSha256(Buffer.from("[10,11]\n")));
    assert.deepEqual(await getToolcraftMotionReferenceArtifactErrors({
      referenceInputs: referenceInput(result), rootDir: value.rootDir,
    }), []);
  });

test("rejects one-frame declared timestamps before scan or publication", async (context) => {
  const value = await harness(context, { frameCount: 1, sourceKind: "frame-sequence" });
  const timestampsFile = path.join(value.rootDir, "timestamps.json");
  await fs.writeFile(timestampsFile, "[10]\n");
  value.options = { ...value.options, timestampsFile };

  await assert.rejects(() => createToolcraftMotionReferenceStudy(
    value.options, value.dependencies,
  ), /at least two.*timestamps.*duration|timestamps.*at least two.*duration/iu);
  assert.equal(value.calls.scan.length, 0);
  assert.equal(value.calls.publish, 0);
});

test("partitions dense review once, extracts one union, and publishes one atomic group", async (context) => {
  const value = await harness(context, { frameCount: 330, loopSeamScore: 1 });
  const result = await createToolcraftMotionReferenceStudy(value.options, value.dependencies);
  assert.ok(result.studies.length > 1);
  assert.equal(value.calls.scan.length, 1);
  assert.equal(value.calls.materialize.length, 1);
  assert.equal(value.calls.publish, 1);
  assert.equal(new Set(value.calls.materialize[0]).size,
    value.calls.materialize[0].length);
  assert.deepEqual(result.studies.map(({ evidence }) =>
    evidence.detectedEvents.some(({ kind }) => kind === "loop-seam")), [true, false]);
  assert.deepEqual(await getToolcraftMotionReferenceArtifactErrors({
    referenceInputs: referenceInput(result), rootDir: value.rootDir,
  }), []);
});

test("a focus refinement replaces the complete previous partition group", async (context) => {
  const value = await harness(context, { frameCount: 330, loopSeamScore: 1 });
  const initial = await createToolcraftMotionReferenceStudy(
    value.options, value.dependencies,
  );
  const refined = await createToolcraftMotionReferenceStudy({
    ...value.options,
    focus: [{ endSeconds: 5.4, startSeconds: 4.1 }],
  }, value.dependencies);
  const initialIds = initial.studies.map(({ studyId }) => studyId).sort();
  const refinedIds = refined.studies.map(({ studyId }) => studyId).sort();

  assert.equal(initialIds.length, 2);
  assert.equal(refinedIds.length, 2);
  assert.deepEqual(initialIds.filter((studyId) => refinedIds.includes(studyId)), []);
  assert.deepEqual(await fs.readdir(path.join(
    value.rootDir, "src", "app", "reference-studies",
  )), refinedIds);
});

test("group replacement retains another canonical source and replaces equal ids", async (context) => {
  const value = await harness(context, { frameCount: 330, loopSeamScore: 1 });
  const initial = await createToolcraftMotionReferenceStudy(value.options, value.dependencies);
  const equalReplacement = await createToolcraftMotionReferenceStudy(
    value.options, value.dependencies,
  );
  assert.deepEqual(equalReplacement.studies.map(({ studyId }) => studyId),
    initial.studies.map(({ studyId }) => studyId));

  value.dependencies.hashSource = async () => hex("b");
  const unrelated = await createToolcraftMotionReferenceStudy(
    value.options, value.dependencies,
  );
  value.dependencies.hashSource = async () => hex("a");
  const refined = await createToolcraftMotionReferenceStudy({
    ...value.options, focus: [{ endSeconds: 5.4, startSeconds: 4.1 }],
  }, value.dependencies);
  const expectedIds = [...unrelated.studies, ...refined.studies]
    .map(({ studyId }) => studyId).sort();
  assert.deepEqual(await fs.readdir(path.join(
    value.rootDir, "src", "app", "reference-studies",
  )), expectedIds);
});

test("group inventory fails closed on an unexplained previous directory", async (context) => {
  const value = await harness(context, { frameCount: 330, loopSeamScore: 1 });
  const initial = await createToolcraftMotionReferenceStudy(value.options, value.dependencies);
  const root = path.join(value.rootDir, "src", "app", "reference-studies");
  await fs.mkdir(path.join(root, "unexplained"));
  await assert.rejects(() => createToolcraftMotionReferenceStudy({
    ...value.options, focus: [{ endSeconds: 5.4, startSeconds: 4.1 }],
  }, value.dependencies), /inventory.*exactly|unexplained/iu);
  assert.deepEqual((await fs.readdir(root)).sort(), [
    ...initial.studies.map(({ studyId }) => studyId), "unexplained",
  ].sort());
  await fs.rm(path.join(root, "unexplained"), { recursive: true });
  await fs.symlink(path.join(root, initial.studies[0].studyId),
    path.join(root, "linked-study"), "dir");
  await assert.rejects(() => createToolcraftMotionReferenceStudy({
    ...value.options, focus: [{ endSeconds: 5.4, startSeconds: 4.1 }],
  }, value.dependencies), /inventory.*link|unexplained/iu);
});

test("a precommit failure restores only the complete obsolete-id group", async (context) => {
  const value = await harness(context, { frameCount: 330, loopSeamScore: 1 });
  const initial = await createToolcraftMotionReferenceStudy(value.options, value.dependencies);
  const root = path.join(value.rootDir, "src", "app", "reference-studies");
  let publications = 0;
  const fileSystem = {
    ...fs,
    rename: async (from, to) => {
      if (from.includes(`.staging${path.sep}`) &&
          path.dirname(to) === root && ++publications === 2) {
        throw new Error("controlled precommit failure");
      }
      return fs.rename(from, to);
    },
  };
  value.dependencies.fileSystem = fileSystem;
  value.dependencies.publishStudies = async (pairs, settings) =>
    publishToolcraftMotionReferenceStudies(pairs, {
      ...settings, fileSystem, lockLeaseMilliseconds: 500, now: () => 1_000,
    });
  await assert.rejects(() => createToolcraftMotionReferenceStudy({
    ...value.options, focus: [{ endSeconds: 5.4, startSeconds: 4.1 }],
  }, value.dependencies), /controlled precommit failure/iu);
  assert.deepEqual(await fs.readdir(root),
    initial.studies.map(({ studyId }) => studyId).sort());
});

test("crash recovery restores the complete old group at each retire and publish rename",
  async (context) => {
    for (let crashAt = 1; crashAt <= 4; crashAt += 1) {
      const value = await harness(context, { frameCount: 330, loopSeamScore: 1 });
      const initial = await createToolcraftMotionReferenceStudy(
        value.options, value.dependencies,
      );
      const root = path.join(value.rootDir, "src", "app", "reference-studies");
      const temporaryRoot = path.join(value.rootDir, ".toolcraft", "tmp");
      const transactionRoot = path.join(
        temporaryRoot, `${initial.referenceId}.transaction`,
      );
      let mutation = 0;
      let crashed = false;
      value.dependencies.fileSystem = {
        ...fs,
        rename: async (from, to) => {
          const dataMutation = path.dirname(to) === transactionRoot ||
            (from.includes(`.staging${path.sep}`) && path.dirname(to) === root) ||
            path.dirname(from) === transactionRoot;
          if (crashed && dataMutation) throw new Error("simulated process crash");
          if (dataMutation && ++mutation === crashAt) {
            await fs.rename(from, to);
            crashed = true;
            throw new Error("simulated process crash");
          }
          return fs.rename(from, to);
        },
      };
      value.dependencies.publishStudies = async (pairs, settings) =>
        publishToolcraftMotionReferenceStudies(pairs, {
          ...settings,
          fileSystem: value.dependencies.fileSystem,
          lockLeaseMilliseconds: 500,
          now: () => 1_000,
        });
      await assert.rejects(() => createToolcraftMotionReferenceStudy({
        ...value.options, focus: [{ endSeconds: 5.4, startSeconds: 4.1 }],
      }, value.dependencies), /simulated process crash/iu, `crash mutation ${crashAt}`);
      const journalPath = path.join(temporaryRoot,
        `${initial.referenceId}.lock.publication.json`);
      await recoverToolcraftMotionReferencePublication({
        artifactRoot: root,
        fileSystem: fs,
        heartbeat: async () => {},
        journalPath,
        sourceIdentity: initial.referenceId,
        temporaryRoot,
        token: `recovery-${crashAt}`,
        transactionRoot,
      });
      assert.deepEqual(await fs.readdir(root),
        initial.studies.map(({ studyId }) => studyId).sort());
      assert.equal(await fs.stat(journalPath).then(() => true, () => false), false);
    }
  });

test("cleans temporary output and preserves a checked scan stage", async (context) => {
  const value = await harness(context);
  value.dependencies.mediaSource = {
    ...value.dependencies.mediaSource,
    scan: async () => { throw new ToolcraftMotionReferenceStageError(
      TOOLCRAFT_MOTION_REFERENCE_STAGES.mediaScan, "controlled failure",
    ); },
  };
  await assert.rejects(() => createToolcraftMotionReferenceStudy(
    value.options, value.dependencies,
  ), (error) => error.stage === "media-scan");
  const temporaryRoot = path.join(value.rootDir, ".toolcraft", "tmp");
  assert.deepEqual(await fs.readdir(temporaryRoot), []);
});

test("normalizes a concurrent source hash failure without exposing its path", async (context) => {
  const value = await harness(context);
  value.dependencies.hashSource = async () => {
    throw new Error(`unreadable ${value.source}`);
  };
  await assert.rejects(() => createToolcraftMotionReferenceStudy(
    value.options, value.dependencies,
  ), (error) => error.stage === "source-hash");
  const errors = [];
  assert.equal(await main([
    "--source", value.source, "--kind", "video",
  ], value.dependencies, { error: (message) => errors.push(message), log: () => {} }), 1);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].includes(value.source), false);
});

test("returns an actionable bounded error for ordinal review above 120", async (context) => {
  const value = await harness(context, { frameCount: 121, sourceKind: "frame-sequence" });
  await assert.rejects(() => createToolcraftMotionReferenceStudy(
    value.options, value.dependencies,
  ), /ordinal.*120|120.*ordinal/iu);
  assert.equal(value.calls.materialize.length, 0);
  assert.equal(value.calls.publish, 0);
});

test("the production executor adapts captured stdout without parsing stderr", async () => {
  const calls = [];
  const execute = createToolcraftMotionReferenceExecutor({
    captureProcess: async (...args) => { calls.push(args); return "captured stdout"; },
    cwd: "/project",
  });
  assert.deepEqual(await execute({ args: ["-version"], binary: "ffmpeg",
    stage: "binary-detection" }), { stdout: "captured stdout" });
  assert.deepEqual(calls, [["ffmpeg", ["-version"], { cwd: "/project" }]]);
});
