export const TOOLCRAFT_MOTION_ANALYSIS_COMPONENT_MAX = 255;
export const TOOLCRAFT_MOTION_CHANGE_METRIC = "max-yuva-diff-v1";
export const TOOLCRAFT_MOTION_FFMPEG_TIMESTAMP_TOLERANCE_SECONDS = 1e-6;

const PROBE_SHOW_ENTRIES =
  "program_version=version:stream=codec_type,width,height,pix_fmt," +
  "avg_frame_rate,r_frame_rate,nb_frames,duration,start_time:" +
  "format=duration,start_time:" +
  "frame=best_effort_timestamp_time,pts_time:pixel_format=name,nb_components:" +
  "pixel_format_flags=alpha:pixel_format_components=index,bit_depth";

function fail(message) {
  throw new TypeError(`Invalid Toolcraft motion analysis protocol: ${message}`);
}

export function createToolcraftMotionProbeArguments(inputPath) {
  if (typeof inputPath !== "string" || inputPath.length === 0) {
    fail("an input path is required for probing");
  }
  return [
    "-v", "error", "-select_streams", "v:0",
    "-show_program_version", "-show_pixel_formats",
    "-show_streams", "-show_format", "-show_frames",
    "-show_entries", PROBE_SHOW_ENTRIES,
    "-of", "json", inputPath,
  ];
}

export function createToolcraftMotionAnalysisGraph(inputLabel, hasAlpha) {
  if (typeof inputLabel !== "string" || inputLabel.length === 0 ||
      typeof hasAlpha !== "boolean") {
    fail("an input label and alpha decision are required");
  }
  const color = "format=yuv444p,signalstats," +
    "metadata=mode=add:key=toolcraft.channel:value=color," +
    "metadata=print:file=-";
  if (!hasAlpha) return `${inputLabel}${color}[colorout]`;
  const alpha = "alphaextract,format=gray,signalstats," +
    "metadata=mode=add:key=toolcraft.channel:value=alpha," +
    "metadata=print:file=-";
  return `${inputLabel}split=2[colorSource][alphaSource];` +
    `[colorSource]${color}[colorout];[alphaSource]${alpha}[alphaout]`;
}

export function createToolcraftMotionAnalysisOutputArguments(hasAlpha) {
  if (typeof hasAlpha !== "boolean") fail("an alpha decision is required");
  return [
    "-map", "[colorout]",
    ...(hasAlpha ? ["-map", "[alphaout]"] : []),
    "-f", "null", "-",
  ];
}

export function toolcraftMotionTimestampsAgree(left, right) {
  return typeof left === "number" && Number.isFinite(left) &&
    typeof right === "number" && Number.isFinite(right) &&
    Math.abs(left - right) <= TOOLCRAFT_MOTION_FFMPEG_TIMESTAMP_TOLERANCE_SECONDS;
}

export function toolcraftMotionAnalysisChangeScore(record) {
  const values = [record?.yDifference, record?.uDifference, record?.vDifference,
    ...(record?.alphaDifference === undefined ? [] : [record.alphaDifference])];
  if (values.length < 3 || values.some((value) =>
    typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
      value > TOOLCRAFT_MOTION_ANALYSIS_COMPONENT_MAX)) {
    fail(`change components must be finite values between 0 and ${TOOLCRAFT_MOTION_ANALYSIS_COMPONENT_MAX}`);
  }
  return Math.max(...values) / TOOLCRAFT_MOTION_ANALYSIS_COMPONENT_MAX;
}

export function validateToolcraftMotionScanRecordAgreement(records, expectedTimes) {
  if (!Array.isArray(records) || !Array.isArray(expectedTimes) ||
      records.length !== expectedTimes.length || records.length === 0 ||
      records.some((record, index) => record?.frameIndex !== index ||
        !toolcraftMotionTimestampsAgree(record?.timeSeconds, expectedTimes[index]))) {
    fail("decoded frame count, index, timestamp, and score agreement is required");
  }
}

export function createToolcraftMotionLoopSeamScore(decodedFrameCount, records) {
  if (!Number.isInteger(decodedFrameCount) || decodedFrameCount <= 0) {
    fail("a positive decoded frame count is required");
  }
  if (decodedFrameCount === 1) {
    if (records !== undefined) fail("single-frame sources cannot include seam records");
    return 0;
  }
  if (!Array.isArray(records) || records.length !== 2) {
    fail("loop seam requires exactly two frame records");
  }
  if (records[0]?.frameIndex !== 0 || records[1]?.frameIndex !== 1 ||
      !(records[1]?.timeSeconds > records[0]?.timeSeconds)) {
    fail("loop seam frame indices must be 0 then 1 with increasing timestamps");
  }
  return toolcraftMotionAnalysisChangeScore(records[1]);
}

export function createToolcraftMotionScanResult(records, loopSeamScore) {
  if (!Array.isArray(records) || records.length === 0 ||
      typeof loopSeamScore !== "number" || !Number.isFinite(loopSeamScore) ||
      loopSeamScore < 0 || loopSeamScore > 1) {
    fail("scan records and a normalized loop seam score are required");
  }
  return {
    changeMetric: TOOLCRAFT_MOTION_CHANGE_METRIC,
    changeScores: records.map(toolcraftMotionAnalysisChangeScore),
    componentDifferences: records,
    loopSeamScore,
    scannedFrameCount: records.length,
  };
}
