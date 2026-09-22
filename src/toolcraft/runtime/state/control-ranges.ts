import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import type { ResolvedToolcraftControlSchema } from "../schema/types";
import { getToolcraftInitialSliderRange, getToolcraftSliderRangeError, type ToolcraftSliderRange } from "../schema/slider-range";
import { getToolcraftValueControls } from "./control-value-normalization";
import { isToolcraftPersistenceRecord } from "./persistence-shared";
import type { ToolcraftState } from "./types";
import { areToolcraftControlValuesEqual } from "./control-value-codecs";

export type ToolcraftControlRanges = Readonly<Record<string, ToolcraftSliderRange>>;

export function getToolcraftControlRangeResetPatch(state: ToolcraftState, targets?: ReadonlySet<string>) {
  const defaults = state.schema.sourceDefaults?.initialState.controlRanges ?? {};
  const next = { ...state.controlRanges };
  for (const target of new Set([...Object.keys(next), ...Object.keys(defaults)])) {
    if (targets && !targets.has(target)) continue;
    if (defaults[target]) next[target] = defaults[target];
    else delete next[target];
  }
  return areToolcraftControlValuesEqual(next, state.controlRanges) ? undefined : {
    before: { controlRanges: state.controlRanges }, after: { controlRanges: next },
  };
}

/** Local workspace restoration tolerates stale/invalid overrides independently. */
export function readToolcraftControlRanges(schema: ResolvedToolcraftAppSchema, input: unknown): ToolcraftControlRanges {
  if (!isToolcraftPersistenceRecord(input)) return {};
  const controls = getToolcraftValueControls(schema);
  return Object.fromEntries(Object.entries(input).flatMap(([target, range]) => {
    const control = controls.get(target);
    if (!control?.editableRange || !isToolcraftPersistenceRecord(range) ||
        Object.keys(range).sort().join() !== "max,min" || typeof range.min !== "number" || typeof range.max !== "number") return [];
    const parsed = { min: range.min, max: range.max };
    return getToolcraftSliderRangeError(control, parsed) ? [] : [[target, parsed]];
  }));
}

export function getToolcraftControlRange(state: ToolcraftState, control: ResolvedToolcraftControlSchema): ToolcraftSliderRange {
  return state.controlRanges[control.target] ?? getToolcraftInitialSliderRange(control);
}

export function getToolcraftVisibleSliderRange(range: ToolcraftSliderRange, value: unknown): ToolcraftSliderRange {
  const values = Array.isArray(value) ? value : [value];
  const finite = values.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry));
  return { min: Math.min(range.min, ...finite), max: Math.max(range.max, ...finite) };
}

export type ToolcraftSliderEditResult = { accepted: false; error: string } | {
  accepted: true; range: ToolcraftSliderRange; value: number | number[];
};

/** Validate before changing either value or scale. Renderer and reducer share this policy. */
export function resolveToolcraftSliderEdit(state: ToolcraftState, target: string, candidate: unknown, displayedValue?: unknown, reason?: "reset"): ToolcraftSliderEditResult {
  const reject = (error: string): ToolcraftSliderEditResult => ({ accepted: false, error });
  const control = getToolcraftValueControls(state.schema).get(target);
  if (!control?.editableRange || control.disabled) return reject("This slider range cannot be edited.");
  const isPair = control.type === "rangeSlider";
  if ((isPair && (!Array.isArray(candidate) || candidate.length !== 2)) || (!isPair && typeof candidate !== "number")) {
    return reject(isPair ? "Enter two ordered numbers." : "Enter a valid number.");
  }
  const values: unknown[] = Array.isArray(candidate) ? candidate : [candidate];
  if (!values.every((value): value is number => typeof value === "number" && Number.isFinite(value))) return reject("Enter finite numbers.");
  const { hardMin, hardMax } = control.editableRange;
  if (hardMin !== undefined && values.some(value => value < hardMin)) return reject(`Minimum value is ${hardMin}.`);
  if (hardMax !== undefined && values.some(value => value > hardMax)) return reject(`Maximum value is ${hardMax}.`);
  const step = control.step ?? (isPair ? 0.1 : 1);
  const origin = control.min ?? 0;
  const snapped = values.map(value => Number((origin + Math.round((value - origin) / step) * step).toPrecision(15)));
  if (hardMin !== undefined && snapped.some(value => value < hardMin) ||
      hardMax !== undefined && snapped.some(value => value > hardMax)) return reject("The nearest step falls outside the allowed limits.");
  const before = getToolcraftVisibleSliderRange(getToolcraftControlRange(state, control), displayedValue ?? state.values[target]);
  const current = displayedValue ?? state.values[target];
  const value = snapped[0]!;
  const range = reason === "reset" ? getToolcraftVisibleSliderRange(before, snapped) : isPair ? { min: value, max: snapped[1]! } : {
    min: value < before.min || current === before.min && value < before.max ? value : before.min,
    max: value > before.max || current === before.max && value > before.min ? value : before.max,
  };
  const error = getToolcraftSliderRangeError(control, range);
  if (error) return reject(error);
  for (const group of state.timeline.keyframeGroups) {
    if (group.controlId !== target) continue;
    for (const keyframe of group.keyframes) {
      const values = Array.isArray(keyframe.value) ? keyframe.value : [keyframe.value];
      if (values.some(value => typeof value === "number" && (value < range.min || value > range.max))) {
        return reject("Range must include existing keyframe values.");
      }
    }
  }
  return { accepted: true, range, value: isPair ? snapped : value };
}
