import { resolveToolcraftCollectionItemIndex } from "../schema/collection-identity";
import type {
  ReadonlyToolcraftState,
  ToolcraftReadonly,
} from "./readonly-state";
import type {
  ToolcraftTimelineBezierControlPoints,
  ToolcraftTimelineKeyframe,
  ToolcraftTimelineKeyframeEasing,
  ToolcraftTimelineKeyframeGroup,
} from "./types";
import {
  getToolcraftCollectionActionsControls,
  isToolcraftCollectionFieldKeyframeable,
} from "../schema/collection-actions";
import type { ToolcraftCollectionItemControlSchema } from "../schema/types";
import {
  decodeToolcraftCollectionItemControlAddress,
  type ToolcraftCollectionItemControlAddress,
} from "./collection-control-address";
import { decodeToolcraftBuiltInControlValue } from "./control-value-codecs";

export {
  decodeToolcraftCollectionItemControlAddress,
  getToolcraftCollectionItemControlAddress,
  toolcraftCollectionItemControlAddressPrefix,
} from "./collection-control-address";

function getLiveCollectionField(
  state: ReadonlyToolcraftState,
  address: ToolcraftCollectionItemControlAddress,
): ToolcraftCollectionItemControlSchema | undefined {
  const control = getToolcraftCollectionActionsControls(
    state.schema.panels.controls,
  ).get(address.collectionTarget);
  const field = control?.itemControls?.[address.fieldId];
  const items = state.values[address.collectionTarget];

  return control &&
    field &&
    isToolcraftCollectionFieldKeyframeable(field) &&
    Array.isArray(items) &&
    resolveToolcraftCollectionItemIndex(control, items, { itemId: address.itemId, itemIndex: address.index }) >= 0
    ? field
    : undefined;
}

function resolveCollectionAddressIndex(state: ReadonlyToolcraftState, address: ToolcraftCollectionItemControlAddress, items: readonly unknown[]): number {
  const control = getToolcraftCollectionActionsControls(state.schema.panels.controls).get(address.collectionTarget);
  return control ? resolveToolcraftCollectionItemIndex(control, items, { itemId: address.itemId, itemIndex: address.index }) : -1;
}

function decodeEvaluatedCollectionField(
  field: ToolcraftCollectionItemControlSchema,
  candidate: unknown,
  fallback: unknown,
): unknown {
  const decoded = decodeToolcraftBuiltInControlValue(field, candidate);
  return decoded?.accepted ? decoded.value : fallback;
}

const defaultTimelineKeyframeEasing: ToolcraftTimelineKeyframeEasing = {
  controlPoints: [0.65, 0, 0.35, 1],
  type: "bezier",
};

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function getBezierPoint(
  time: number,
  firstControlPoint: number,
  secondControlPoint: number,
): number {
  const inverseTime = 1 - time;

  return (
    3 * inverseTime * inverseTime * time * firstControlPoint +
    3 * inverseTime * time * time * secondControlPoint +
    time * time * time
  );
}

function getBezierYForX(
  progress: number,
  [x1, y1, x2, y2]: ToolcraftReadonly<ToolcraftTimelineBezierControlPoints>,
): number {
  let min = 0;
  let max = 1;
  let time = progress;

  for (let index = 0; index < 30; index += 1) {
    time = (min + max) / 2;

    if (getBezierPoint(time, x1, x2) < progress) {
      min = time;
    } else {
      max = time;
    }
  }

  return clampUnit(getBezierPoint(time, y1, y2));
}

function easeProgress(
  progress: number,
  easing: ToolcraftReadonly<ToolcraftTimelineKeyframeEasing> | undefined,
): number {
  const clampedProgress = clampUnit(progress);
  const resolvedEasing = easing ?? defaultTimelineKeyframeEasing;

  if (resolvedEasing.type === "step") {
    return clampedProgress >= 1 ? 1 : 0;
  }

  return getBezierYForX(clampedProgress, resolvedEasing.controlPoints);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function interpolateToolcraftValue(
  fromValue: unknown,
  toValue: unknown,
  progress: number,
): unknown {
  if (typeof fromValue === "number" && typeof toValue === "number") {
    return fromValue + (toValue - fromValue) * progress;
  }

  if (
    Array.isArray(fromValue) &&
    Array.isArray(toValue) &&
    fromValue.length === toValue.length
  ) {
    return fromValue.map((item, index) =>
      interpolateToolcraftValue(item, toValue[index], progress),
    );
  }

  if (isPlainRecord(fromValue) && isPlainRecord(toValue)) {
    const fromKeys = Object.keys(fromValue);
    const toKeys = Object.keys(toValue);

    if (
      fromKeys.length === toKeys.length &&
      fromKeys.every((key) =>
        Object.prototype.hasOwnProperty.call(toValue, key),
      )
    ) {
      return Object.fromEntries(
        fromKeys.map((key) => [
          key,
          interpolateToolcraftValue(fromValue[key], toValue[key], progress),
        ]),
      );
    }
  }

  return progress >= 1 ? toValue : fromValue;
}

function getKeyframeRuntimeValue(
  keyframe: ToolcraftReadonly<ToolcraftTimelineKeyframe>,
): unknown {
  return "value" in keyframe ? keyframe.value : undefined;
}

function getEvaluatedTimelineGroupValue(
  group: ToolcraftReadonly<ToolcraftTimelineKeyframeGroup>,
  timeSeconds: number,
  fallbackValue: unknown,
): unknown {
  const keyframes = group.keyframes
    .filter((keyframe) => "value" in keyframe)
    .sort((first, second) => first.timeSeconds - second.timeSeconds);

  if (keyframes.length === 0) {
    return fallbackValue;
  }

  const firstKeyframe = keyframes[0];
  const lastKeyframe = keyframes[keyframes.length - 1];

  if (!firstKeyframe || !lastKeyframe) {
    return fallbackValue;
  }

  if (timeSeconds <= firstKeyframe.timeSeconds) {
    return getKeyframeRuntimeValue(firstKeyframe);
  }

  if (timeSeconds >= lastKeyframe.timeSeconds) {
    return getKeyframeRuntimeValue(lastKeyframe);
  }

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const fromKeyframe = keyframes[index];
    const toKeyframe = keyframes[index + 1];

    if (!fromKeyframe || !toKeyframe) {
      continue;
    }

    if (
      timeSeconds < fromKeyframe.timeSeconds ||
      timeSeconds > toKeyframe.timeSeconds
    ) {
      continue;
    }

    const durationSeconds = toKeyframe.timeSeconds - fromKeyframe.timeSeconds;
    const progress =
      durationSeconds <= 0
        ? 1
        : (timeSeconds - fromKeyframe.timeSeconds) / durationSeconds;
    const easedProgress = easeProgress(progress, fromKeyframe.easing);

    return interpolateToolcraftValue(
      getKeyframeRuntimeValue(fromKeyframe),
      getKeyframeRuntimeValue(toKeyframe),
      easedProgress,
    );
  }

  return fallbackValue;
}

export function evaluateToolcraftTimelineValue(
  state: ReadonlyToolcraftState,
  target: string,
  timeSeconds = state.timeline.currentTimeSeconds,
): unknown {
  const group = state.timeline.keyframeGroups.find(
    (item) => item.controlId === target,
  );

  const nestedAddress = decodeToolcraftCollectionItemControlAddress(target);
  if (nestedAddress) {
    const field = getLiveCollectionField(state, nestedAddress);
    if (!field) return undefined;
    const parent = state.values[nestedAddress.collectionTarget];
    const fallback = Array.isArray(parent)
      ? (parent[resolveCollectionAddressIndex(state, nestedAddress, parent)] as Record<string, unknown> | undefined)?.[
          nestedAddress.fieldId
        ]
      : undefined;
    return decodeEvaluatedCollectionField(
      field,
      group
        ? getEvaluatedTimelineGroupValue(group, timeSeconds, fallback)
        : fallback,
      fallback,
    );
  }

  let value = group
    ? getEvaluatedTimelineGroupValue(group, timeSeconds, state.values[target])
    : state.values[target];
  const nestedGroups = state.timeline.keyframeGroups.flatMap((item) => {
    const address = decodeToolcraftCollectionItemControlAddress(item.controlId);
    if (address?.collectionTarget !== target) return [];
    const field = getLiveCollectionField(state, address);
    return field ? [{ address, field, group: item }] : [];
  });
  if (!Array.isArray(value) || nestedGroups.length === 0) return value;

  const next = value.map((item) => (isPlainRecord(item) ? { ...item } : item));
  for (const nested of nestedGroups) {
    const item = next[resolveCollectionAddressIndex(state, nested.address, next)];
    if (!isPlainRecord(item)) continue;
    item[nested.address.fieldId] = decodeEvaluatedCollectionField(
      nested.field,
      getEvaluatedTimelineGroupValue(
        nested.group,
        timeSeconds,
        item[nested.address.fieldId],
      ),
      item[nested.address.fieldId],
    );
  }
  return next;
}

export function evaluateToolcraftTimelineValues(
  state: ReadonlyToolcraftState,
  timeSeconds = state.timeline.currentTimeSeconds,
): Record<string, unknown> {
  const values = { ...state.values };

  for (const group of state.timeline.keyframeGroups) {
    if (decodeToolcraftCollectionItemControlAddress(group.controlId)) continue;
    values[group.controlId] = getEvaluatedTimelineGroupValue(
      group,
      timeSeconds,
      state.values[group.controlId],
    );
  }

  const collectionTargets = new Set(
    state.timeline.keyframeGroups.flatMap((group) => {
      const address = decodeToolcraftCollectionItemControlAddress(
        group.controlId,
      );
      return address ? [address.collectionTarget] : [];
    }),
  );
  for (const target of collectionTargets) {
    values[target] = evaluateToolcraftTimelineValue(
      { ...state, values },
      target,
      timeSeconds,
    );
  }

  return values;
}
