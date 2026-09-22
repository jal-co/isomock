import {
  toolcraftMotionAbsoluteDifference,
  toolcraftMotionNearlyEqual,
  toolcraftMotionSafeMidpoint,
} from "./toolcraft-motion-review-numeric.mjs";
import {
  createToolcraftMotionProtectedUnitModel,
  toolcraftMotionCutSplitsIndices,
  toolcraftMotionIndexSetsOverlap,
  toolcraftMotionProtectedCapacityError,
} from "./toolcraft-motion-review-protected-units.mjs";

export const TOOLCRAFT_MOTION_MAX_REVIEW_FRAMES = 120;

function fail(message) {
  throw new TypeError(`Invalid Toolcraft motion review partition input: ${message}`);
}

function validateRange(range, label) {
  if (!range || !Number.isFinite(range.startSeconds) ||
      !Number.isFinite(range.endSeconds) ||
      range.endSeconds <= range.startSeconds) {
    fail(`${label} must have finite strictly increasing bounds`);
  }
}

function validateIndices(values, label, frameCount, allowEmpty = false) {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    fail(`${label} must be a ${allowEmpty ? "possibly empty" : "nonempty"} array`);
  }
  for (let position = 0; position < values.length; position += 1) {
    const index = values[position];
    if (!Number.isSafeInteger(index) || index < 0 || index >= frameCount) {
      fail(`${label} must contain safe indices within frame time bounds`);
    }
    if (position > 0 && index <= values[position - 1]) {
      fail(`${label} must be sorted unique`);
    }
  }
}

function validateLoopSeamIndices(values, frameCount) {
  if (!Array.isArray(values) || values.length === 0) {
    fail("loop seam frame indices must be a nonempty array");
  }
  const seen = new Set();
  for (const index of values) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= frameCount ||
        seen.has(index)) {
      fail("loop seam frame indices must contain unique safe indices within frame time bounds");
    }
    seen.add(index);
  }
  const lastIndex = frameCount - 1;
  const expected = [...new Set([lastIndex, 0, Math.min(1, lastIndex)])];
  if (values.length !== expected.length ||
      values.some((index, position) => index !== expected[position])) {
    fail("loop seam frame indices must match the exact cyclic source window");
  }
}

function validatePlannerInput(input) {
  if (!input || typeof input !== "object") fail("an object is required");
  const { events, focusWindows, frameTimes, range, reserveSeam,
    reviewFrameIndices } = input;
  if (!Array.isArray(frameTimes) || frameTimes.length === 0) {
    fail("frame times must be a nonempty array");
  }
  frameTimes.forEach((time, index) => {
    if (!Number.isFinite(time)) fail("frame times must contain only finite timestamps");
    if (index > 0 && time <= frameTimes[index - 1]) {
      fail("frame times must be strictly increasing");
    }
  });
  validateRange(range, "range");
  if (frameTimes.some((time) => time < range.startSeconds || time > range.endSeconds)) {
    fail("frame times must be within range");
  }
  if (typeof reserveSeam !== "boolean") fail("reserve seam must be boolean");
  validateIndices(reviewFrameIndices, "review frame indices", frameTimes.length);
  if (!Array.isArray(events)) fail("events must be an array");
  if (!Array.isArray(focusWindows)) fail("focus windows must be an array");
  const reviewSet = new Set(reviewFrameIndices);
  const eventIds = new Set();
  let seamCount = 0;
  for (const event of events) {
    if (!event || typeof event.eventId !== "string" || event.eventId.length === 0 ||
        eventIds.has(event.eventId)) {
      fail("event ids must be nonempty and unique");
    }
    eventIds.add(event.eventId);
    if (event.kind !== "change" && event.kind !== "loop-seam") {
      fail("event kind must be change or loop-seam");
    }
    if (event.kind === "loop-seam") {
      validateLoopSeamIndices(event.frameIndices, frameTimes.length);
    } else {
      validateIndices(event.frameIndices, "event frame indices", frameTimes.length);
    }
    if (!event.frameIndices.every((index) => reviewSet.has(index))) {
      fail("event frame indices must be closed over review frame indices");
    }
    if (event.kind === "loop-seam") seamCount += 1;
  }
  if (seamCount > 1) fail("at most one loop seam event is allowed");
  if (seamCount === 1 && !reserveSeam) {
    fail("loop seam event requires reserve seam metadata");
  }
  const focusIds = new Set();
  for (const focus of focusWindows) {
    if (!focus || typeof focus.focusWindowId !== "string" ||
        focus.focusWindowId.length === 0 || focusIds.has(focus.focusWindowId)) {
      fail("focus window ids must be nonempty and unique");
    }
    focusIds.add(focus.focusWindowId);
    validateRange(focus, "focus window range");
    if (focus.startSeconds < range.startSeconds ||
        focus.endSeconds > range.endSeconds) {
      fail("focus window range must be within range");
    }
    validateIndices(
      focus.frameIndices,
      "focus window frame indices",
      frameTimes.length,
      true,
    );
    if (!focus.frameIndices.every((index) => reviewSet.has(index))) {
      fail("focus window frame indices must be closed over review frame indices");
    }
  }
  return input;
}

function reviewError(code, reviewFrameCount) {
  return { code, kind: "error", reviewFrameCount };
}

function chooseCut({ capacity, first, frameTimes, indices, units }) {
  const lastCandidate = first + capacity - 1;
  let best = null;
  for (let position = first; position <= lastCandidate; position += 1) {
    const left = indices[position];
    const right = indices[position + 1];
    const boundary = toolcraftMotionSafeMidpoint(frameTimes[left], frameTimes[right]);
    if (units.some((unit) =>
      toolcraftMotionCutSplitsIndices(unit.indices, left) ||
      (boundary > unit.startSeconds && boundary < unit.endSeconds))) continue;
    const gap = toolcraftMotionAbsoluteDifference(frameTimes[right], frameTimes[left]);
    const wholeDistance = Math.abs(boundary - Math.round(boundary));
    const tiedGap = best !== null && toolcraftMotionNearlyEqual(gap, best.gap);
    if (!best || (gap > best.gap && !tiedGap) ||
        (tiedGap && wholeDistance < best.wholeDistance) ||
        (tiedGap && toolcraftMotionNearlyEqual(wholeDistance, best.wholeDistance) &&
          position > best.position)) {
      best = { boundary, gap, position, wholeDistance };
    }
  }
  return best;
}

function createMemberships({ frameTimes, range, reserved, reviewFrameIndices, units }) {
  const indices = reviewFrameIndices.filter((index) => !reserved.has(index));
  if (indices.length === 0) {
    return {
      cuts: [],
      memberships: [[...reserved].sort((left, right) => left - right)],
    };
  }
  const cuts = [];
  const slices = [];
  for (let first = 0; first < indices.length;) {
    const capacity = TOOLCRAFT_MOTION_MAX_REVIEW_FRAMES -
      (slices.length === 0 ? reserved.size : 0);
    if (indices.length - first <= capacity) {
      slices.push(indices.slice(first));
      break;
    }
    if (capacity === 0) {
      cuts.push(toolcraftMotionSafeMidpoint(
        range.startSeconds,
        frameTimes[indices[first]],
      ));
      slices.push([]);
      continue;
    }
    const best = chooseCut({ capacity, first, frameTimes, indices, units });
    if (!best) return null;
    cuts.push(best.boundary);
    slices.push(indices.slice(first, best.position + 1));
    first = best.position + 1;
  }
  const memberships = slices.map((slice, index) =>
    [...(index === 0 ? reserved : []), ...slice]
      .sort((left, right) => left - right));
  return { cuts, memberships };
}

export function createToolcraftMotionReviewPartitionPlan(sourceInput) {
  const input = validatePlannerInput(sourceInput);
  const { seamIndices, units } = createToolcraftMotionProtectedUnitModel(input);
  const capacityError = toolcraftMotionProtectedCapacityError(
    units,
    TOOLCRAFT_MOTION_MAX_REVIEW_FRAMES,
    input.reviewFrameIndices.length,
  );
  if (capacityError) return capacityError;
  const reserved = new Set(seamIndices);
  const remainingUnits = [];
  for (const unit of units) {
    if (seamIndices.length > 0 &&
        toolcraftMotionIndexSetsOverlap(seamIndices, unit.indices)) {
      unit.indices.forEach((index) => reserved.add(index));
    } else {
      remainingUnits.push(unit);
    }
  }
  const reservedError = toolcraftMotionProtectedCapacityError([{
    containsEvent: seamIndices.length > 0,
    containsFocus: false,
    indices: [...reserved],
  }], TOOLCRAFT_MOTION_MAX_REVIEW_FRAMES, input.reviewFrameIndices.length);
  if (reservedError) return reservedError;
  const membershipPlan = createMemberships({
    frameTimes: input.frameTimes,
    range: input.range,
    reserved,
    reviewFrameIndices: input.reviewFrameIndices,
    units: remainingUnits,
  });
  if (!membershipPlan) {
    return reviewError("protected-unit-too-large", input.reviewFrameIndices.length);
  }
  const { cuts, memberships } = membershipPlan;
  const boundaries = [input.range.startSeconds, ...cuts, input.range.endSeconds];
  if (boundaries.some((boundary, index) => !Number.isFinite(boundary) ||
      (index > 0 && boundary <= boundaries[index - 1]))) {
    return reviewError("protected-unit-too-large", input.reviewFrameIndices.length);
  }
  const partitions = memberships.map((reviewFrameIndices, index) => {
    const memberSet = new Set(reviewFrameIndices);
    return {
      endSeconds: boundaries[index + 1],
      eventIds: input.events.filter(({ frameIndices }) =>
        frameIndices.every((frameIndex) => memberSet.has(frameIndex)))
        .map(({ eventId }) => eventId),
      index,
      reviewFrameIndices,
      startSeconds: boundaries[index],
    };
  });
  if (units.some((unit) => !partitions.some(({ reviewFrameIndices }) =>
    unit.indices.every((index) => reviewFrameIndices.includes(index))))) {
    return reviewError("protected-unit-too-large", input.reviewFrameIndices.length);
  }
  const eventById = new Map(input.events.map((event) => [event.eventId, event]));
  const plannedEvents = partitions.flatMap(({ eventIds }) => eventIds)
    .map((eventId) => eventById.get(eventId));
  if (plannedEvents.length !== input.events.length) {
    return reviewError("protected-unit-too-large", input.reviewFrameIndices.length);
  }
  return {
    events: plannedEvents,
    focusWindows: input.focusWindows,
    kind: "partition-plan",
    partitions,
    reviewFrameCount: input.reviewFrameIndices.length,
  };
}
