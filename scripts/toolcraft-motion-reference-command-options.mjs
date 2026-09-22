import fs from "node:fs/promises";
import path from "node:path";

import {
  createToolcraftMotionInputError,
} from "./toolcraft-motion-reference-stage.mjs";

const SOURCE_KINDS = new Set([
  "contact-sheet", "frame-sequence", "gif", "screen-recording", "video",
]);
const TIMED_CONTAINER_EXTENSIONS = new Set([
  ".avi", ".m4v", ".mkv", ".mov", ".mp4", ".mpeg", ".mpg", ".webm",
]);
const SINGLETONS = new Set([
  "--fps", "--grid", "--kind", "--segment", "--source", "--timestamps-file",
]);

function fail(message) {
  throw createToolcraftMotionInputError(message);
}

function flagValue(argv, index) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    fail(`${argv[index]} requires a value; provide one immediately after the flag.`);
  }
  return value;
}

function rangeValue(value, flag) {
  const match = /^([+]?(?:\d+(?:\.\d*)?|\.\d+)):([+]?(?:\d+(?:\.\d*)?|\.\d+))$/u
    .exec(value);
  const startSeconds = match ? Number(match[1]) : NaN;
  const endSeconds = match ? Number(match[2]) : NaN;
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) ||
      startSeconds < 0 || endSeconds <= startSeconds) {
    fail(`Provide ${flag} as a finite nonnegative start:end range with end after start.`);
  }
  return { endSeconds, startSeconds };
}

function gridValue(value) {
  const match = /^(\d+)x(\d+)$/u.exec(value);
  const columns = match ? Number(match[1]) : 0;
  const rows = match ? Number(match[2]) : 0;
  if (!Number.isSafeInteger(columns) || columns <= 0 ||
      !Number.isSafeInteger(rows) || rows <= 0) {
    fail("Provide --grid as positive integer columnsxrows, such as 6x4.");
  }
  return { columns, rows };
}

function positiveNumber(value, flag) {
  const number = Number(value);
  if (value.trim().length === 0 || !Number.isFinite(number) || number <= 0) {
    fail(`Provide ${flag} as a positive finite number.`);
  }
  return number;
}

function validateParsedOptions(options) {
  if (!options.source) fail("Provide --source as exactly one required absolute path.");
  if (!path.isAbsolute(options.source)) fail("Provide an absolute path with --source.");
  if (options.timestampsFile && !path.isAbsolute(options.timestampsFile)) {
    fail("Provide an absolute path with --timestamps-file.");
  }
  if (options.framesPerSecond !== undefined && options.timestampsFile) {
    fail("Choose exactly one timing authority for images: --fps or --timestamps-file.");
  }
  if (options.grid && options.kind !== "contact-sheet") {
    fail("Use --grid only with --kind contact-sheet.");
  }
  if (options.kind === "contact-sheet" && !options.grid) {
    fail("--grid is required when --kind is contact-sheet.");
  }
  if ((options.framesPerSecond !== undefined || options.timestampsFile) &&
      options.kind && options.kind !== "frame-sequence" &&
      options.kind !== "contact-sheet") {
    fail("Use timing for images only with frame-sequence or contact-sheet sources.");
  }
}

export function parseToolcraftMotionReferenceArgs(argv) {
  if (!Array.isArray(argv)) fail("Pass command arguments as an array.");
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const options = {};
  const seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (typeof flag !== "string" || !flag.startsWith("--")) {
      fail("Use supported --flag value argument pairs only.");
    }
    if (![...SINGLETONS, "--focus"].includes(flag)) {
      fail("Use only --source, --kind, --focus, --segment, --fps, --grid, and --timestamps-file.");
    }
    if (SINGLETONS.has(flag) && seen.has(flag)) {
      fail("Provide each single-value option only once.");
    }
    seen.add(flag);
    const value = flagValue(args, index);
    if (flag === "--source") options.source = value;
    if (flag === "--kind") {
      if (!SOURCE_KINDS.has(value)) {
        fail("Set --kind to video, gif, screen-recording, frame-sequence, or contact-sheet.");
      }
      options.kind = value;
    }
    if (flag === "--focus") {
      options.focus = [...(options.focus ?? []), rangeValue(value, "--focus range")];
    }
    if (flag === "--segment") options.segment = rangeValue(value, "--segment range");
    if (flag === "--grid") options.grid = gridValue(value);
    if (flag === "--fps") options.framesPerSecond = positiveNumber(value, "--fps");
    if (flag === "--timestamps-file") options.timestampsFile = value;
  }
  validateParsedOptions(options);
  return options;
}

export async function resolveToolcraftMotionReferenceSourceKind(
  parsed,
  { stat = fs.stat } = {},
) {
  validateParsedOptions(parsed);
  if (parsed.kind) return parsed.kind;
  let status;
  try {
    status = await stat(parsed.source);
  } catch (error) {
    throw createToolcraftMotionInputError(
      "Check that --source points to a readable file or directory.", error,
    );
  }
  if (status.isDirectory()) return "frame-sequence";
  const extension = path.extname(parsed.source).toLowerCase();
  if (extension === ".gif") return "gif";
  if (TIMED_CONTAINER_EXTENSIONS.has(extension)) return "video";
  fail("Explicitly set --kind for sources without a recognized media extension.");
}

function validateTimedRanges(parsed, durationSeconds, timingMode) {
  const ranges = [
    ...(parsed.segment ? [["segment", parsed.segment]] : []),
    ...(parsed.focus ?? []).map((range) => ["focus", range]),
  ];
  if (ranges.length > 0 && timingMode !== "seconds") {
    fail(`--${ranges[0][0]} requires --fps or --timestamps-file as an explicit timing authority for image sources.`);
  }
  for (const [label, range] of ranges) {
    if (!Number.isFinite(durationSeconds) || range.endSeconds > durationSeconds) {
      fail(`Keep --${label} within the inspected source duration.`);
    }
    if (parsed.segment && label === "focus" &&
        (range.startSeconds < parsed.segment.startSeconds ||
          range.endSeconds > parsed.segment.endSeconds)) {
      fail("Keep every --focus range within the selected --segment.");
    }
  }
}

export async function resolveToolcraftMotionReferenceOptions(
  parsed,
  inspectedSource,
) {
  validateParsedOptions(parsed);
  if (!inspectedSource || !Number.isSafeInteger(inspectedSource.decodedFrameCount) ||
      inspectedSource.decodedFrameCount <= 0 || !SOURCE_KINDS.has(inspectedSource.sourceKind)) {
    fail("Choose a readable source that contains at least one visual frame.");
  }
  if (parsed.kind && parsed.kind !== inspectedSource.sourceKind) {
    fail("Make --kind agree with the inspected source kind.");
  }
  if ((parsed.framesPerSecond !== undefined || parsed.timestampsFile) &&
      inspectedSource.sourceKind !== "frame-sequence" &&
      inspectedSource.sourceKind !== "contact-sheet") {
    fail("Use timing for images only with frame-sequence or contact-sheet sources.");
  }
  const timing = inspectedSource.timing;
  if (parsed.framesPerSecond !== undefined &&
      (timing?.authority !== "declared-fps" ||
       timing.framesPerSecond !== parsed.framesPerSecond) ||
      parsed.timestampsFile && timing?.authority !== "declared-timestamps") {
    fail("Apply declared image timing through --fps or --timestamps-file before range validation.");
  }
  const timingMode = inspectedSource.timingMode ??
    (["video", "gif", "screen-recording"].includes(inspectedSource.sourceKind) ?
      "seconds" : "ordinal");
  const durationSeconds = inspectedSource.durationSeconds;
  validateTimedRanges(parsed, durationSeconds, timingMode);
  return {
    ...parsed,
    kind: inspectedSource.sourceKind,
    ...(timing ? { timing } : {}),
  };
}
