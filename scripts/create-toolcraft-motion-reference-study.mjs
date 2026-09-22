import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { captureToolcraftProofProcess } from "./toolcraft-proof-process.mjs";
import {
  createToolcraftMotionReferenceId,
  createToolcraftSha256,
} from "./toolcraft-motion-reference-artifacts.mjs";
import {
  parseToolcraftMotionReferenceArgs,
  resolveToolcraftMotionReferenceOptions,
  resolveToolcraftMotionReferenceSourceKind,
} from "./toolcraft-motion-reference-command-options.mjs";
import {
  createToolcraftMotionReferenceContactSheet,
} from "./toolcraft-motion-reference-contact-sheet.mjs";
import {
  createToolcraftMotionEvidenceReviewPlan,
  stageToolcraftMotionReferenceEvidences,
} from "./toolcraft-motion-reference-evidence-assembly.mjs";
import * as imageSource from "./toolcraft-motion-reference-image-source.mjs";
import {
  applyToolcraftMotionDeclaredImageTiming,
} from "./toolcraft-motion-reference-image-timing.mjs";
import {
  resolveToolcraftMotionReferenceRoots,
} from "./toolcraft-motion-reference-roots.mjs";
import * as mediaSource from "./toolcraft-motion-reference-media-source.mjs";
import {
  publishToolcraftMotionReferenceStudies,
} from "./toolcraft-motion-reference-publication.mjs";
import {
  createToolcraftMotionInputError,
  createToolcraftMotionStageError,
  formatToolcraftMotionReferenceError,
  runToolcraftMotionStage,
} from "./toolcraft-motion-reference-stage.mjs";
import {
  TOOLCRAFT_MOTION_REFERENCE_STAGES,
} from "./toolcraft-motion-reference-stage-registry.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.dirname(scriptDirectory);

export function createToolcraftMotionReferenceExecutor({
  captureProcess = captureToolcraftProofProcess,
  cwd,
} = {}) {
  return async ({ args, binary }) => {
    try {
      return { stdout: await captureProcess(binary, args, { cwd }) };
    } catch (error) {
      return { error, exitCode: 1 };
    }
  };
}

async function detectBinaries(execute) {
  await Promise.all(["ffmpeg", "ffprobe"].map((binary) =>
    runToolcraftMotionStage(execute, {
      args: ["-version"], binary,
      stage: TOOLCRAFT_MOTION_REFERENCE_STAGES.binaryDetection,
    })));
}

function selectSource(kind, dependencies) {
  switch (kind) {
    case "video":
    case "gif":
    case "screen-recording":
      return { hashExternally: true, image: false, owner: dependencies.mediaSource };
    case "contact-sheet":
      return { hashExternally: false, image: true, owner: dependencies.imageSource };
    case "frame-sequence":
      return { hashExternally: false, image: true, owner: dependencies.imageSource };
    default:
      throw createToolcraftMotionInputError(
        "Set --kind to video, gif, screen-recording, frame-sequence, or contact-sheet.",
      );
  }
}

async function defaultHashSource(source, fileSystem) {
  return createToolcraftSha256(await fileSystem.readFile(source));
}
async function hashSourceAtStage(hashSource, source, fileSystem) {
  try {
    return await hashSource(source, fileSystem);
  } catch (error) {
    throw createToolcraftMotionStageError(
      TOOLCRAFT_MOTION_REFERENCE_STAGES.sourceHash, error,
    );
  }
}

export async function createToolcraftMotionReferenceStudy(rawOptions, injected = {}) {
  const dependencies = {
    createContactSheet: createToolcraftMotionReferenceContactSheet,
    execute: createToolcraftMotionReferenceExecutor({ cwd: injected.rootDir ?? defaultRootDir }),
    fileSystem: fs,
    hashSource: defaultHashSource,
    imageSource,
    mediaSource,
    publishStudies: publishToolcraftMotionReferenceStudies,
    rootDir: defaultRootDir,
    ...injected,
  };
  const { referenceStudiesRoot: finalRoot, temporaryRoot } =
    resolveToolcraftMotionReferenceRoots(
      dependencies.rootDir,
    );
  await detectBinaries(dependencies.execute);
  const kind = await resolveToolcraftMotionReferenceSourceKind(rawOptions, {
    stat: dependencies.fileSystem.stat,
  });
  const selectedSource = selectSource(kind, dependencies);
  await dependencies.fileSystem.mkdir(temporaryRoot, { mode: 0o700, recursive: true });
  const workRoot = await dependencies.fileSystem.mkdtemp(
    path.join(temporaryRoot, "motion-reference-"),
  );
  try {
    const [initialInspection, externalHash] = await Promise.all([
      selectedSource.owner.inspect({
        execute: dependencies.execute,
        fileSystem: dependencies.fileSystem,
        grid: rawOptions.grid,
        inputPath: rawOptions.source,
        sourceKind: kind,
      }),
      selectedSource.hashExternally ?
        hashSourceAtStage(
          dependencies.hashSource, rawOptions.source, dependencies.fileSystem,
        ) :
        Promise.resolve(undefined),
    ]);
    const inspectedForResolution = selectedSource.image ?
      await applyToolcraftMotionDeclaredImageTiming(initialInspection, rawOptions, {
        readFile: dependencies.fileSystem.readFile,
      }) : initialInspection;
    const options = await resolveToolcraftMotionReferenceOptions(
      { ...rawOptions, kind }, inspectedForResolution,
    );
    const inspection = inspectedForResolution;
    const sourceSha256 = externalHash ?? inspection.sourceSha256;
    if (!/^[a-f0-9]{64}$/u.test(sourceSha256 ?? "")) {
      throw new TypeError("Toolcraft motion reference source hash is unavailable.");
    }
    const scan = await selectedSource.owner.scan({
      execute: dependencies.execute, inspection,
    });
    const review = createToolcraftMotionEvidenceReviewPlan(inspection, scan, options);
    const frameDirectory = path.join(workRoot, "frames");
    await dependencies.fileSystem.mkdir(frameDirectory);
    const materialized = await selectedSource.owner.materializeReviewedFrames({
      execute: dependencies.execute, inspection, outputDirectory: frameDirectory,
      sourceFrameIndices: review.unionSourceFrameIndices,
    });
    const materializedByIndex = new Map(materialized.map((frame) =>
      [frame.sourceFrameIndex, frame]));
    const provisionalStagingRoot = path.join(workRoot, "studies");
    await dependencies.fileSystem.mkdir(provisionalStagingRoot);
    let records = await stageToolcraftMotionReferenceEvidences({
      dependencies, inspection, materializedByIndex, options, review, scan,
      sourceSha256, stagingRoot: provisionalStagingRoot,
    });
    const referenceId = createToolcraftMotionReferenceId(records[0].evidence);
    const stagingRoot = path.join(workRoot, `${referenceId}.staging`);
    await dependencies.fileSystem.rename(provisionalStagingRoot, stagingRoot);
    records = records.map((record) => ({
      ...record,
      stagingDirectory: path.join(
        stagingRoot, path.basename(record.stagingDirectory),
      ),
    }));
    await dependencies.fileSystem.mkdir(finalRoot, { recursive: true });
    const studies = [];
    for (const { evidence, stagingDirectory } of records) {
      studies.push({
        contactSheetPath: evidence.contactSheet.path,
        evidence,
        evidencePath: path.posix.join("src/app/reference-studies",
          evidence.studyId, "evidence.json"),
        finalDirectory: path.join(finalRoot, evidence.studyId),
        range: evidence.segment ?? (evidence.timingMode === "seconds" ?
          { endSeconds: evidence.durationSeconds, startSeconds: 0 } : undefined),
        reviewedFrameCount: evidence.reviewedFrames.length,
        stagingDirectory,
        studyId: evidence.studyId,
      });
    }
    const publication = await dependencies.publishStudies(studies.map((study) => ({
      finalDirectory: study.finalDirectory,
      stagingDirectory: study.stagingDirectory,
    })), {
      lockDirectory: path.join(temporaryRoot, `${referenceId}.lock`),
      publicationGroup: {
        evidences: studies.map(({ evidence }) => evidence),
        referenceStudiesRoot: finalRoot,
        rootDir: dependencies.rootDir,
        stagingRoot,
      },
      sourceIdentity: referenceId,
    });
    return { publication, referenceId, studies: studies.map(({ finalDirectory,
      stagingDirectory, ...study }) => study) };
  } finally {
    await dependencies.fileSystem.rm(workRoot, { force: true, recursive: true });
  }
}

export async function main(argv = process.argv.slice(2), injected = {}, io = console) {
  try {
    const result = await createToolcraftMotionReferenceStudy(
      parseToolcraftMotionReferenceArgs(argv), injected,
    );
    io.log(`Reference: ${result.referenceId}`);
    result.studies.forEach((study) => {
      const range = study.range ?
        ` range ${study.range.startSeconds}:${study.range.endSeconds}` : "";
      io.log(`${study.studyId} ${study.evidencePath} ${study.contactSheetPath} ` +
        `${study.reviewedFrameCount} reviewed${range}`);
    });
    return 0;
  } catch (error) {
    io.error(formatToolcraftMotionReferenceError(error));
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await main();
}
