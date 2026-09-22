import type { ReadonlyToolcraftState, ToolcraftReadonly } from "../../../state/readonly-state";
import {
  getToolcraftCanvasSizeTargetDimension,
  isToolcraftTimelinePanelExtendedTarget,
  isToolcraftTimelinePanelVisibleTarget,
} from "../../../schema/runtime-targets";
import {
  doesToolcraftApplicabilityMatch,
  doesToolcraftPredicateMatchValue,
  getToolcraftApplicabilityTargets,
} from "../../../schema/control-applicability";
import type {
  ToolcraftControlConditionSchema,
  ResolvedToolcraftControlSchema,
  ResolvedToolcraftControlSectionSchema,
} from "../../../schema/types";
import { readToolcraftCanvasRuntimeTarget } from "../../../state/canvas-frame";

function getControlDefaultValueByTarget(
  sections: ToolcraftReadonly<readonly ResolvedToolcraftControlSectionSchema[]>,
  target: string,
): unknown {
  for (const section of sections) {
    for (const control of Object.values(section.controls)) {
      if (control.target === target) {
        return control.defaultValue;
      }
    }
  }

  return undefined;
}

export function getToolcraftTargetValue(
  state: ReadonlyToolcraftState,
  target: string,
): unknown {
  const canvasTarget = readToolcraftCanvasRuntimeTarget(state, target);

  if (canvasTarget.handled) {
    return canvasTarget.value;
  }

  const canvasSizeDimension = getToolcraftCanvasSizeTargetDimension(target);

  if (isToolcraftTimelinePanelExtendedTarget(target)) {
    return state.panels.timeline.extended === true;
  }

  if (isToolcraftTimelinePanelVisibleTarget(target)) {
    return state.panels.timeline.hidden !== true;
  }

  return canvasSizeDimension
    ? state.canvas.size[canvasSizeDimension]
    : (state.values[target] ??
        getControlDefaultValueByTarget(
          state.schema.panels.controls?.sections ?? [],
          target,
        ));
}

export function getToolcraftConditionTargets(
  ...conditions: ReadonlyArray<ToolcraftControlConditionSchema | undefined>
): string[] {
  return [
    ...new Set(
      conditions.flatMap((condition) =>
        condition ? [condition.target] : [],
      ),
    ),
  ];
}

export function getToolcraftControlConditionTargets(
  control: ResolvedToolcraftControlSchema,
): string[] {
  return [
    ...new Set([
      ...getToolcraftApplicabilityTargets(
        control.applicability,
      ),
      ...getToolcraftConditionTargets(control.disabledWhen),
    ]),
  ];
}

export function getToolcraftControlVisibilityTargets(
  control: ToolcraftReadonly<ResolvedToolcraftControlSchema>,
): string[] {
  return getToolcraftApplicabilityTargets(
    control.applicability,
  );
}

export function getToolcraftSectionVisibilityTargets(
  section: ToolcraftReadonly<ResolvedToolcraftControlSectionSchema>,
): string[] {
  return getToolcraftConditionTargets(section.visibleWhen);
}

export function toolcraftConditionMatches(
  state: ReadonlyToolcraftState,
  condition: ToolcraftControlConditionSchema,
): boolean {
  return doesToolcraftPredicateMatchValue(
    condition,
    getToolcraftTargetValue(state, condition.target),
  );
}

export function isToolcraftSectionVisible(
  state: ReadonlyToolcraftState,
  section: ToolcraftReadonly<ResolvedToolcraftControlSectionSchema>,
): boolean {
  return section.visibleWhen
    ? toolcraftConditionMatches(state, section.visibleWhen)
    : true;
}

export function isToolcraftControlVisible(
  state: ReadonlyToolcraftState,
  control: ToolcraftReadonly<ResolvedToolcraftControlSchema>,
): boolean {
  return doesToolcraftApplicabilityMatch(
    control.applicability,
    (target) => getToolcraftTargetValue(state, target),
  );
}

export function isToolcraftControlDisabled(
  state: ReadonlyToolcraftState,
  control: ResolvedToolcraftControlSchema,
): boolean {
  if (control.disabled) {
    return true;
  }

  return control.disabledWhen
    ? toolcraftConditionMatches(state, control.disabledWhen)
    : false;
}
