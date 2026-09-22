import { getToolcraftControlRangeResetPatch } from "./control-ranges";
import { resetToolcraftTargetsFromSource } from "./source-reset";
import { createToolcraftState } from "./create-template-state";
import {
  isToolcraftTimelinePanelExtendedTarget,
  isToolcraftTimelinePanelVisibleTarget,
} from "../schema/runtime-targets";
import {
  getToolcraftCanvasResetPatch,
  reduceToolcraftCanvasControlValue,
} from "./canvas-control-target-reducer";
import {
  commitToolcraftStatePatch,
  commitToolcraftValuePatch,
} from "./history-patches";
import {
  tagToolcraftCanvasStateHistoryPatch,
  tagToolcraftControlsResetHistoryPatch,
  tagToolcraftHistoryPatchDomains,
  tagToolcraftWorkspaceResetHistoryPatch,
} from "./history-patch-metadata";
import { getToolcraftResetMediaPatch } from "./media-state";
import { areToolcraftControlValuesEqual } from "./control-value-codecs";
import { commitToolcraftControlStateReplacement } from "./control-state-replacement";
import {
  getToolcraftValueControls,
  getInvalidToolcraftKeyedCollectionTarget,
  normalizeToolcraftControlValue,
  normalizeToolcraftLiveControlValue,
} from "./control-value-normalization";
import type { ToolcraftCommand, ToolcraftState } from "./types";
import { applyToolcraftCollectionParentReplacements } from "./collection-control-state";

type ToolcraftControlsCommand = Extract<
  ToolcraftCommand,
  {
    type:
      | "controls.apply"
      | "controls.reset"
      | "controls.resetTargets"
      | "controls.setValue";
  }
>;

function getChangedValuePatch(
  beforeValues: Readonly<Record<string, unknown>>,
  afterValues: Readonly<Record<string, unknown>>,
): Readonly<{
  after: Record<string, unknown>;
  before: Record<string, unknown>;
}> {
  const changedTargets = Object.keys(afterValues).filter(
    (target) => !Object.is(afterValues[target], beforeValues[target]),
  );

  return {
    after: Object.fromEntries(
      changedTargets.map((target) => [target, afterValues[target]]),
    ),
    before: Object.fromEntries(
      changedTargets.map((target) => [target, beforeValues[target]]),
    ),
  };
}

export function reduceToolcraftControlsCommand(
  state: ToolcraftState,
  command: ToolcraftControlsCommand,
): ToolcraftState {
  switch (command.type) {
    case "controls.setValue": {
      const canvasReduction = reduceToolcraftCanvasControlValue(state, command);

      if (canvasReduction.handled) {
        return canvasReduction.state;
      }

      if (isToolcraftTimelinePanelExtendedTarget(command.target)) {
        const extended = command.value === true;

        if (state.panels.timeline.extended === extended) {
          return state;
        }

        return {
          ...state,
          panels: {
            ...state.panels,
            timeline: {
              ...state.panels.timeline,
              extended,
            },
          },
        };
      }

      if (isToolcraftTimelinePanelVisibleTarget(command.target)) {
        const hidden = command.value === false;

        if (state.panels.timeline.hidden === hidden) {
          return state;
        }

        return {
          ...state,
          panels: {
            ...state.panels,
            timeline: {
              ...state.panels.timeline,
              hidden,
            },
          },
        };
      }

      const control = getToolcraftValueControls(state.schema).get(
        command.target,
      );
      const normalized = control
        ? normalizeToolcraftLiveControlValue(control, command.value)
        : { accepted: true as const, value: command.value };

      if (!normalized.accepted) {
        return state;
      }

      if (
        areToolcraftControlValuesEqual(
          state.values[command.target],
          normalized.value,
        )
      ) {
        const collectionReplacement =
          applyToolcraftCollectionParentReplacements({
            replacedTargets: new Set([command.target]),
            state,
            values: { ...state.values, [command.target]: normalized.value },
          });
        if (collectionReplacement.timeline === state.timeline) return state;
        return commitToolcraftControlStateReplacement(
          state,
          collectionReplacement,
          command.label ?? command.target,
          { group: command.historyGroup, mode: command.history },
        );
      }

      const replacement = applyToolcraftCollectionParentReplacements({
        replacedTargets: new Set([command.target]),
        state,
        values: { ...state.values, [command.target]: normalized.value },
      });
      return commitToolcraftControlStateReplacement(
        state,
        replacement,
        command.label ?? command.target,
        {
          group: command.historyGroup,
          mode: command.history,
        },
      );
    }

    case "controls.apply": {
      if (command.values === undefined) return state;
      const controls = getToolcraftValueControls(state.schema);
      if (getInvalidToolcraftKeyedCollectionTarget(controls, command.values)) return state;
      const additionalTargets = new Set([
        ...state.schema.settingsTransfer.additionalValueTargets,
        ...(state.schema.persistence.storage === "localStorage"
          ? state.schema.persistence.additionalValueTargets
          : []),
      ]);
      const values = { ...state.values };
      const replacedTargets = new Set<string>();
      for (const [target, candidate] of Object.entries(command.values)) {
        const control = controls.get(target);
        if (control) {
          const normalized = normalizeToolcraftControlValue(control, candidate);
          values[target] = normalized.accepted
            ? normalized.value
            : normalized.fallback;
          replacedTargets.add(target);
        } else if (
          Object.hasOwn(state.values, target) ||
          additionalTargets.has(target)
        ) {
          values[target] = candidate;
        }
      }
      const replacement = applyToolcraftCollectionParentReplacements({
        replacedTargets,
        state,
        values,
      });
      return commitToolcraftControlStateReplacement(
        state,
        replacement,
        command.label ?? "Apply controls",
        { group: command.historyGroup, mode: command.history },
      );
    }

    case "controls.reset": {
      if (state.schema.sourceDefaults && state.schema.sourceDefaults.scope !== "parameters") {
        const fresh = createToolcraftState(state.schema);
        const fields = ["controlRanges", "canvas", "panels", "timeline", "layers", "mediaAssets", "selectedLayerId"] as const;
        return commitToolcraftStatePatch(state, tagToolcraftWorkspaceResetHistoryPatch(tagToolcraftControlsResetHistoryPatch(
          { after: {}, before: {}, label: "Reset to saved defaults" },
          { values: { before: state.values, after: fresh.values }, state: {
            before: Object.fromEntries(fields.map(field => [field, state[field]])),
            after: Object.fromEntries(fields.map(field => [field, fresh[field]])),
          } },
        )));
      }
      const replacement = applyToolcraftCollectionParentReplacements({
        replacedTargets: new Set(Object.keys(state.defaults)),
        state,
        values: { ...state.values, ...state.defaults },
      });
      const resetRangePatch = getToolcraftControlRangeResetPatch(state);
      const resetCanvasPatch = getToolcraftCanvasResetPatch(state);
      const resetMediaPatch = getToolcraftResetMediaPatch({
        ...state,
        timeline: replacement.timeline,
      });
      const valuePatch = getChangedValuePatch(state.values, replacement.values);
      const patch = tagToolcraftControlsResetHistoryPatch(
        { after: {}, before: {}, label: "Reset controls" },
        {
          values: {
            before: {
              ...Object.fromEntries(
                Object.keys(state.defaults).map((target) => [
                  target,
                  state.values[target],
                ]),
              ),
              ...valuePatch.before,
            },
            after: { ...state.defaults, ...valuePatch.after },
          },
          state: {
            before: {
              ...resetRangePatch?.before,
              ...resetCanvasPatch?.before,
              ...resetMediaPatch?.before,
              ...(replacement.timeline === state.timeline
                ? {}
                : { timeline: state.timeline }),
            },
            after: {
              ...resetRangePatch?.after,
              ...resetCanvasPatch?.after,
              ...(replacement.timeline === state.timeline
                ? {}
                : { timeline: replacement.timeline }),
              ...resetMediaPatch?.after,
            },
          },
        },
      );

      if (
        resetRangePatch ||
        resetCanvasPatch ||
        resetMediaPatch ||
        replacement.timeline !== state.timeline
      ) {
        return commitToolcraftStatePatch(state, patch);
      }
      return commitToolcraftValuePatch(state, patch, replacement.values);
    }

    case "controls.resetTargets": {
      if (command.baseline) return resetToolcraftTargetsFromSource(state, command);
      const targetSet = new Set(command.targets);
      const defaults = Object.fromEntries(
        [...targetSet]
          .filter((target) => Object.hasOwn(state.defaults, target))
          .map((target) => [target, state.defaults[target]]),
      );
      const replacement = applyToolcraftCollectionParentReplacements({
        replacedTargets: targetSet,
        state,
        values: { ...state.values, ...defaults },
      });
      const valuePatch = getChangedValuePatch(state.values, replacement.values);
      const resetRangePatch = getToolcraftControlRangeResetPatch(state, targetSet);
      const resetCanvasPatch = getToolcraftCanvasResetPatch(state, targetSet);
      const resetMediaPatch = getToolcraftResetMediaPatch(
        { ...state, timeline: replacement.timeline },
        targetSet,
      );

      if (
        Object.keys(valuePatch.after).length === 0 &&
        !resetRangePatch &&
        !resetCanvasPatch &&
        !resetMediaPatch &&
        replacement.timeline === state.timeline
      )
        return state;

      const patch = tagToolcraftHistoryPatchDomains(
        { after: {}, before: {}, label: command.label ?? "Reset section" },
        {
          values: valuePatch,
          state: {
            before: {
              ...resetRangePatch?.before,
              ...resetCanvasPatch?.before,
              ...resetMediaPatch?.before,
              ...(replacement.timeline === state.timeline
                ? {}
                : { timeline: state.timeline }),
            },
            after: {
              ...resetRangePatch?.after,
              ...resetCanvasPatch?.after,
              ...(replacement.timeline === state.timeline
                ? {}
                : { timeline: replacement.timeline }),
              ...resetMediaPatch?.after,
            },
          },
        },
      );

      return commitToolcraftStatePatch(
        state,
        resetCanvasPatch ? tagToolcraftCanvasStateHistoryPatch(patch) : patch,
      );
    }
  }
}
