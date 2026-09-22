import {
  createToolcraftMotionReviewPartitionPlan,
  TOOLCRAFT_MOTION_MAX_REVIEW_FRAMES,
} from "./toolcraft-motion-review-partitioning.mjs";
import {
  toolcraftMotionAbsoluteDifference,
  toolcraftMotionNearlyEqual,
  toolcraftMotionRobustThreshold,
} from "./toolcraft-motion-review-numeric.mjs";

export { TOOLCRAFT_MOTION_MAX_REVIEW_FRAMES };
export const TOOLCRAFT_MOTION_OVERVIEW_FPS = 12;

function fail(message) {
  throw new TypeError(`Invalid Toolcraft motion reference sampling input: ${message}`);
}
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function validateScores(changeScores) {
  if (!Array.isArray(changeScores) || changeScores.length === 0) {
    fail("at least one source frame and change score is required");
  }
  for (const score of changeScores) {
    if (!isFiniteNumber(score)) fail("change scores must be finite");
    if (score < 0) fail("change scores must be nonnegative");
  }
  return changeScores;
}
function validateRange(range, name) {
  if (!range || !isFiniteNumber(range.startSeconds) ||
      !isFiniteNumber(range.endSeconds)) {
    fail(`${name} must have finite second bounds`);
  }
  if (range.endSeconds <= range.startSeconds) {
    fail(`${name} must be a positive range`);
  }
  return {
    endSeconds: range.endSeconds,
    startSeconds: range.startSeconds,
  };
}
function validateLoopSeamScore(loopSeamScore) {
  if (loopSeamScore !== undefined &&
      (!isFiniteNumber(loopSeamScore) || loopSeamScore < 0)) {
    fail("loop seam score must be finite and nonnegative");
  }
}

function normalizeInput(input) {
  if (!input || typeof input !== "object") fail("an input object is required");
  const changeScores = validateScores(input.changeScores);
  validateLoopSeamScore(input.loopSeamScore);
  if (input.timingMode === "ordinal") {
    if (!Number.isInteger(input.frameCount) || input.frameCount <= 0 ||
        input.frameCount !== changeScores.length) {
      fail("ordinal frame count must equal the change score count");
    }
    for (const key of ["frameTimes", "focusWindows", "range", "sourceRange",
      "nominalFrameRate"]) {
      if (key in input) fail(`ordinal input cannot include ${key}`);
    }
    return { ...input, changeScores, frameCount: input.frameCount };
  }
  if (input.timingMode !== "seconds") {
    fail('timingMode must be "seconds" or "ordinal"');
  }
  if (!Array.isArray(input.frameTimes) ||
      input.frameTimes.length !== changeScores.length) {
    fail("frame times and change scores must have equal length");
  }
  input.frameTimes.forEach((time, index) => {
    if (!isFiniteNumber(time)) fail("frame timestamps must be finite");
    if (index > 0 && time <= input.frameTimes[index - 1]) {
      fail("frame timestamps must be strictly increasing");
    }
  });
  if (input.nominalFrameRate !== undefined &&
      (!isFiniteNumber(input.nominalFrameRate) || input.nominalFrameRate <= 0)) {
    fail("nominal frame rate must be positive and finite");
  }
  const range = validateRange(input.range, "inspected range");
  const sourceRange = validateRange(input.sourceRange, "source range");
  if (range.startSeconds < sourceRange.startSeconds ||
      range.endSeconds > sourceRange.endSeconds) {
    fail("inspected range must be within the complete source range");
  }
  if (input.frameTimes.some((time) =>
    time < range.startSeconds || time > range.endSeconds)) {
    fail("frame timestamps must be bounded by the inspected range");
  }
  const focusWindows = input.focusWindows ?? [];
  if (!Array.isArray(focusWindows)) fail("focus windows must be an array");
  const normalizedFocus = focusWindows.map((focus) => {
    const value = validateRange(focus, "focus window");
    if (value.startSeconds < range.startSeconds ||
        value.endSeconds > range.endSeconds) {
      fail("focus window must be within the inspected range");
    }
    return value;
  });
  return {
    ...input,
    changeScores,
    focusWindows: normalizedFocus,
    frameTimes: [...input.frameTimes],
    range,
    sourceRange,
  };
}

function localMaximumPlateaus(scores) {
  const plateaus = [];
  for (let start = 0; start < scores.length;) {
    let end = start;
    while (end + 1 < scores.length &&
        toolcraftMotionNearlyEqual(scores[end + 1], scores[start])) {
      end += 1;
    }
    if (start > 0 && end < scores.length - 1 && scores[start] > 0 &&
        scores[start] > scores[start - 1] && scores[end] > scores[end + 1]) {
      plateaus.push({ end, score: scores[start], start });
    }
    start = end + 1;
  }
  return plateaus;
}
function selectedPlateaus(input) {
  const candidates = localMaximumPlateaus(input.changeScores);
  const threshold = toolcraftMotionRobustThreshold(input.changeScores);
  const selected = new Set(candidates.filter(({ score }) =>
    score >= threshold)
    .map(({ start }) => start));
  if (input.timingMode === "seconds") {
    const strongestByBucket = new Map();
    for (const plateau of candidates) {
      const bucket = Math.floor(
        input.frameTimes[plateau.start] - input.range.startSeconds,
      );
      const previous = strongestByBucket.get(bucket);
      if (!previous || plateau.score > previous.score) {
        strongestByBucket.set(bucket, plateau);
      }
    }
    for (const plateau of strongestByBucket.values()) selected.add(plateau.start);
  }
  return candidates.filter(({ start }) => selected.has(start));
}

function frameId(index) {
  return `source-frame:${index}`;
}
function createEvent(kind, score, peakFrameIndex, sourceIndices) {
  const frameIndices = [...new Set(sourceIndices)];
  return {
    eventId: `motion-event:${kind}:${frameIndices.join("-")}`,
    frameIds: frameIndices.map(frameId),
    frameIndices,
    kind,
    peakFrameId: frameId(peakFrameIndex),
    peakFrameIndex,
    score,
  };
}
function eventFromPlateau(plateau, lastIndex) {
  const windowStart = Math.max(0, plateau.start - 1);
  const windowEnd = Math.min(lastIndex, plateau.end + 1);
  const frameIndices = Array.from(
    { length: windowEnd - windowStart + 1 },
    (_, offset) => windowStart + offset,
  );
  return createEvent("change", plateau.score, plateau.start, frameIndices);
}
function createEvents(input) {
  const lastIndex = input.changeScores.length - 1;
  const events = selectedPlateaus(input).map((plateau) =>
    eventFromPlateau(plateau, lastIndex));
  const isComplete = input.timingMode === "ordinal" ||
    (input.range.startSeconds === input.sourceRange.startSeconds &&
      input.range.endSeconds === input.sourceRange.endSeconds);
  if (isComplete && input.loopSeamScore > 0 &&
      input.loopSeamScore >= toolcraftMotionRobustThreshold(input.changeScores)) {
    const frameIndices = [lastIndex, 0, Math.min(1, lastIndex)];
    events.push(createEvent(
      "loop-seam",
      input.loopSeamScore,
      0,
      frameIndices,
    ));
  }
  return events;
}

function nearestFrameIndex(frameTimes, target, cursor) {
  while (cursor.index + 1 < frameTimes.length &&
      toolcraftMotionAbsoluteDifference(frameTimes[cursor.index + 1], target) <
        toolcraftMotionAbsoluteDifference(frameTimes[cursor.index], target)) {
    cursor.index += 1;
  }
  return cursor.index;
}
function overviewIndices(input) {
  if (input.timingMode === "ordinal") {
    return Array.from({ length: input.frameCount }, (_, index) => index);
  }
  const targetOffsetCount = Math.ceil(
    (input.range.endSeconds - input.range.startSeconds) *
      TOOLCRAFT_MOTION_OVERVIEW_FPS,
  );
  if (input.frameTimes.length <= targetOffsetCount + 1) {
    return input.frameTimes.map((_, index) => index);
  }
  const cursor = { index: 0 };
  const selected = new Set([0, input.frameTimes.length - 1]);
  for (let offset = 0; offset <= targetOffsetCount; offset += 1) {
    const target = Math.min(
      input.range.endSeconds,
      input.range.startSeconds + offset / TOOLCRAFT_MOTION_OVERVIEW_FPS,
    );
    selected.add(nearestFrameIndex(input.frameTimes, target, cursor));
  }
  return [...selected].sort((left, right) => left - right);
}

function normalizeFocusWindows(input) {
  if (input.timingMode === "ordinal") return [];
  return input.focusWindows.map((focus, focusIndex) => ({
    ...focus,
    frameIndices: input.frameTimes.flatMap((time, frameIndex) =>
      time >= focus.startSeconds && time <= focus.endSeconds ? [frameIndex] : []),
    focusWindowId: `motion-focus-window:${focusIndex}`,
  }));
}

export function createToolcraftMotionReviewSelection(sourceInput) {
  const input = normalizeInput(sourceInput);
  const overviewFrameIndices = overviewIndices(input);
  const events = createEvents(input);
  const focusWindows = normalizeFocusWindows(input);
  const reviewFrameIndices = [...new Set([
    ...overviewFrameIndices,
    ...events.flatMap(({ frameIndices }) => frameIndices),
    ...focusWindows.flatMap(({ frameIndices }) => frameIndices),
    0,
    input.changeScores.length - 1,
  ])].sort((left, right) => left - right);
  if (input.timingMode === "ordinal" &&
      reviewFrameIndices.length > TOOLCRAFT_MOTION_MAX_REVIEW_FRAMES) {
    return {
      code: "ordinal-review-too-large",
      kind: "error",
      reviewFrameCount: reviewFrameIndices.length,
    };
  }
  if (input.timingMode === "seconds" &&
      reviewFrameIndices.length > TOOLCRAFT_MOTION_MAX_REVIEW_FRAMES) {
    const partitionPlan = createToolcraftMotionReviewPartitionPlan({
      events,
      focusWindows,
      frameTimes: input.frameTimes,
      range: input.range,
      reserveSeam:
        input.range.startSeconds === input.sourceRange.startSeconds &&
        input.range.endSeconds === input.sourceRange.endSeconds,
      reviewFrameIndices,
    });
    return partitionPlan.kind === "partition-plan" ? {
      ...partitionPlan,
      overviewFrameIds: overviewFrameIndices.map(frameId),
      overviewFrameIndices,
    } : partitionPlan;
  }
  return {
    events,
    focusWindows,
    kind: "selection",
    overviewFrameIds: overviewFrameIndices.map(frameId),
    overviewFrameIndices,
    reviewFrameCount: reviewFrameIndices.length,
    reviewFrameIds: reviewFrameIndices.map(frameId),
    reviewFrameIndices,
  };
}
