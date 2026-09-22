import { validateContribution } from "./declaration";
import { createBuiltInToolcraftProductModuleDefinition } from "../../contract/module-definition";

type ToolcraftTimelineModuleMode = "keyframes" | "playback";

function createTimelineModuleDefinition(
  mode: ToolcraftTimelineModuleMode,
  defaultDurationSeconds?: number,
) {
  const timeline = {
    ...(defaultDurationSeconds === undefined ? {} : { defaultDurationSeconds }),
    enabled: true,
    mode,
  } as const;

  return createBuiltInToolcraftProductModuleDefinition({
    contributions: [
      {
        id: "timeline.surface",
        kind: "panel-surface",
        moduleId: "timeline",
        surface: "timeline",
        configuration: timeline,
      },
      {
        id: "timeline.persistence",
        kind: "persistence-requirement",
        moduleId: "timeline",
        slice: "timeline",
      },
    ],
    defaultProviders: [],
    id: "timeline",
    portRequirements: [],
    provides:
      mode === "keyframes"
        ? ["timeline.keyframes", "timeline.playback"]
        : ["timeline.playback"],
    requires: [],
  }, validateContribution);
}

const keyframesTimelineModuleDefinition =
  createTimelineModuleDefinition("keyframes");
const playbackTimelineModuleDefinition =
  createTimelineModuleDefinition("playback");
const explicitTimelineModuleDefinitions = new Map<
  string,
  ReturnType<typeof createTimelineModuleDefinition>
>();

function assertCanonicalTimelineDuration(
  defaultDurationSeconds: unknown,
): asserts defaultDurationSeconds is number {
  if (
    typeof defaultDurationSeconds !== "number" ||
    !Number.isFinite(defaultDurationSeconds) ||
    defaultDurationSeconds < 1 ||
    defaultDurationSeconds > 60
  ) {
    throw new Error(
      `Toolcraft timeline defaultDurationSeconds must be a finite number from 1 through 60; received ${String(defaultDurationSeconds)}.`,
    );
  }
}

function assertCanonicalTimelineMode(
  mode: unknown,
): asserts mode is ToolcraftTimelineModuleMode {
  if (mode !== "keyframes" && mode !== "playback") {
    throw new Error(
      `Toolcraft timeline mode must be exactly "keyframes" or "playback"; received ${String(mode)}.`,
    );
  }
}

export function timelineModule(
  options: Readonly<{
    defaultDurationSeconds?: number;
    mode: ToolcraftTimelineModuleMode;
  }>,
) {
  const mode: unknown = options.mode;
  const defaultDurationSeconds: unknown = options.defaultDurationSeconds;

  assertCanonicalTimelineMode(mode);

  if (defaultDurationSeconds === undefined) {
    return mode === "keyframes"
      ? keyframesTimelineModuleDefinition
      : playbackTimelineModuleDefinition;
  }

  assertCanonicalTimelineDuration(defaultDurationSeconds);
  const cacheKey = `${mode}:${defaultDurationSeconds}`;
  const cachedDefinition = explicitTimelineModuleDefinitions.get(cacheKey);
  if (cachedDefinition) {
    return cachedDefinition;
  }

  const definition = createTimelineModuleDefinition(
    mode,
    defaultDurationSeconds,
  );
  explicitTimelineModuleDefinitions.set(cacheKey, definition);
  return definition;
}
