import {
  getToolcraftRuntimeSetupBackgroundControls,
  toolcraftOutputBackgroundToggleTarget,
} from "../schema/runtime-setup-background";
import {
  getToolcraftCanvasSizeTargetDimension,
  toolcraftCanvasInfinityTarget,
} from "../schema/runtime-targets";
import {
  normalizeToolcraftCanvasModeForBackground,
} from "./canvas-background-state";
import {
  applyToolcraftCanvasAspectRatioToSize,
  asToolcraftCanvasSizeDimension,
  getToolcraftCanvasAspectRatioPresetSize,
  getToolcraftResetCanvasSize,
  normalizeToolcraftCanvasAspectRatioValue,
  toolcraftCanvasAspectRatioTarget,
  toolcraftCanvasAspectRatioValuesEqual,
  toolcraftCanvasSizesEqual,
  toolcraftCanvasSizeHeightTarget,
  toolcraftCanvasSizeWidthTarget,
} from "./canvas-state";
import {
  createToolcraftCanvasModePatch,
  getToolcraftDefaultCanvasMode,
} from "./canvas-frame";
import { commitToolcraftStatePatch } from "./history-patches";
import { tagToolcraftCanvasStateHistoryPatch } from "./history-patch-metadata";
import type {
  ToolcraftCommand,
  ToolcraftHistoryPatch,
  ToolcraftState,
} from "./types";

type ToolcraftSetValueCommand = Extract<
  ToolcraftCommand,
  { type: "controls.setValue" }
>;

export type ToolcraftCanvasControlReduction =
  | Readonly<{ handled: false }>
  | Readonly<{ handled: true; state: ToolcraftState }>;

function commitCanvasControlPatch(
  state: ToolcraftState,
  command: ToolcraftSetValueCommand,
  patch: ToolcraftHistoryPatch,
): ToolcraftState {
  return commitToolcraftStatePatch(
    state,
    tagToolcraftCanvasStateHistoryPatch({
      ...patch,
      label: command.label ?? patch.label,
    }),
    { group: command.historyGroup, mode: command.history },
  );
}

function reduceCanvasModeControlValue(
  state: ToolcraftState,
  command: ToolcraftSetValueCommand,
): ToolcraftCanvasControlReduction {
  if (command.target !== toolcraftCanvasInfinityTarget) {
    return { handled: false };
  }

  if (typeof command.value !== "boolean") {
    return { handled: true, state };
  }

  if (
    command.value &&
    normalizeToolcraftCanvasModeForBackground({ ...state, mode: "infinite" }) !== "infinite"
  ) {
    return { handled: true, state };
  }

  const patch = createToolcraftCanvasModePatch(
    state.canvas,
    command.value ? "infinite" : "finite",
  );

  return {
    handled: true,
    state: patch ? commitCanvasControlPatch(state, command, patch) : state,
  };
}

function reduceCanvasBackgroundControlValue(
  state: ToolcraftState,
  command: ToolcraftSetValueCommand,
): ToolcraftCanvasControlReduction {
  const background = getToolcraftRuntimeSetupBackgroundControls(state.schema);

  if (
    !background ||
    state.schema.canvas.infinityBackgroundPolicy === "optional" ||
    command.target !== toolcraftOutputBackgroundToggleTarget ||
    command.target !== background.include.target ||
    command.value !== false ||
    state.canvas.mode !== "infinite"
  ) {
    return { handled: false };
  }

  const modePatch = createToolcraftCanvasModePatch(state.canvas, "finite");

  if (!modePatch) {
    return { handled: false };
  }

  return {
    handled: true,
    state: commitCanvasControlPatch(state, command, {
      after: {
        ...modePatch.after,
        [command.target]: false,
      },
      before: {
        ...modePatch.before,
        [command.target]: state.values[command.target],
      },
      label: command.target,
    }),
  };
}

function reduceCanvasAspectRatioControlValue(
  state: ToolcraftState,
  command: ToolcraftSetValueCommand,
): ToolcraftCanvasControlReduction {
  if (command.target !== toolcraftCanvasAspectRatioTarget) {
    return { handled: false };
  }

  if (state.canvas.mode === "infinite") {
    return { handled: true, state };
  }

  const ratio = normalizeToolcraftCanvasAspectRatioValue(
    command.value,
    state.canvas.size,
  );
  const currentRatio = normalizeToolcraftCanvasAspectRatioValue(
    state.values[command.target],
    state.canvas.size,
  );
  const keepsCustomRatio =
    ratio.mode === "custom" &&
    ratio.width === currentRatio.width &&
    ratio.height === currentRatio.height;
  const size = keepsCustomRatio
    ? state.canvas.size
    : getToolcraftCanvasAspectRatioPresetSize(ratio) ??
      applyToolcraftCanvasAspectRatioToSize({
        anchor: "width",
        ratio,
        size: state.canvas.size,
        value: state.canvas.size.width,
      });

  if (
    toolcraftCanvasSizesEqual(state.canvas.size, size) &&
    toolcraftCanvasAspectRatioValuesEqual(state.values[command.target], ratio)
  ) {
    return { handled: true, state };
  }

  return {
    handled: true,
    state: commitCanvasControlPatch(state, command, {
      after: {
        [toolcraftCanvasAspectRatioTarget]: ratio,
        "canvas.size": size,
        [toolcraftCanvasSizeWidthTarget]: size.width,
        [toolcraftCanvasSizeHeightTarget]: size.height,
      },
      before: {
        [toolcraftCanvasAspectRatioTarget]: state.values[command.target],
        "canvas.size": state.canvas.size,
        [toolcraftCanvasSizeWidthTarget]:
          state.values[toolcraftCanvasSizeWidthTarget],
        [toolcraftCanvasSizeHeightTarget]:
          state.values[toolcraftCanvasSizeHeightTarget],
      },
      label: command.target,
    }),
  };
}

function reduceCanvasDimensionControlValue(
  state: ToolcraftState,
  command: ToolcraftSetValueCommand,
): ToolcraftCanvasControlReduction {
  const dimension = getToolcraftCanvasSizeTargetDimension(command.target);

  if (!dimension) {
    return { handled: false };
  }

  if (state.canvas.mode === "infinite") {
    return { handled: true, state };
  }

  const dimensionValue = asToolcraftCanvasSizeDimension(command.value);

  if (dimensionValue === null) {
    return { handled: true, state };
  }

  // Recommitting a rounded side must not nudge the opposite side by one pixel.
  if (
    dimensionValue === state.canvas.size[dimension] &&
    state.values[command.target] === dimensionValue
  ) {
    return { handled: true, state };
  }

  const hasAspectRatioControl =
    toolcraftCanvasAspectRatioTarget in state.values ||
    toolcraftCanvasAspectRatioTarget in state.defaults;
  const aspectRatio = normalizeToolcraftCanvasAspectRatioValue(
    state.values[toolcraftCanvasAspectRatioTarget],
    state.canvas.size,
  );
  const size = hasAspectRatioControl
    ? applyToolcraftCanvasAspectRatioToSize({
        anchor: dimension,
        ratio: aspectRatio,
        size: state.canvas.size,
        value: dimensionValue,
      })
    : { ...state.canvas.size, [dimension]: dimensionValue };
  const otherTarget =
    dimension === "width"
      ? toolcraftCanvasSizeHeightTarget
      : toolcraftCanvasSizeWidthTarget;
  const otherValue = dimension === "width" ? size.height : size.width;

  if (
    toolcraftCanvasSizesEqual(state.canvas.size, size) &&
    state.values[command.target] === size[dimension] &&
    state.values[otherTarget] === otherValue
  ) {
    return { handled: true, state };
  }

  return {
    handled: true,
    state: commitCanvasControlPatch(state, command, {
      after: {
        ...(hasAspectRatioControl
          ? { [toolcraftCanvasAspectRatioTarget]: aspectRatio }
          : {}),
        "canvas.size": size,
        [command.target]: size[dimension],
        [otherTarget]: otherValue,
      },
      before: {
        ...(hasAspectRatioControl
          ? {
              [toolcraftCanvasAspectRatioTarget]:
                state.values[toolcraftCanvasAspectRatioTarget],
            }
          : {}),
        "canvas.size": state.canvas.size,
        [command.target]: state.values[command.target],
        [otherTarget]: state.values[otherTarget],
      },
      label: command.target,
    }),
  };
}

export function reduceToolcraftCanvasControlValue(
  state: ToolcraftState,
  command: ToolcraftSetValueCommand,
): ToolcraftCanvasControlReduction {
  for (const reduce of [
    reduceCanvasBackgroundControlValue,
    reduceCanvasModeControlValue,
    reduceCanvasAspectRatioControlValue,
    reduceCanvasDimensionControlValue,
  ]) {
    const result = reduce(state, command);

    if (result.handled) {
      return result;
    }
  }

  return { handled: false };
}

function addResetValueTarget(
  state: ToolcraftState,
  target: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): void {
  if (
    target in state.defaults &&
    !Object.is(state.values[target], state.defaults[target])
  ) {
    before[target] = state.values[target];
    after[target] = state.defaults[target];
  }
}

export function getToolcraftCanvasResetPatch(
  state: ToolcraftState,
  targets?: ReadonlySet<string>,
): ToolcraftHistoryPatch | null {
  const globalReset = targets === undefined;
  const background = getToolcraftRuntimeSetupBackgroundControls(state.schema);
  const resetsBackgroundToDisabled =
    state.schema.canvas.infinityBackgroundPolicy !== "optional" &&
    targets !== undefined &&
    background !== undefined &&
    targets.has(background.include.target) &&
    state.defaults[background.include.target] === false;
  const resetsMode =
    globalReset ||
    targets.has(toolcraftCanvasInfinityTarget) ||
    resetsBackgroundToDisabled;
  const resetsSize =
    globalReset ||
    targets.has(toolcraftCanvasAspectRatioTarget) ||
    targets.has(toolcraftCanvasSizeWidthTarget) ||
    targets.has(toolcraftCanvasSizeHeightTarget);
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const defaultMode = normalizeToolcraftCanvasModeForBackground({
    mode: getToolcraftDefaultCanvasMode(state.schema.canvas),
    schema: state.schema,
    values: state.defaults,
  });

  if (resetsMode && state.canvas.mode !== defaultMode) {
    before["canvas.mode"] = state.canvas.mode;
    after["canvas.mode"] = defaultMode;
  }

  if (resetsSize) {
    const resetSize = getToolcraftResetCanvasSize(state);

    if (resetSize && !toolcraftCanvasSizesEqual(state.canvas.size, resetSize)) {
      before["canvas.size"] = state.canvas.size;
      after["canvas.size"] = resetSize;
    }

    for (const target of [
      toolcraftCanvasAspectRatioTarget,
      toolcraftCanvasSizeWidthTarget,
      toolcraftCanvasSizeHeightTarget,
    ]) {
      if (globalReset || targets.has(target)) {
        addResetValueTarget(state, target, before, after);
      }
    }
  }

  return Object.keys(after).length > 0
    ? { after, before, label: globalReset ? "Reset controls" : "Reset section" }
    : null;
}
