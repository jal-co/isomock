import { normalizeToolcraftCollectionSelections } from "./collection-control-state";
import { getToolcraftCollectionActionsControls } from "../schema/collection-actions";
import { areToolcraftControlValuesEqual } from "./control-value-codecs";
import { decodeToolcraftCollectionItemControlAddress } from "./collection-control-address";
import { tagToolcraftCanvasStateHistoryPatch, tagToolcraftHistoryPatchDomains } from "./history-patch-metadata";
import { commitToolcraftStatePatch } from "./history-patches";
import type { ToolcraftCommand, ToolcraftState } from "./types";

/** A supplied source baseline is projected onto exact authored targets, never hydrated wholesale. */
export function resetToolcraftTargetsFromSource(state: ToolcraftState, command: Extract<ToolcraftCommand, { type: "controls.resetTargets" }>): ToolcraftState {
  const baseline = command.baseline!;
  const targets = new Set(command.targets);
  const owns = (target: string) => targets.has(target) || targets.has(decodeToolcraftCollectionItemControlAddress(target)?.collectionTarget ?? "");
  const valuesBefore: Record<string, unknown> = {}, valuesAfter: Record<string, unknown> = {};
  for (const target of targets) {
    if (Object.hasOwn(baseline.values, target) && !areToolcraftControlValuesEqual(state.values[target], baseline.values[target])) {
      valuesBefore[target] = state.values[target]; valuesAfter[target] = baseline.values[target];
    }
  }
  const ranges = { ...state.controlRanges };
  for (const target of new Set([...Object.keys(ranges), ...Object.keys(baseline.controlRanges)])) {
    if (!owns(target)) continue;
    if (baseline.controlRanges[target]) ranges[target] = baseline.controlRanges[target]; else delete ranges[target];
  }
  const remaining = new Map(baseline.timeline.keyframeGroups.filter(group => owns(group.controlId)).map(group => [group.controlId, group]));
  const keyframeGroups = state.timeline.keyframeGroups.flatMap(group => {
    if (!owns(group.controlId)) return [group];
    const replacement = remaining.get(group.controlId); remaining.delete(group.controlId);
    return replacement ? [replacement] : [];
  });
  keyframeGroups.push(...remaining.values());
  const canvas = { ...state.canvas, mode: targets.has("canvas.infinity") ? baseline.canvas.mode : state.canvas.mode,
    size: { ...state.canvas.size,
      width: targets.has("canvas.size.width") ? baseline.canvas.size.width : state.canvas.size.width,
      height: targets.has("canvas.size.height") ? baseline.canvas.size.height : state.canvas.size.height,
    },
  };
  const normalized = normalizeToolcraftCollectionSelections({
    controls: getToolcraftCollectionActionsControls(state.schema.panels.controls),
    values: { ...state.values, ...valuesAfter },
  });
  for (const [target, value] of Object.entries(normalized)) {
    if (!areToolcraftControlValuesEqual(state.values[target], value)) {
      valuesBefore[target] = state.values[target]; valuesAfter[target] = value;
    }
  }
  const before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
  if (!areToolcraftControlValuesEqual(ranges, state.controlRanges)) { before.controlRanges = state.controlRanges; after.controlRanges = ranges; }
  if (!areToolcraftControlValuesEqual(keyframeGroups, state.timeline.keyframeGroups)) { before.timeline = state.timeline; after.timeline = { ...state.timeline, keyframeGroups }; }
  const changedCanvas = !areToolcraftControlValuesEqual(canvas, state.canvas);
  if (!areToolcraftControlValuesEqual(canvas.size, state.canvas.size)) { before["canvas.size"] = state.canvas.size; after["canvas.size"] = canvas.size; }
  if (canvas.mode !== state.canvas.mode) { before["canvas.mode"] = state.canvas.mode; after["canvas.mode"] = canvas.mode; }
  if (!Object.keys(valuesAfter).length && !Object.keys(after).length) return state;
  const patch = tagToolcraftHistoryPatchDomains({ before: {}, after: {}, label: command.label ?? "Reset to saved state" }, {
    values: { before: valuesBefore, after: valuesAfter }, state: { before, after },
  });
  return commitToolcraftStatePatch(state, changedCanvas ? tagToolcraftCanvasStateHistoryPatch(patch) : patch);
}
