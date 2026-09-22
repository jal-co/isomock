import {
  TOOLCRAFT_MOTION_ANALYSIS_COMPONENT_MAX,
  TOOLCRAFT_MOTION_FFMPEG_TIMESTAMP_TOLERANCE_SECONDS,
} from "./toolcraft-motion-reference-analysis-protocol.mjs";

function fail(message) {
  throw new TypeError(`Invalid Toolcraft motion FFmpeg output: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value, label) {
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    fail(`${label} must be finite`);
  }
  if (typeof value !== "string" ||
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(value.trim())) {
    fail(`${label} must be a finite locale-independent number`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) fail(`${label} must be finite`);
  return parsed;
}

function optionalFiniteNumber(value, label) {
  if (value === undefined || value === null || value === "" || value === "N/A") {
    return undefined;
  }
  return finiteNumber(value, label);
}

function positiveInteger(value, label) {
  const parsed = typeof value === "string" && /^\d+$/u.test(value) ?
    Number(value) : value;
  if (!Number.isInteger(parsed) || parsed <= 0) fail(`${label} must be positive`);
  return parsed;
}

function nominalFrameRate(value) {
  if (value === undefined || value === null || value === "" || value === "0/0") {
    return undefined;
  }
  const match = typeof value === "string" ?
    /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/u.exec(value.trim()) : null;
  if (!match) fail("visual stream frame rate must be a positive rational");
  const numerator = finiteNumber(match[1], "frame-rate numerator");
  const denominator = finiteNumber(match[2], "frame-rate denominator");
  if (numerator <= 0 || denominator <= 0) fail("visual stream frame rate must be positive");
  return numerator / denominator;
}

function pixelFormatHasAlpha(document, pixelFormat) {
  if (!Array.isArray(document.pixel_formats)) {
    fail("ffprobe pixel format descriptors are required");
  }
  const matches = document.pixel_formats.filter((descriptor) =>
    isRecord(descriptor) && descriptor.name === pixelFormat);
  if (matches.length === 0) fail(`pixel format descriptor ${pixelFormat} is missing`);
  if (matches.length > 1) fail(`duplicate pixel format descriptor ${pixelFormat}`);
  const descriptor = matches[0];
  if (!Number.isInteger(descriptor.nb_components) || descriptor.nb_components <= 0 ||
      !Array.isArray(descriptor.components) ||
      descriptor.components.length !== descriptor.nb_components ||
      descriptor.components.some((component) =>
        !isRecord(component) || !Number.isInteger(component.index) ||
        component.index <= 0 || !Number.isInteger(component.bit_depth) ||
        component.bit_depth <= 0)) {
    fail(`pixel format descriptor ${pixelFormat} has an invalid component model`);
  }
  if (!isRecord(descriptor.flags) ||
      descriptor.flags.alpha !== 0 && descriptor.flags.alpha !== 1) {
    fail(`pixel format descriptor ${pixelFormat} has an invalid alpha flag`);
  }
  return descriptor.flags.alpha === 1;
}

export function normalizeToolcraftMotionToolVersion(stdout, tool) {
  if (tool !== "ffmpeg" && tool !== "ffprobe") {
    fail("tool version owner must be ffmpeg or ffprobe");
  }
  if (typeof stdout !== "string") fail(`${tool} version output must be text`);
  const match = new RegExp(`^\\s*${tool}\\s+version\\s+([^\\s]+)`, "iu").exec(stdout);
  if (!match) fail(`${tool} version output is missing`);
  return `${tool} ${match[1]}`;
}

export function parseToolcraftMotionFfprobeJson(stdout) {
  let document;
  try {
    document = JSON.parse(stdout);
  } catch {
    fail("expected valid ffprobe JSON");
  }
  if (!isRecord(document)) {
    fail("ffprobe JSON must be an object");
  }
  const visualStream = Array.isArray(document.streams) ?
    document.streams.find((stream) =>
      isRecord(stream) && stream.codec_type === "video") :
    undefined;
  if (!visualStream) fail("a visual stream is required");
  const width = positiveInteger(visualStream.width, "visual stream width");
  const height = positiveInteger(visualStream.height, "visual stream height");
  if (!width || !height) fail("visual stream dimensions are required");
  if (typeof visualStream.pix_fmt !== "string" || visualStream.pix_fmt.length === 0) {
    fail("visual stream pixel format is required");
  }
  if (!Array.isArray(document.frames) || document.frames.length === 0) {
    fail("at least one decoded frame is required");
  }
  const decodedFrameTimes = document.frames.map((frame, index) => {
    if (!isRecord(frame)) fail(`decoded frame ${index} must be an object`);
    return finiteNumber(
      frame.best_effort_timestamp_time ?? frame.pts_time,
      `decoded frame ${index} timestamp`,
    );
  });
  decodedFrameTimes.forEach((time, index) => {
    if (index > 0 && time <= decodedFrameTimes[index - 1]) {
      fail("decoded frame timestamps must be strictly increasing");
    }
  });
  const timelineOrigin = decodedFrameTimes[0];
  const frameTimes = decodedFrameTimes.map((time) => time - timelineOrigin);
  const decodedFrameCount = frameTimes.length;
  if (visualStream.nb_frames !== undefined && visualStream.nb_frames !== "N/A" &&
      positiveInteger(visualStream.nb_frames, "visual stream frame count") !==
        decodedFrameCount) {
    fail("visual stream frame count must match decoded frame records");
  }
  const averageRate = nominalFrameRate(visualStream.avg_frame_rate);
  const rate = averageRate ?? nominalFrameRate(visualStream.r_frame_rate);
  const frameTail = rate ? 1 / rate : frameTimes.length > 1 ?
    frameTimes.at(-1) - frameTimes.at(-2) : 0;
  const decodedDuration = frameTimes.at(-1) + frameTail;
  const format = isRecord(document.format) ? document.format : {};
  const rawDuration = optionalFiniteNumber(
    format.duration ?? visualStream.duration, "visual duration",
  );
  const declaredStart = optionalFiniteNumber(
    format.start_time ?? visualStream.start_time, "visual start time",
  );
  let declaredDuration;
  if (rawDuration !== undefined) {
    if (declaredStart !== undefined && declaredStart > 0 &&
        rawDuration > decodedDuration +
          TOOLCRAFT_MOTION_FFMPEG_TIMESTAMP_TOLERANCE_SECONDS) {
      declaredDuration = rawDuration - declaredStart;
    } else if (declaredStart !== undefined ||
        rawDuration <= decodedDuration +
          TOOLCRAFT_MOTION_FFMPEG_TIMESTAMP_TOLERANCE_SECONDS ||
        Math.abs(timelineOrigin) <=
          TOOLCRAFT_MOTION_FFMPEG_TIMESTAMP_TOLERANCE_SECONDS) {
      declaredDuration = rawDuration;
    }
  }
  const durationSeconds = declaredDuration !== undefined &&
      decodedDuration - declaredDuration <=
        TOOLCRAFT_MOTION_FFMPEG_TIMESTAMP_TOLERANCE_SECONDS ?
    declaredDuration : Math.max(decodedDuration, declaredDuration ?? 0);
  if (!(durationSeconds > 0)) fail("visual duration must be positive");
  const rawVersion = isRecord(document.program_version) ?
    document.program_version.version : undefined;
  if (typeof rawVersion !== "string" || rawVersion.trim().length === 0) {
    fail("ffprobe version metadata is required");
  }
  return {
    decodedFrameCount,
    durationSeconds,
    ffprobeVersion: normalizeToolcraftMotionToolVersion(
      `ffprobe version ${rawVersion.trim()}`, "ffprobe",
    ),
    frameTimes,
    hasAlpha: pixelFormatHasAlpha(document, visualStream.pix_fmt),
    height,
    ...(rate === undefined ? {} : { nominalFrameRate: rate }),
    pixelFormat: visualStream.pix_fmt,
    width,
  };
}

function completeRecord(records, record) {
  if (!record) return;
  if (record.channel !== "color" && record.channel !== "alpha") {
    fail(`frame ${record.frameIndex} has an invalid channel`);
  }
  const key = `${record.channel}:${record.frameIndex}`;
  if (records.has(key)) fail(`duplicate ${record.channel} frame record ${record.frameIndex}`);
  records.set(key, record);
}

function parseSignalValue(record, key) {
  if (!record.values.has(key)) fail(`frame ${record.frameIndex} is missing ${key}`);
  const value = finiteNumber(record.values.get(key), `${key} for frame ${record.frameIndex}`);
  if (value < 0 || value > TOOLCRAFT_MOTION_ANALYSIS_COMPONENT_MAX) {
    fail(`${key} must be between 0 and ${TOOLCRAFT_MOTION_ANALYSIS_COMPONENT_MAX}`);
  }
  return value;
}

function sortedChannelRecords(records, channel) {
  const values = [...records.values()].filter((record) => record.channel === channel)
    .sort((left, right) => left.frameIndex - right.frameIndex);
  values.forEach((record, index) => {
    if (record.frameIndex !== index) fail(`missing frame record ${index} for ${channel}`);
  });
  return values;
}

export function parseToolcraftMotionSignalstats(stdout, { requireAlpha = false } = {}) {
  if (typeof stdout !== "string" || stdout.trim().length === 0) {
    fail("signalstats output is required");
  }
  const records = new Map();
  let current;
  for (const rawLine of stdout.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const header = /^frame:(\d+)\s+pts:\S+\s+pts_time:(\S+)$/u.exec(line);
    if (header) {
      completeRecord(records, current);
      current = {
        channel: "color",
        frameIndex: Number(header[1]),
        timeSeconds: finiteNumber(header[2], `frame ${header[1]} timestamp`),
        values: new Map(),
      };
      continue;
    }
    if (!current) fail("signalstats metadata appeared before a frame record");
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (key === "toolcraft.channel") {
      current.channel = value;
    } else if (key.startsWith("lavfi.signalstats.")) {
      if (current.values.has(key)) fail(`duplicate ${key} in frame ${current.frameIndex}`);
      current.values.set(key, value);
    }
  }
  completeRecord(records, current);
  const color = sortedChannelRecords(records, "color");
  if (color.length === 0) fail("at least one color frame record is required");
  const alpha = sortedChannelRecords(records, "alpha");
  if (requireAlpha && alpha.length !== color.length) {
    fail("one alpha record is required for every color frame");
  }
  if (alpha.length > 0 && alpha.length !== color.length) {
    fail("alpha and color frame counts must agree");
  }
  return color.map((record, index) => {
    if (index > 0 && record.timeSeconds <= color[index - 1].timeSeconds) {
      fail("frame timestamps must be strictly increasing");
    }
    const alphaRecord = alpha[index];
    if (alphaRecord && (alphaRecord.frameIndex !== record.frameIndex ||
        alphaRecord.timeSeconds !== record.timeSeconds)) {
      fail("alpha and color frame timestamps must agree");
    }
    return {
      ...(alphaRecord ? {
        alphaDifference: parseSignalValue(alphaRecord, "lavfi.signalstats.YDIF"),
      } : {}),
      frameIndex: record.frameIndex,
      timeSeconds: record.timeSeconds,
      uDifference: parseSignalValue(record, "lavfi.signalstats.UDIF"),
      vDifference: parseSignalValue(record, "lavfi.signalstats.VDIF"),
      yDifference: parseSignalValue(record, "lavfi.signalstats.YDIF"),
    };
  });
}
