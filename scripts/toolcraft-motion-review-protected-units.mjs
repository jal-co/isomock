import { toolcraftMotionSafeMidpoint } from "./toolcraft-motion-review-numeric.mjs";

function sortedUnique(indices) {
  return [...new Set(indices)].sort((left, right) => left - right);
}

export function toolcraftMotionIndexSetsOverlap(leftIndices, rightIndices) {
  let left = 0;
  let right = 0;
  while (left < leftIndices.length && right < rightIndices.length) {
    if (leftIndices[left] === rightIndices[right]) return true;
    if (leftIndices[left] < rightIndices[right]) left += 1;
    else right += 1;
  }
  return false;
}

export function toolcraftMotionCutSplitsIndices(indices, leftIndex) {
  return indices.length > 0 &&
    leftIndex >= indices[0] && leftIndex < indices.at(-1);
}

function unitsConnected(left, right, candidates) {
  if (toolcraftMotionIndexSetsOverlap(left.indices, right.indices)) return true;
  const overlapStart = Math.max(left.startSeconds, right.startSeconds);
  const overlapEnd = Math.min(left.endSeconds, right.endSeconds);
  if (overlapStart < overlapEnd) return true;
  if (overlapStart > overlapEnd) return false;
  return !candidates.some(({ boundary, leftIndex }) =>
    boundary === overlapStart &&
    !toolcraftMotionCutSplitsIndices(left.indices, leftIndex) &&
    !toolcraftMotionCutSplitsIndices(right.indices, leftIndex) &&
    ((left.indices.every((index) => index <= leftIndex) &&
      right.indices.every((index) => index > leftIndex)) ||
      (right.indices.every((index) => index <= leftIndex) &&
        left.indices.every((index) => index > leftIndex))));
}

function mergeUnits(units, candidates) {
  let components = [];
  for (const unit of units) {
    let merged = unit;
    while (true) {
      const connected = components.filter((component) =>
        unitsConnected(component, merged, candidates));
      if (connected.length === 0) break;
      const connectedSet = new Set(connected);
      components = components.filter((component) => !connectedSet.has(component));
      merged = {
        containsEvent: merged.containsEvent ||
          connected.some(({ containsEvent }) => containsEvent),
        containsFocus: merged.containsFocus ||
          connected.some(({ containsFocus }) => containsFocus),
        endSeconds: connected.reduce((end, component) =>
          Math.max(end, component.endSeconds), merged.endSeconds),
        indices: sortedUnique([
          ...merged.indices,
          ...connected.flatMap(({ indices }) => indices),
        ]),
        startSeconds: connected.reduce((start, component) =>
          Math.min(start, component.startSeconds), merged.startSeconds),
      };
    }
    components.push(merged);
  }
  return components.sort((left, right) => left.startSeconds - right.startSeconds ||
    (left.indices[0] ?? Number.MAX_SAFE_INTEGER) -
      (right.indices[0] ?? Number.MAX_SAFE_INTEGER));
}

export function createToolcraftMotionProtectedUnitModel({
  events,
  focusWindows,
  frameTimes,
  reviewFrameIndices,
}) {
  const seam = events.find(({ kind }) => kind === "loop-seam") ?? null;
  const candidates = reviewFrameIndices.slice(0, -1).map((leftIndex, position) => ({
    boundary: toolcraftMotionSafeMidpoint(
      frameTimes[leftIndex],
      frameTimes[reviewFrameIndices[position + 1]],
    ),
    leftIndex,
  }));
  const eventUnits = events.filter(({ kind }) => kind === "change").map((event) => {
    const indices = sortedUnique(event.frameIndices);
    return {
      containsEvent: true,
      containsFocus: false,
      endSeconds: frameTimes[indices.at(-1)],
      indices,
      startSeconds: frameTimes[indices[0]],
    };
  });
  const focusUnits = focusWindows.map((focus) => ({
    containsEvent: false,
    containsFocus: true,
    endSeconds: focus.endSeconds,
    indices: sortedUnique(focus.frameIndices),
    startSeconds: focus.startSeconds,
  }));
  return {
    seamIndices: seam === null ? [] : sortedUnique(seam.frameIndices),
    units: mergeUnits([...eventUnits, ...focusUnits], candidates),
  };
}

export function toolcraftMotionProtectedCapacityError(
  units,
  maximumFrameCount,
  reviewFrameCount,
) {
  const oversized = units.find(({ indices }) =>
    indices.length > maximumFrameCount);
  if (!oversized) return null;
  const code = oversized.containsEvent ? "event-window-too-large" :
    oversized.containsFocus ? "focus-window-too-large" :
      "protected-unit-too-large";
  return { code, kind: "error", reviewFrameCount };
}
