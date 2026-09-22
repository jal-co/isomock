import {
  finite,
  hasExactKeys,
  isGroupId,
  isRecord,
  isSha256,
  nonnegativeInteger,
  positive,
  positiveInteger,
  requireValue,
} from "./motion-reference-evidence-validation.mjs";

function validateStrictRange(value, label, durationSeconds, errors) {
  if (!hasExactKeys(value, ["endSeconds", "startSeconds"], [], label, errors)) {
    return false;
  }
  const valid = finite(value.startSeconds) && value.startSeconds >= 0 &&
    finite(value.endSeconds) && value.endSeconds > value.startSeconds &&
    value.endSeconds <= durationSeconds;
  requireValue(valid,
    `${label} must satisfy 0 <= startSeconds < endSeconds <= durationSeconds.`,
    errors);
  return valid;
}
function validateAuthority(evidence, errors) {
  const authority = evidence.timing?.authority;
  const keys = authority === "declared-fps" ? ["authority", "framesPerSecond"] :
    authority === "declared-timestamps" ? ["authority", "timestampsSha256"] :
      ["authority"];
  const label = "timed motion reference evidence timing";
  if (!hasExactKeys(evidence.timing, keys, [], label, errors)) return;
  requireValue(["decoded-timestamps", "declared-fps", "declared-timestamps"]
    .includes(authority), `${label} authority is unsupported.`, errors);
  if (authority === "declared-fps") requireValue(
    positive(evidence.timing.framesPerSecond),
    "declared timing framesPerSecond must be positive and finite.", errors,
  );
  if (authority === "declared-timestamps") requireValue(
    isSha256(evidence.timing.timestampsSha256),
    "declared timing timestampsSha256 must be a lowercase SHA-256 hash.", errors,
  );
}
function validatePartition(evidence, segmentValid, errors) {
  const partition = evidence.reviewPartition;
  if (partition === undefined) return;
  const label = "timed motion reference evidence reviewPartition";
  if (!hasExactKeys(partition,
    ["count", "groupId", "index", "planSha256", "scope"], [], label, errors)) return;
  requireValue(positiveInteger(partition.count),
    `${label}.count must be a positive safe integer.`, errors);
  requireValue(nonnegativeInteger(partition.index) && partition.index < partition.count,
    `${label}.index must be within count.`, errors);
  requireValue(isGroupId(partition.groupId), `${label}.groupId is invalid.`, errors);
  requireValue(isSha256(partition.planSha256),
    `${label}.planSha256 must be a lowercase SHA-256 hash.`, errors);
  const scopeValid = validateStrictRange(
    partition.scope, `${label}.scope`, evidence.durationSeconds, errors,
  );
  requireValue(evidence.segment !== undefined,
    "partitioned timed motion reference evidence must declare a segment.", errors);
  if (scopeValid && segmentValid) requireValue(
    evidence.segment.startSeconds >= partition.scope.startSeconds &&
      evidence.segment.endSeconds <= partition.scope.endSeconds,
    `${label} segment must be contained within its partition scope.`, errors,
  );
}
function validateTimedShape(evidence, errors) {
  const durationValid = positive(evidence.durationSeconds);
  requireValue(durationValid,
    "timed motion reference evidence durationSeconds must be positive and finite.", errors);
  requireValue(positive(evidence.overviewTargetFps),
    "timed motion reference evidence overviewTargetFps must be positive and finite.", errors);
  requireValue(finite(evidence.maximumSourceFrameGapSeconds) &&
    evidence.maximumSourceFrameGapSeconds >= 0,
  "timed motion reference evidence maximumSourceFrameGapSeconds must be finite and nonnegative.", errors);
  if (evidence.nominalFrameRate !== undefined) requireValue(
    positive(evidence.nominalFrameRate),
    "timed motion reference evidence nominalFrameRate must be positive and finite.", errors,
  );
  requireValue(Array.isArray(evidence.focusWindows),
    "timed motion reference evidence focusWindows must be an array.", errors);
  validateAuthority(evidence, errors);
  const segmentValid = evidence.segment === undefined ? false :
    validateStrictRange(evidence.segment, "timed motion reference evidence segment",
      evidence.durationSeconds, errors);
  validatePartition(evidence, segmentValid, errors);
  return evidence.segment !== undefined && segmentValid ? evidence.segment :
    { endSeconds: durationValid ? evidence.durationSeconds : 0, startSeconds: 0 };
}
const EVENT_KEYS = [
  "afterFrameId", "beforeFrameId", "eventId", "kind", "peakFrameId", "score",
  "windowFrameIds",
];
function expectedLoopFrameIds(evidence) {
  const lastIndex = evidence.decodedFrameCount - 1;
  return [...new Set([
    `source-frame:${lastIndex}`, "source-frame:0",
    `source-frame:${Math.min(1, lastIndex)}`,
  ])];
}
function isExactLoopEvent(evidence, event, frames) {
  const shapeErrors = [];
  if (!hasExactKeys(event, EVENT_KEYS, [], "loop event", shapeErrors) ||
      shapeErrors.length > 0 || event.kind !== "loop-seam" ||
      !finite(event.score) || event.score < 0 || event.score > 1 ||
      !Array.isArray(event.windowFrameIds)) return false;
  const expectedIds = expectedLoopFrameIds(evidence);
  return expectedIds.every((frameId) => frames.has(frameId)) &&
    event.windowFrameIds.length === expectedIds.length &&
    event.windowFrameIds.every((frameId, index) => frameId === expectedIds[index]) &&
    event.beforeFrameId === expectedIds[0] &&
    event.peakFrameId === "source-frame:0" &&
    event.afterFrameId === expectedIds.at(-1) &&
    event.eventId === `motion-event:loop-seam:${expectedIds
      .map((frameId) => frames.get(frameId).sourceFrameIndex).join("-")}`;
}
function canonicalExternalSeamFrameIds(evidence, frames) {
  const partition = evidence.reviewPartition;
  const completePartitionZero = isRecord(evidence.segment) &&
    isRecord(partition) && isRecord(partition.scope) &&
    evidence.segment.startSeconds === 0 && partition?.index === 0 &&
    partition.scope?.startSeconds === 0 &&
    partition.scope?.endSeconds === evidence.durationSeconds;
  if (!completePartitionZero || !Array.isArray(evidence.detectedEvents)) {
    return new Set();
  }
  const loopEvent = evidence.detectedEvents.find((event) =>
    isExactLoopEvent(evidence, event, frames));
  if (!loopEvent) return new Set();
  return new Set(loopEvent.windowFrameIds.filter((frameId) => {
    const time = frames.get(frameId)?.timeSeconds;
    return finite(time) && (time < evidence.segment.startSeconds ||
      time > evidence.segment.endSeconds);
  }));
}
function validateFrameTimes(evidence, activeScope, externalSeamFrameIds, errors) {
  let previousTime = -Infinity;
  for (const [index, frame] of evidence.reviewedFrames.entries()) {
    if (!isRecord(frame)) continue;
    const inScope = finite(frame.timeSeconds) &&
      frame.timeSeconds >= activeScope.startSeconds &&
      frame.timeSeconds <= activeScope.endSeconds;
    requireValue(inScope || externalSeamFrameIds.has(frame.frameId),
      `motion reference evidence reviewedFrames[${index}].timeSeconds must be within the active timed scope.`,
      errors);
    requireValue(finite(frame.timeSeconds) && frame.timeSeconds > previousTime,
      `motion reference evidence reviewedFrames[${index}].timeSeconds must be strictly increasing.`,
      errors);
    if (finite(frame.timeSeconds)) previousTime = frame.timeSeconds;
  }
}
function validateOverview(evidence, frames, externalSeamFrameIds, errors) {
  if (!Array.isArray(evidence.overviewFrameIds) || evidence.overviewFrameIds.length === 0) {
    errors.push("motion reference evidence overviewFrameIds must be a nonempty array.");
    return;
  }
  if (Array.isArray(evidence.reviewedFrames) && evidence.reviewedFrames.length > 0) {
    requireValue(evidence.overviewFrameIds[0] === evidence.reviewedFrames[0]?.frameId,
      "motion reference evidence overviewFrameIds must include the first reviewed frame.", errors);
    requireValue(evidence.overviewFrameIds.at(-1) === evidence.reviewedFrames.at(-1)?.frameId,
      "motion reference evidence overviewFrameIds must include the last reviewed frame.", errors);
  }
  let previousIndex = -1;
  let previousTime;
  const seen = new Set();
  for (const frameId of evidence.overviewFrameIds) {
    const frame = frames.get(frameId);
    requireValue(frame !== undefined,
      `motion reference evidence overview has unknown frame ${String(frameId)}.`, errors);
    if (!frame) continue;
    requireValue(frame.sourceFrameIndex > previousIndex && !seen.has(frameId),
      "motion reference evidence overviewFrameIds must follow canonical reviewed-frame order.", errors);
    const externalSeamFrame = externalSeamFrameIds.has(frameId);
    if (!externalSeamFrame && evidence.timingMode === "seconds" &&
        previousTime !== undefined &&
        positive(evidence.overviewTargetFps) &&
        finite(evidence.maximumSourceFrameGapSeconds)) {
      const allowance = 1 / evidence.overviewTargetFps +
        evidence.maximumSourceFrameGapSeconds;
      requireValue(frame.timeSeconds - previousTime <= allowance + Number.EPSILON,
        "motion reference evidence overview timestamp gap exceeds its recorded density allowance.", errors);
    }
    previousIndex = frame.sourceFrameIndex;
    if (!externalSeamFrame) previousTime = frame.timeSeconds;
    seen.add(frameId);
  }
}
function validateChangeEvent(event, ids, sourceIndices, label, errors) {
  const contiguous = ids.length >= 3 && sourceIndices.every((value, index) =>
    nonnegativeInteger(value) && (index === 0 || value === sourceIndices[index - 1] + 1));
  requireValue(contiguous,
    `${label} change window must use strictly contiguous source-frame order.`, errors);
  requireValue(event.beforeFrameId === ids[0] && event.afterFrameId === ids.at(-1) &&
    ids.includes(event.peakFrameId),
  `${label} change window must bind before, peak, and after frames.`, errors);
  const peakIndex = sourceIndices[ids.indexOf(event.peakFrameId)];
  requireValue(nonnegativeInteger(peakIndex) && peakIndex > sourceIndices[0] &&
    peakIndex < sourceIndices.at(-1),
  `${label} change peak must be strictly interior to its frame window.`, errors);
}
function validateLoopEvent(evidence, event, ids, label, frames, errors) {
  requireValue(isExactLoopEvent(evidence, event, frames),
    `${label} loop-seam must use the exact cyclic source endpoint window.`, errors);
}
function validateEvents(evidence, frames, errors) {
  if (!Array.isArray(evidence.detectedEvents)) {
    errors.push("motion reference evidence detectedEvents must be an array.");
    return;
  }
  const seen = new Set();
  for (const [index, event] of evidence.detectedEvents.entries()) {
    const label = `motion reference evidence event[${index}]`;
    if (!hasExactKeys(event, EVENT_KEYS, [], label, errors)) continue;
    requireValue(event.kind === "change" || event.kind === "loop-seam",
      `${label}.kind is invalid.`, errors);
    requireValue(finite(event.score) && event.score >= 0 && event.score <= 1,
      `${label}.score must be within [0, 1].`, errors);
    const ids = Array.isArray(event.windowFrameIds) ? event.windowFrameIds : [];
    requireValue(ids.length > 0, `${label}.windowFrameIds must be nonempty.`, errors);
    for (const frameId of new Set([
      ...ids, event.beforeFrameId, event.peakFrameId, event.afterFrameId,
    ])) requireValue(frames.has(frameId),
      `${label} references unknown frame ${String(frameId)}.`, errors);
    const sourceIndices = ids.map((id) => frames.get(id)?.sourceFrameIndex);
    if (event.kind === "change") {
      validateChangeEvent(event, ids, sourceIndices, label, errors);
    } else if (event.kind === "loop-seam") {
      validateLoopEvent(evidence, event, ids, label, frames, errors);
    }
    requireValue(event.eventId ===
      `motion-event:${event.kind}:${sourceIndices.join("-")}`,
    `${label}.eventId must be canonical for its complete frame window.`, errors);
    requireValue(!seen.has(event.eventId), `${label}.eventId is duplicated.`, errors);
    seen.add(event.eventId);
  }
}
function validateFocusWindows(evidence, frames, activeScope, errors) {
  if (!Array.isArray(evidence.focusWindows)) return;
  let previousStartIndex = -1;
  for (const [index, focus] of evidence.focusWindows.entries()) {
    const label = `motion reference evidence focusWindows[${index}]`;
    if (!hasExactKeys(focus, ["endSeconds", "frameIds", "sourceFrameEndIndex",
      "sourceFrameStartIndex", "startSeconds"], [], label, errors)) continue;
    const rangeValid = finite(focus.startSeconds) && finite(focus.endSeconds) &&
      focus.startSeconds >= activeScope.startSeconds &&
      focus.endSeconds > focus.startSeconds &&
      focus.endSeconds <= activeScope.endSeconds;
    requireValue(rangeValid,
      `${label} must have positive duration bounded by the active timed scope.`, errors);
    if (!Array.isArray(focus.frameIds)) {
      errors.push(`${label}.frameIds must be a nonempty array.`);
      continue;
    }
    const derivedFrames = rangeValid && Array.isArray(evidence.reviewedFrames) ?
      evidence.reviewedFrames.filter((frame) => isRecord(frame) &&
        finite(frame.timeSeconds) && frame.timeSeconds >= focus.startSeconds &&
        frame.timeSeconds <= focus.endSeconds) : [];
    const derivedIds = derivedFrames.map(({ frameId }) => frameId);
    const sourceIndices = derivedFrames.map(({ sourceFrameIndex }) => sourceFrameIndex);
    requireValue(derivedIds.length > 0,
      `${label} must derive a nonempty reviewed-frame membership.`, errors);
    requireValue(focus.frameIds.length === derivedIds.length &&
      focus.frameIds.every((frameId, position) => frameId === derivedIds[position]),
    `${label}.frameIds must equal the exact ordered membership of reviewed frames in its timed range.`,
    errors);
    const contiguous = sourceIndices.length > 0 && sourceIndices.every((value, position) =>
      nonnegativeInteger(value) &&
      (position === 0 || value === sourceIndices[position - 1] + 1));
    requireValue(contiguous, `${label}.frameIds must cover contiguous source indices.`, errors);
    requireValue(focus.sourceFrameStartIndex === sourceIndices[0] &&
      focus.sourceFrameEndIndex === sourceIndices.at(-1),
    `${label} source bounds must match its first and last referenced frames.`, errors);
    requireValue(sourceIndices[0] >= previousStartIndex,
      `${label} must follow canonical source-frame order.`, errors);
    if (nonnegativeInteger(sourceIndices[0])) previousStartIndex = sourceIndices[0];
  }
}

export function validateToolcraftMotionReferenceTimingAndWindows(
  evidence,
  frames,
  errors,
) {
  let activeScope;
  let externalSeamFrameIds = new Set();
  if (evidence.timingMode === "ordinal") {
    requireValue(Array.isArray(evidence.focusWindows) && evidence.focusWindows.length === 0,
      "ordinal motion reference evidence focusWindows must be an empty array.", errors);
  } else if (evidence.timingMode === "seconds") {
    activeScope = validateTimedShape(evidence, errors);
    if (Array.isArray(evidence.reviewedFrames)) {
      externalSeamFrameIds = canonicalExternalSeamFrameIds(evidence, frames);
      validateFrameTimes(evidence, activeScope, externalSeamFrameIds, errors);
    }
  }
  validateOverview(evidence, frames, externalSeamFrameIds, errors);
  validateEvents(evidence, frames, errors);
  if (evidence.timingMode === "seconds") {
    validateFocusWindows(evidence, frames, activeScope, errors);
  }
}
