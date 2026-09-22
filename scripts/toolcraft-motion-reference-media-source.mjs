import path from "node:path";

import {
  createToolcraftMotionAnalysisGraph,
  createToolcraftMotionAnalysisOutputArguments,
  createToolcraftMotionLoopSeamScore,
  createToolcraftMotionProbeArguments,
  createToolcraftMotionScanResult,
  validateToolcraftMotionScanRecordAgreement,
} from "./toolcraft-motion-reference-analysis-protocol.mjs";
import {
  normalizeToolcraftMotionToolVersion,
  parseToolcraftMotionFfprobeJson,
  parseToolcraftMotionSignalstats,
} from "./toolcraft-motion-reference-ffmpeg-output.mjs";
import {
  createToolcraftMotionReviewOutputPath,
  createToolcraftMotionReviewOutputPattern,
  validateToolcraftMotionReviewFrameIndices,
} from "./toolcraft-motion-reference-review-output.mjs";
import {
  parseToolcraftMotionStage,
  runToolcraftMotionStage,
} from "./toolcraft-motion-reference-stage.mjs";
import {
  TOOLCRAFT_MOTION_REFERENCE_STAGES,
} from "./toolcraft-motion-reference-stage-registry.mjs";

const MEDIA_KINDS = new Set(["video", "gif", "screen-recording"]);

function validateSource(sourceKind, inputPath, execute) {
  if (!MEDIA_KINDS.has(sourceKind)) {
    throw new TypeError("Toolcraft media source kind must be video, gif, or screen-recording.");
  }
  if (typeof inputPath !== "string" || inputPath.length === 0) {
    throw new TypeError("Toolcraft media source path is required.");
  }
  if (typeof execute !== "function") {
    throw new TypeError("Toolcraft media source executor is required.");
  }
}

export async function inspect({ execute, inputPath, sourceKind }) {
  validateSource(sourceKind, inputPath, execute);
  const stage = TOOLCRAFT_MOTION_REFERENCE_STAGES.mediaInspect;
  const probe = await runToolcraftMotionStage(execute, {
    args: createToolcraftMotionProbeArguments(inputPath), binary: "ffprobe", stage,
  });
  const inspection = parseToolcraftMotionStage(stage,
    () => parseToolcraftMotionFfprobeJson(probe.stdout));
  const version = await runToolcraftMotionStage(execute, {
    args: ["-version"], binary: "ffmpeg", stage,
  });
  const ffmpegVersion = parseToolcraftMotionStage(stage,
    () => normalizeToolcraftMotionToolVersion(version.stdout, "ffmpeg"));
  return {
    ...inspection,
    ffmpegVersion,
    inputPath,
    sourceBasename: path.basename(inputPath),
    sourceKind,
    timingMode: "seconds",
  };
}

function scanArguments(inputPath, hasAlpha) {
  return [
    "-loglevel", "error", "-nostats", "-i", inputPath,
    "-filter_complex", createToolcraftMotionAnalysisGraph("[0:v]", hasAlpha),
    ...createToolcraftMotionAnalysisOutputArguments(hasAlpha),
  ];
}

function seamArguments(inspection) {
  const lastIndex = inspection.decodedFrameCount - 1;
  const filter = "[0:v]split=2[lastSource][firstSource];" +
    `[lastSource]select='eq(n,${lastIndex})',` +
    "setpts=PTS-STARTPTS[lastFrame];" +
    "[firstSource]select='eq(n,0)',setpts=PTS-STARTPTS[firstFrame];" +
    "[lastFrame][firstFrame]concat=n=2:v=1:a=0," +
    "settb=AVTB,setpts=N/TB[analysis];" +
    createToolcraftMotionAnalysisGraph("[analysis]", inspection.hasAlpha);
  return [
    "-loglevel", "error", "-nostats", "-i", inspection.inputPath,
    "-filter_complex", filter,
    ...createToolcraftMotionAnalysisOutputArguments(inspection.hasAlpha),
  ];
}

function parseStats(stage, stdout, requireAlpha) {
  return parseToolcraftMotionStage(stage,
    () => parseToolcraftMotionSignalstats(stdout, { requireAlpha }));
}
function zeroBasedRecords(records) {
  const origin = records[0].timeSeconds;
  return records.map((record) => ({
    ...record,
    timeSeconds: record.timeSeconds - origin,
  }));
}

export async function scan(input) {
  if (Object.hasOwn(input ?? {}, "sourcePath")) {
    throw new TypeError("Toolcraft media scan sourcePath is not accepted; use inspection.inputPath.");
  }
  const { execute, inspection } = input ?? {};
  validateSource(inspection?.sourceKind, inspection?.inputPath, execute);
  const scanStage = TOOLCRAFT_MOTION_REFERENCE_STAGES.mediaScan;
  const scanned = await runToolcraftMotionStage(execute, {
    args: scanArguments(inspection.inputPath, inspection.hasAlpha),
    binary: "ffmpeg",
    stage: scanStage,
  });
  const records = zeroBasedRecords(
    parseStats(scanStage, scanned.stdout, inspection.hasAlpha),
  );
  parseToolcraftMotionStage(scanStage,
    () => validateToolcraftMotionScanRecordAgreement(records, inspection.frameTimes));
  let seamRecords;
  if (inspection.decodedFrameCount > 1) {
    const seamStage = TOOLCRAFT_MOTION_REFERENCE_STAGES.mediaLoopSeam;
    const seam = await runToolcraftMotionStage(execute, {
      args: seamArguments(inspection),
      binary: "ffmpeg",
      stage: seamStage,
    });
    seamRecords = parseStats(seamStage, seam.stdout, inspection.hasAlpha);
  }
  const seamStage = inspection.decodedFrameCount > 1 ?
    TOOLCRAFT_MOTION_REFERENCE_STAGES.mediaLoopSeam : scanStage;
  const loopSeamScore = parseToolcraftMotionStage(seamStage,
    () => createToolcraftMotionLoopSeamScore(
      inspection.decodedFrameCount, seamRecords,
    ));
  return parseToolcraftMotionStage(scanStage,
    () => createToolcraftMotionScanResult(records, loopSeamScore));
}

export async function materializeReviewedFrames(input) {
  if (Object.hasOwn(input ?? {}, "sourcePath")) {
    throw new TypeError("Toolcraft media materialize sourcePath is not accepted; use inspection.inputPath.");
  }
  const { execute, inspection, outputDirectory, sourceFrameIndices } = input ?? {};
  validateSource(inspection?.sourceKind, inspection?.inputPath, execute);
  validateToolcraftMotionReviewFrameIndices(
    sourceFrameIndices, inspection.decodedFrameCount,
  );
  const outputPattern = createToolcraftMotionReviewOutputPattern(outputDirectory);
  const expression = sourceFrameIndices.map((index) => `eq(n\\,${index})`).join("+");
  await runToolcraftMotionStage(execute, {
    args: [
      "-loglevel", "error", "-i", inspection.inputPath,
      "-vf", `select='${expression}'`,
      "-fps_mode", "vfr", "-start_number", "0", outputPattern,
    ],
    binary: "ffmpeg",
    stage: TOOLCRAFT_MOTION_REFERENCE_STAGES.mediaMaterialize,
  });
  return sourceFrameIndices.map((sourceFrameIndex, ordinal) => ({
    path: createToolcraftMotionReviewOutputPath(outputDirectory, ordinal),
    sourceFrameIndex,
    sourceLocator: `${inspection.inputPath}#frame=${sourceFrameIndex}`,
    timeSeconds: inspection.frameTimes[sourceFrameIndex],
  }));
}
