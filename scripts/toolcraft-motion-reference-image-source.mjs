import fs from "node:fs/promises";
import path from "node:path";

import { createToolcraftSha256 } from "./toolcraft-motion-reference-artifacts.mjs";
import {
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
  createToolcraftMotionImageAnalysisArguments,
  createToolcraftMotionImageMaterializeArguments,
} from "./toolcraft-motion-reference-image-filter-graph.mjs";
import {
  createToolcraftMotionReviewOutputPath,
  createToolcraftMotionReviewOutputPattern,
  validateToolcraftMotionReviewFrameIndices,
} from "./toolcraft-motion-reference-review-output.mjs";
import {
  createToolcraftMotionInputError,
  createToolcraftMotionStageError,
  parseToolcraftMotionStage,
  runToolcraftMotionStage,
} from "./toolcraft-motion-reference-stage.mjs";
import {
  TOOLCRAFT_MOTION_REFERENCE_STAGES,
} from "./toolcraft-motion-reference-stage-registry.mjs";

const IMAGE_EXTENSIONS = new Set([
  ".bmp", ".jpeg", ".jpg", ".png", ".tif", ".tiff", ".webp",
]);

function validateSource(sourceKind, inputPath, execute) {
  if (sourceKind !== "frame-sequence" && sourceKind !== "contact-sheet") {
    throw createToolcraftMotionInputError(
      "Set --kind to frame-sequence or contact-sheet for image sources.",
    );
  }
  if (typeof inputPath !== "string" || inputPath.length === 0) {
    throw createToolcraftMotionInputError("Provide an absolute image path with --source.");
  }
  if (typeof execute !== "function") {
    throw new TypeError("Toolcraft image source executor is required.");
  }
}

function requireBytes(bytes, label) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw createToolcraftMotionInputError(
      `Choose a ${label} that contains readable image bytes.`,
    );
  }
  return bytes;
}

async function readSourceBytes(fileSystem, sourcePath) {
  try {
    return requireBytes(await fileSystem.readFile(sourcePath), "source");
  } catch (error) {
    throw createToolcraftMotionInputError(
      "Check that --source points to readable image content.", error,
    );
  }
}

async function enumerateSequence(inputPath, fileSystem) {
  let entries;
  try {
    entries = await fileSystem.readdir(inputPath, { withFileTypes: true });
  } catch (error) {
    throw createToolcraftMotionInputError(
      "Check that --source points to a readable frame-sequence directory.", error,
    );
  }
  const relativePaths = entries.flatMap((entry) => {
    const name = typeof entry === "string" ? entry : entry.name;
    const isFile = typeof entry === "string" || entry.isFile?.();
    return isFile && IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()) ? [name] : [];
  }).sort();
  if (relativePaths.length === 0) {
    throw createToolcraftMotionInputError(
      "Choose a frame-sequence directory containing at least one supported image.",
    );
  }
  const records = [];
  for (const relativePath of relativePaths) {
    const sourceLocator = path.join(inputPath, relativePath);
    const bytes = await readSourceBytes(fileSystem, sourceLocator);
    records.push({ bytes, relativePath, sourceLocator });
  }
  const identity = records.map(({ bytes, relativePath }) => ({
    byteLength: bytes.byteLength,
    relativePath: relativePath.split(path.sep).join("/"),
    sha256: createToolcraftSha256(bytes),
  }));
  return {
    frames: records.map(({ sourceLocator }, sourceFrameIndex) => ({
      sourceFrameIndex, sourceLocator,
    })),
    probePath: records[0].sourceLocator,
    sourceSha256: createToolcraftSha256(JSON.stringify(identity)),
  };
}

function validateGrid(grid, probe) {
  if (!grid || !Number.isInteger(grid.columns) || grid.columns <= 0 ||
      !Number.isInteger(grid.rows) || grid.rows <= 0) {
    throw createToolcraftMotionInputError(
      "Provide --grid as positive integer columnsxrows, such as 6x4.",
    );
  }
  if (probe.width % grid.columns !== 0 || probe.height % grid.rows !== 0) {
    throw createToolcraftMotionInputError(
      "Choose a --grid that evenly divides the contact-sheet dimensions.",
    );
  }
}

function contactFrames(inputPath, grid) {
  return Array.from({ length: grid.columns * grid.rows }, (_, sourceFrameIndex) => {
    const cell = {
      column: sourceFrameIndex % grid.columns,
      row: Math.floor(sourceFrameIndex / grid.columns),
    };
    return {
      cell,
      sourceFrameIndex,
      sourceLocator: `${inputPath}#cell=${cell.column},${cell.row}`,
    };
  });
}

export async function inspect(input) {
  if (Object.hasOwn(input ?? {}, "timing")) {
    throw new TypeError("Toolcraft image timing is applied after intrinsic inspection at the canonical boundary.");
  }
  const { execute, fileSystem = fs, grid, inputPath, sourceKind } = input ?? {};
  validateSource(sourceKind, inputPath, execute);
  const stage = TOOLCRAFT_MOTION_REFERENCE_STAGES.imageInspect;
  try {
    const source = sourceKind === "frame-sequence" ?
      await enumerateSequence(inputPath, fileSystem) : {
        probePath: inputPath,
        sourceBytes: await readSourceBytes(fileSystem, inputPath),
      };
    const probed = await runToolcraftMotionStage(execute, {
      args: createToolcraftMotionProbeArguments(source.probePath), binary: "ffprobe", stage,
    });
    const probe = parseToolcraftMotionStage(stage,
      () => parseToolcraftMotionFfprobeJson(probed.stdout));
    const version = await runToolcraftMotionStage(execute, {
      args: ["-version"], binary: "ffmpeg", stage,
    });
    const ffmpegVersion = parseToolcraftMotionStage(stage,
      () => normalizeToolcraftMotionToolVersion(version.stdout, "ffmpeg"));
    if (sourceKind === "contact-sheet") validateGrid(grid, probe);
    const frames = sourceKind === "frame-sequence" ? source.frames :
      contactFrames(inputPath, grid);
    const dimensions = sourceKind === "contact-sheet" ? {
      height: probe.height / grid.rows,
      sourceGrid: { columns: grid.columns, rows: grid.rows },
      width: probe.width / grid.columns,
    } : { height: probe.height, width: probe.width };
    return {
      decodedFrameCount: frames.length,
      ffmpegVersion,
      ffprobeVersion: probe.ffprobeVersion,
      frames,
      hasAlpha: probe.hasAlpha,
      inputPath,
      pixelFormat: probe.pixelFormat,
      sourceBasename: path.basename(inputPath),
      sourceKind,
      sourceSha256: sourceKind === "frame-sequence" ? source.sourceSha256 :
        createToolcraftSha256(source.sourceBytes),
      timingMode: "ordinal",
      ...dimensions,
    };
  } catch (error) {
    throw createToolcraftMotionStageError(stage, error);
  }
}

function parsedStats(stage, stdout, hasAlpha) {
  return parseToolcraftMotionStage(stage,
    () => parseToolcraftMotionSignalstats(stdout, { requireAlpha: hasAlpha }));
}

export async function scan(input) {
  if (Object.hasOwn(input ?? {}, "sourcePath")) {
    throw new TypeError("Toolcraft image scan sourcePath is not accepted; use inspection.inputPath.");
  }
  const { execute, inspection } = input ?? {};
  validateSource(inspection?.sourceKind, inspection?.inputPath, execute);
  const indices = inspection.frames.map((_, index) => index);
  const scanStage = TOOLCRAFT_MOTION_REFERENCE_STAGES.imageScan;
  const scanned = await runToolcraftMotionStage(execute, {
    args: createToolcraftMotionImageAnalysisArguments({ inspection, indices }),
    binary: "ffmpeg",
    stage: scanStage,
  });
  const records = parsedStats(scanStage, scanned.stdout, inspection.hasAlpha);
  const expectedTimes = inspection.timingMode === "ordinal" ? indices : inspection.frameTimes;
  parseToolcraftMotionStage(scanStage,
    () => validateToolcraftMotionScanRecordAgreement(records, expectedTimes));
  let seamRecords;
  if (inspection.decodedFrameCount > 1) {
    const seamStage = TOOLCRAFT_MOTION_REFERENCE_STAGES.imageLoopSeam;
    const seam = await runToolcraftMotionStage(execute, {
      args: createToolcraftMotionImageAnalysisArguments({
        indices: [indices.at(-1), 0], inspection, timelineMode: "loop-seam",
      }),
      binary: "ffmpeg",
      stage: seamStage,
    });
    seamRecords = parsedStats(seamStage, seam.stdout, inspection.hasAlpha);
  }
  const seamStage = inspection.decodedFrameCount > 1 ?
    TOOLCRAFT_MOTION_REFERENCE_STAGES.imageLoopSeam : scanStage;
  const loopSeamScore = parseToolcraftMotionStage(seamStage,
    () => createToolcraftMotionLoopSeamScore(
      inspection.decodedFrameCount, seamRecords,
    ));
  return parseToolcraftMotionStage(scanStage,
    () => createToolcraftMotionScanResult(records, loopSeamScore));
}

export async function materializeReviewedFrames(input) {
  if (Object.hasOwn(input ?? {}, "sourcePath")) {
    throw new TypeError("Toolcraft image materialize sourcePath is not accepted; use inspection.inputPath.");
  }
  const { execute, inspection, outputDirectory, sourceFrameIndices } = input ?? {};
  validateSource(inspection?.sourceKind, inspection?.inputPath, execute);
  validateToolcraftMotionReviewFrameIndices(
    sourceFrameIndices, inspection.decodedFrameCount,
  );
  const outputPattern = createToolcraftMotionReviewOutputPattern(outputDirectory);
  await runToolcraftMotionStage(execute, {
    args: createToolcraftMotionImageMaterializeArguments({
      inspection, outputPattern, sourceFrameIndices,
    }),
    binary: "ffmpeg",
    stage: TOOLCRAFT_MOTION_REFERENCE_STAGES.imageMaterialize,
  });
  return sourceFrameIndices.map((sourceFrameIndex, ordinal) => ({
    path: createToolcraftMotionReviewOutputPath(outputDirectory, ordinal),
    sourceFrameIndex,
    sourceLocator: inspection.frames[sourceFrameIndex].sourceLocator,
    ...(inspection.timingMode === "seconds" ? {
      timeSeconds: inspection.frameTimes[sourceFrameIndex],
    } : {}),
  }));
}
