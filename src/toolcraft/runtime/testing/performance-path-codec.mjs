import { TOOLCRAFT_PERFORMANCE_PROFILE_MANIFEST } from "../performance/profile-catalog-manifest.mjs";

const interactionProfiles = Object.freeze({
  "animation-frame": "interactive-continuous",
  "control-change": "interactive-discrete",
  "control-drag": "interactive-continuous",
  export: "batch-responsive",
  "initial-render": "initial-render",
  "mask-drag": "interactive-continuous",
  "media-import": "batch-responsive",
  "timeline-playback": "interactive-continuous",
  "timeline-scrub": "interactive-continuous",
  "viewport-drag": "interactive-continuous",
  "viewport-zoom": "interactive-continuous",
});
const runLocations = new Set([
  "export-only",
  "gpu",
  "main",
  "worker",
  "worker-or-gpu",
]);
const profileNames = new Set(TOOLCRAFT_PERFORMANCE_PROFILE_MANIFEST.names);

export const TOOLCRAFT_PIPELINE_INTERACTIONS = Object.freeze(
  Object.keys(interactionProfiles),
);

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isTrimmedString(value) {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function isCanonicalStringArray(value, allowedValues) {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isTrimmedString(item) &&
        (allowedValues === undefined || allowedValues.has(item)),
    ) &&
    new Set(value).size === value.length &&
    value.every(
      (item, index) =>
        index === 0 || compareCodeUnits(value[index - 1], item) < 0,
    )
  );
}

export function getToolcraftPerformanceProfileForInteractionId(interaction) {
  return interactionProfiles[interaction];
}

export function decodeToolcraftPerformancePathId(pathId) {
  if (
    !isTrimmedString(pathId) ||
    !pathId.startsWith("performance-path:")
  ) {
    return undefined;
  }
  try {
    const signature = JSON.parse(
      decodeURIComponent(pathId.slice("performance-path:".length)),
    );
    if (!Array.isArray(signature) || signature.length !== 7) return undefined;
    const [
      profile,
      interaction,
      invalidates,
      preparationInvalidates,
      retainedAccesses,
      runsOn,
      workloadDimensions,
    ] =
      signature;
    if (
      !profileNames.has(profile) ||
      !isTrimmedString(interaction) ||
      interactionProfiles[interaction] !== profile ||
      !isCanonicalStringArray(invalidates) ||
      !isCanonicalStringArray(preparationInvalidates) ||
      !isCanonicalStringArray(retainedAccesses) ||
      !isCanonicalStringArray(runsOn, runLocations) ||
      !isCanonicalStringArray(workloadDimensions) ||
      `performance-path:${encodeURIComponent(JSON.stringify(signature))}` !==
        pathId
    ) {
      return undefined;
    }
    return Object.freeze({
      interaction,
      invalidates: Object.freeze([...invalidates]),
      preparationInvalidates: Object.freeze([...preparationInvalidates]),
      profile,
      retainedAccesses: Object.freeze([...retainedAccesses]),
      runsOn: Object.freeze([...runsOn]),
      workloadDimensions: Object.freeze([...workloadDimensions]),
    });
  } catch {
    return undefined;
  }
}

export function createToolcraftPerformancePathId(path) {
  const signature = [
    path.profile,
    path.interaction,
    path.invalidates,
    path.preparationInvalidates,
    path.retainedAccesses,
    path.runsOn,
    path.workloadDimensions,
  ];
  const pathId = `performance-path:${encodeURIComponent(
    JSON.stringify(signature),
  )}`;
  if (!decodeToolcraftPerformancePathId(pathId)) {
    throw new Error(
      "Toolcraft performance paths require a canonical runtime signature.",
    );
  }
  return pathId;
}
