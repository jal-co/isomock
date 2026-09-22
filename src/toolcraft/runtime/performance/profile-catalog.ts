import { TOOLCRAFT_PERFORMANCE_PROFILE_MANIFEST } from "./profile-catalog-manifest.mjs";

export const TOOLCRAFT_PERFORMANCE_PROFILE_CATALOG_VERSION =
  TOOLCRAFT_PERFORMANCE_PROFILE_MANIFEST.version;

export const TOOLCRAFT_PERFORMANCE_PROFILE_NAMES =
  TOOLCRAFT_PERFORMANCE_PROFILE_MANIFEST.names;

export type ToolcraftPerformanceProfileName =
  (typeof TOOLCRAFT_PERFORMANCE_PROFILE_NAMES)[number];

const toolcraftPerformanceProfileNameSet = new Set<string>(
  TOOLCRAFT_PERFORMANCE_PROFILE_NAMES,
);
const profileNames = Object.freeze(
  [...TOOLCRAFT_PERFORMANCE_PROFILE_NAMES].sort(),
);

export function isToolcraftPerformanceProfileName(
  value: unknown,
): value is ToolcraftPerformanceProfileName {
  return (
    typeof value === "string" && toolcraftPerformanceProfileNameSet.has(value)
  );
}

export type ToolcraftPerformanceProfileThresholds = Readonly<{
  maxBatchCompletionMs?: number;
  maxDroppedFrameRatio: number;
  maxFrameGapMs: number;
  maxFrameGapP95Ms: number;
  maxLongTaskMs: number;
  maxVisibleOutputLatencyMs: number;
}>;

export type ToolcraftPerformanceProfile = Readonly<{
  name: ToolcraftPerformanceProfileName;
  thresholds: ToolcraftPerformanceProfileThresholds;
  version: typeof TOOLCRAFT_PERFORMANCE_PROFILE_CATALOG_VERSION;
}>;

export function getToolcraftPerformanceProfileNames(): readonly ToolcraftPerformanceProfileName[] {
  return profileNames;
}

export function getToolcraftPerformanceProfile(
  name: ToolcraftPerformanceProfileName,
): ToolcraftPerformanceProfile {
  return Object.freeze({
    name,
    thresholds: Object.freeze({
      ...TOOLCRAFT_PERFORMANCE_PROFILE_MANIFEST.profiles[name],
    }),
    version: TOOLCRAFT_PERFORMANCE_PROFILE_CATALOG_VERSION,
  });
}
