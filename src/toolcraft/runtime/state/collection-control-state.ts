import { getToolcraftCollectionItemIdentity, isToolcraftCollectionItemId, resolveToolcraftCollectionItemIndex } from "../schema/collection-identity";
import {
  getToolcraftCollectionActionsControls,
  isToolcraftCollectionItemControlAddress,
  isToolcraftCollectionFieldKeyframeable,
} from "../schema/collection-actions";
import { getToolcraftCollectionItemDefault } from "../schema/collection-item-defaults";
import type { ResolvedToolcraftControlSchema } from "../schema/types";
import {
  cloneToolcraftJsonValue,
  decodeToolcraftBuiltInControlValue,
} from "./control-value-codecs";
import {
  decodeToolcraftCollectionItemControlAddress,
  getToolcraftCollectionItemControlAddress,
} from "./collection-control-address";
import type {
  ToolcraftCommand,
  ToolcraftState,
  ToolcraftTimelineKeyframeGroup,
  ToolcraftTimelineState,
} from "./types";
import { commitToolcraftControlStateReplacement } from "./control-state-replacement";
import { normalizeToolcraftControlValue } from "./control-value-normalization";
import { upsertToolcraftTimelineControlValue } from "./timeline-keyframe-data";
import { getToolcraftSelectedKeyframeTime } from "./selected-keyframe-time";
import { formatToolcraftControlValueLabel } from "./control-value-labels";

export function getToolcraftCollectionControl(
  state: Pick<ToolcraftState, "schema">,
  target: string,
): ResolvedToolcraftControlSchema | undefined {
  return getToolcraftCollectionActionsControls(
    state.schema.panels.controls,
  ).get(target);
}

export function createToolcraftCollectionSelectionDefaults(
  schema: ToolcraftState["schema"],
): Record<string, null> {
  return Object.fromEntries(
    [
      ...getToolcraftCollectionActionsControls(schema.panels.controls).values(),
    ].flatMap((control) =>
      control.selectionTarget ? [[control.selectionTarget, null] as const] : [],
    ),
  );
}

export function normalizeToolcraftCollectionSelections({
  controls,
  values,
}: {
  controls: ReadonlyMap<string, ResolvedToolcraftControlSchema>;
  values: Record<string, unknown>;
}): Record<string, unknown> {
  const nextValues = { ...values };
  for (const control of controls.values()) {
    const target = control.selectionTarget;
    if (!target) continue;
    const items = nextValues[control.target];
    const selection = nextValues[target];
    nextValues[target] = Array.isArray(items) && resolveToolcraftCollectionItemIndex(control, items,
      control.identityField ? { itemId: selection as string | null } : { itemIndex: selection as number | null }) >= 0 ? selection : null;
  }
  return nextValues;
}

export function applyToolcraftCollectionParentReplacements({
  replacedTargets,
  state,
  values,
}: {
  replacedTargets: ReadonlySet<string>;
  state: ToolcraftState;
  values: Record<string, unknown>;
}): Pick<ToolcraftState, "timeline" | "values"> {
  const controls = getToolcraftCollectionActionsControls(
    state.schema.panels.controls,
  );
  const collectionTargets = [...replacedTargets].filter((target) =>
    controls.has(target),
  );
  let timeline = state.timeline;
  for (const target of collectionTargets) {
    const control = controls.get(target)!;
    const items = values[target];
    const keep = control.identityField && Array.isArray(items)
      ? new Set(items.map((item, index) => getToolcraftCollectionItemIdentity(control, item, index) as string)) : 0;
    timeline = pruneToolcraftCollectionKeyframes(timeline, target, keep);
  }
  return {
    timeline,
    values: normalizeToolcraftCollectionSelections({
      controls,
      values,
    }),
  };
}

export function createToolcraftCollectionItem(
  control: ResolvedToolcraftControlSchema,
): unknown {
  const value = getToolcraftCollectionItemDefault(control);
  return value === undefined ? undefined : cloneToolcraftJsonValue(value);
}

function createCanonicalCollectionItem(
  control: ResolvedToolcraftControlSchema,
  itemId?: string,
): unknown {
  const draft = createToolcraftCollectionItem(control);
  if (draft === undefined) return undefined;
  const candidate = control.identityField && draft && typeof draft === "object" ? { ...draft, [control.identityField]: itemId } : draft;
  const normalized = normalizeToolcraftControlValue(control, [candidate]);
  return normalized.accepted && Array.isArray(normalized.value)
    ? normalized.value[0]
    : undefined;
}

export function getToolcraftCollectionItems(
  state: ToolcraftState,
  control: ResolvedToolcraftControlSchema,
): readonly unknown[] | null {
  const value = state.values[control.target];
  return Array.isArray(value) ? value : null;
}

export function decodeToolcraftCollectionFieldValue(
  control: ResolvedToolcraftControlSchema,
  fieldId: string,
  candidate: unknown,
): { accepted: true; value: unknown } | { accepted: false } {
  const field = control.itemControls?.[fieldId];
  if (!field) return { accepted: false };
  return (
    decodeToolcraftBuiltInControlValue(field, candidate) ?? { accepted: false }
  );
}

export function getToolcraftCollectionFieldAddress(
  control: ResolvedToolcraftControlSchema,
  identity: number | string,
  fieldId: string,
): string | null {
  const field = control.itemControls?.[fieldId];
  if (!field || !isToolcraftCollectionFieldKeyframeable(field)) return null;
  return getToolcraftCollectionItemControlAddress(
    control.target,
    identity,
    fieldId,
  );
}

export function pruneToolcraftCollectionKeyframes(
  timeline: ToolcraftTimelineState,
  collectionTarget: string,
  keep: number | ReadonlySet<string> = 0,
): ToolcraftTimelineState {
  const removedIds = new Set<string>();
  const keyframeGroups = timeline.keyframeGroups.filter((group) => {
    const address = decodeToolcraftCollectionItemControlAddress(
      group.controlId,
    );
    const remove =
      address?.collectionTarget === collectionTarget &&
      (typeof keep === "number" ? address.itemId !== undefined || address.index >= keep : address.itemId === undefined || !keep.has(address.itemId));
    if (remove) {
      for (const keyframe of group.keyframes) removedIds.add(keyframe.id);
    }
    return !remove;
  });
  if (keyframeGroups.length === timeline.keyframeGroups.length) return timeline;
  return {
    ...timeline,
    keyframeGroups,
    selectedKeyframeId:
      timeline.selectedKeyframeId && removedIds.has(timeline.selectedKeyframeId)
        ? null
        : timeline.selectedKeyframeId,
  };
}

export function normalizeToolcraftCollectionKeyframeGroups({
  controls,
  groups,
  values,
}: {
  controls: ReadonlyMap<string, ResolvedToolcraftControlSchema>;
  groups: readonly ToolcraftTimelineKeyframeGroup[];
  values: Readonly<Record<string, unknown>>;
}): ToolcraftTimelineKeyframeGroup[] {
  return groups.flatMap((group) => {
    const address = decodeToolcraftCollectionItemControlAddress(
      group.controlId,
    );
    if (!address) {
      return isToolcraftCollectionItemControlAddress(group.controlId)
        ? []
        : [group];
    }
    const control = controls.get(address.collectionTarget);
    const items = values[address.collectionTarget];
    const field = control?.itemControls?.[address.fieldId];
    if (
      !control ||
      !Array.isArray(items) ||
      resolveToolcraftCollectionItemIndex(control, items, { itemId: address.itemId, itemIndex: address.index }) < 0 ||
      !field ||
      !isToolcraftCollectionFieldKeyframeable(field)
    )
      return [];
    const keyframes = group.keyframes.flatMap((keyframe) => {
      const decoded = decodeToolcraftBuiltInControlValue(field, keyframe.value);
      return decoded?.accepted ? [{ ...keyframe, value: decoded.value }] : [];
    });
    return keyframes.length ? [{ ...group, keyframes }] : [];
  });
}

type ToolcraftCollectionCommand = Extract<
  ToolcraftCommand,
  {
    type:
      | "controls.addCollectionItem"
      | "controls.removeCollectionItem"
      | "controls.selectCollectionItem"
      | "controls.setCollectionItemField";
  }
>;

function getNextSelectionAfterRemoval(
  selection: unknown,
  removedIndex: number,
  nextLength: number,
): number | null {
  if (selection !== removedIndex) return selection as number | null;
  return nextLength > 0 ? nextLength - 1 : null;
}

export function reduceToolcraftCollectionCommand(
  state: ToolcraftState,
  command: ToolcraftCollectionCommand,
): ToolcraftState {
  const control = getToolcraftCollectionControl(state, command.target);
  if (!control) return state;
  const items = getToolcraftCollectionItems(state, control);
  if (!items) return state;

  switch (command.type) {
    case "controls.addCollectionItem": {
      const hardMax = control.hardMaxItems;
      if (typeof hardMax === "number" && items.length >= hardMax) return state;
      if (control.identityField && (!isToolcraftCollectionItemId(command.itemId) || items.some(item => (item as Record<string, unknown>)[control.identityField!] === command.itemId))) return state;
      const item = createCanonicalCollectionItem(control, command.itemId);
      if (item === undefined) return state;
      const nextItems = [...items, item];
      const selectionTarget = control.selectionTarget;
      const after = {
        [control.target]: nextItems,
        ...(selectionTarget ? { [selectionTarget]: getToolcraftCollectionItemIdentity(control, item, nextItems.length - 1) } : {}),
      };
      return commitToolcraftControlStateReplacement(
        state,
        {
          timeline: state.timeline,
          values: { ...state.values, ...after },
        },
        command.label ?? `Add ${control.itemLabel ?? "item"}`,
      );
    }

    case "controls.removeCollectionItem": {
      const minItems = control.minItems ?? 0;
      if (items.length <= minItems) return state;
      const removedIndex = control.identityField
        ? resolveToolcraftCollectionItemIndex(control, items, { itemId: command.itemId })
        : command.itemId === undefined ? items.length - 1 : -1;
      if (removedIndex < 0) return state;
      const nextItems = items.filter((_, index) => index !== removedIndex);
      const timeline = pruneToolcraftCollectionKeyframes(
        state.timeline, control.target, control.identityField
          ? new Set(nextItems.map((item, index) => getToolcraftCollectionItemIdentity(control, item, index) as string))
          : nextItems.length,
      );
      const selectionTarget = control.selectionTarget;
      const priorSelection = selectionTarget ? state.values[selectionTarget] : null;
      const selection = control.identityField
        ? priorSelection === command.itemId ? (nextItems.length ? getToolcraftCollectionItemIdentity(control, nextItems[nextItems.length - 1], nextItems.length - 1) : null) : priorSelection
        : getNextSelectionAfterRemoval(priorSelection, removedIndex, nextItems.length);
      return commitToolcraftControlStateReplacement(
        state,
        {
          timeline,
          values: {
            ...state.values,
            [control.target]: nextItems,
            ...(selectionTarget ? { [selectionTarget]: selection } : {}),
          },
        },
        command.label ?? `Remove ${control.itemLabel ?? "item"}`,
      );
    }

    case "controls.selectCollectionItem": {
      const selectionTarget = control.selectionTarget;
      if (!selectionTarget) return state;
      const selection = control.identityField ? command.itemId : command.itemIndex;
      if (control.identityField ? command.itemIndex !== undefined : command.itemId !== undefined) return state;
      if (selection !== null && resolveToolcraftCollectionItemIndex(control, items, command) < 0) return state;
      if (Object.is(state.values[selectionTarget], selection)) return state;
      return { ...state, values: { ...state.values, [selectionTarget]: selection } };
    }

    case "controls.setCollectionItemField": {
      const itemIndex = resolveToolcraftCollectionItemIndex(control, items, command);
      if (itemIndex < 0) return state;
      const decoded = decodeToolcraftCollectionFieldValue(
        control,
        command.fieldId,
        command.value,
      );
      if (!decoded.accepted) return state;
      const currentItem = items[itemIndex];
      if (!currentItem || typeof currentItem !== "object") return state;
      const nextItems = items.map((item, index) =>
        index === itemIndex
          ? { ...currentItem, [command.fieldId]: decoded.value }
          : item,
      );
      const address = getToolcraftCollectionFieldAddress(
        control,
        getToolcraftCollectionItemIdentity(control, currentItem, itemIndex),
        command.fieldId,
      );
      const hasTrack = address
        ? state.timeline.keyframeGroups.some(
            (group) => group.controlId === address,
          )
        : false;
      const timeline =
        hasTrack && address
          ? upsertToolcraftTimelineControlValue(
              {
                ...state,
                values: { ...state.values, [control.target]: nextItems },
              },
              {
                controlId: address,
                controlLabel: command.label ?? command.fieldId,
                timeSeconds:
                  getToolcraftSelectedKeyframeTime(
                    address,
                    state.timeline.keyframeGroups,
                    state.timeline.selectedKeyframeId,
                  ) ?? state.timeline.currentTimeSeconds,
                type: "timeline.upsertControlKeyframe",
                value: decoded.value,
                valueLabel: formatToolcraftControlValueLabel(
                  {
                    ...control.itemControls![command.fieldId]!,
                    applicability: { mode: "always" },
                    target: address,
                  },
                  decoded.value,
                ),
              },
            )
          : state.timeline;
      return commitToolcraftControlStateReplacement(
        state,
        {
          timeline,
          values: { ...state.values, [control.target]: nextItems },
        },
        command.label ?? command.fieldId,
        { group: command.historyGroup, mode: command.history },
      );
    }
  }
}
