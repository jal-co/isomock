import type { ResolvedToolcraftAppSchema } from "@/toolcraft/runtime";

import type {
  ToolcraftComponentAcceptance,
  ToolcraftRenderScaleState,
} from "./types";

const renderScaleStates = [
  "interaction",
  "steady",
] satisfies readonly ToolcraftRenderScaleState[];

const timelineRenderScaleStates = [
  "interaction",
  "playback",
  "steady",
] satisfies readonly ToolcraftRenderScaleState[];

function getExpectedRenderScaleStates(
  schema: ResolvedToolcraftAppSchema,
): readonly ToolcraftRenderScaleState[] {
  return schema.panels.timeline?.enabled
    ? timelineRenderScaleStates
    : renderScaleStates;
}

export function getToolcraftRenderScaleCoverageErrors({
  acceptance,
  schema,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  schema: ResolvedToolcraftAppSchema;
}): string[] {
  const entries = acceptance.filter(
    (entry) => entry.renderScaleCoverage !== undefined,
  );

  if (!schema.canvas.renderScale.enabled) {
    return entries.length === 0
      ? []
      : [
          "canvas.renderScale is disabled and must not declare renderScaleCoverage.",
        ];
  }

  if (entries.length === 0) {
    return [
      'canvas.renderScale requires a browser acceptance entry targeting "canvas.renderScale" with renderScaleCoverage "selected-backing-pixels".',
    ];
  }

  if (entries.length !== 1) {
    return [
      `canvas.renderScale requires exactly one renderScaleCoverage entry; found ${entries.length}.`,
    ];
  }

  const [entry] = entries;
  if (entry.kind !== "runtime") {
    return [
      `${entry.id} renderScaleCoverage must be declared on a runtime acceptance entry.`,
    ];
  }

  if (entry.browser === false) {
    return [
      `${entry.id} must have browser coverage proving selected canvas backing pixels.`,
    ];
  }

  if (entry.target !== "canvas.renderScale") {
    return [
      `${entry.id} renderScaleCoverage must target "canvas.renderScale".`,
    ];
  }

  const coverage = entry.renderScaleCoverage;
  if (!coverage) {
    return [
      `${entry.id} must declare renderScaleCoverage "selected-backing-pixels".`,
    ];
  }

  if (coverage.kind !== "selected-backing-pixels") {
    return [
      `${entry.id} renderScaleCoverage kind must be "selected-backing-pixels".`,
    ];
  }

  if (!Array.isArray(coverage.states)) {
    return [
      `${entry.id} renderScaleCoverage states must be a sorted unique array.`,
    ];
  }

  const expectedStates = getExpectedRenderScaleStates(schema);
  if (
    coverage.states.length !== expectedStates.length ||
    coverage.states.some((state, index) => state !== expectedStates[index])
  ) {
    return [
      `${entry.id} renderScaleCoverage states must exactly equal: ${expectedStates.join(", ")}.`,
    ];
  }

  return [];
}
