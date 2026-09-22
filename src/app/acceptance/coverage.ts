import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlPartCoverage,
  ToolcraftCustomControlCoverage,
  ToolcraftTimelinePlaybackCoverage,
} from "./types";

export function hasCoverageForValues(
  coverage: ToolcraftComponentAcceptance["actionCoverage"] | ToolcraftComponentAcceptance["optionCoverage"],
  values: readonly string[],
): boolean {
  if (values.length === 0) {
    return true;
  }

  if (coverage === "each-visible-item") {
    return true;
  }

  if (!Array.isArray(coverage)) {
    return false;
  }

  return values.every((value) => coverage.includes(value));
}

export function hasControlPartCoverage(
  coverage: ToolcraftComponentAcceptance["controlPartCoverage"],
  requiredParts: readonly ToolcraftControlPartCoverage[],
): boolean {
  if (requiredParts.length === 0) {
    return true;
  }

  if (coverage === "all-visible-parts") {
    return true;
  }

  if (!Array.isArray(coverage)) {
    return false;
  }

  return requiredParts.every((part) => coverage.includes(part));
}

export function hasCustomControlCoverage(
  coverage: ToolcraftComponentAcceptance["customControlCoverage"],
  requiredParts: readonly ToolcraftCustomControlCoverage[],
): boolean {
  if (coverage === "all-custom-control-behavior") {
    return true;
  }

  if (!Array.isArray(coverage)) {
    return false;
  }

  return requiredParts.every((part) => coverage.includes(part));
}

export function hasTimelinePlaybackCoverage(
  coverage: ToolcraftComponentAcceptance["timelinePlaybackCoverage"],
  requiredParts: readonly ToolcraftTimelinePlaybackCoverage[],
): boolean {
  if (coverage === "all-playback-behavior") {
    return true;
  }

  if (!Array.isArray(coverage)) {
    return false;
  }

  return requiredParts.every((part) => coverage.includes(part));
}

export function hasTimelinePlaybackCoveragePart(
  coverage: ToolcraftComponentAcceptance["timelinePlaybackCoverage"],
  part: ToolcraftTimelinePlaybackCoverage,
): boolean {
  return coverage === "all-playback-behavior" || (Array.isArray(coverage) && coverage.includes(part));
}
