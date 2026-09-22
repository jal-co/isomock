"use client";

import * as React from "react";

import { getToolcraftCollectionItemIdentity } from "../../../schema/collection-identity";
import type {
  ToolcraftCollectionItemControlSchema,
  ToolcraftControlSchema,
} from "../../../schema/types";
import { getToolcraftCollectionItemControlAddress } from "../../../state/collection-control-address";
import type { ToolcraftStoreDependency } from "../../../state/toolcraft-external-store-dependencies";
import type {
  ToolcraftCommand,
  ToolcraftState,
  ToolcraftTimelineKeyframeGroup,
} from "../../../state/types";
import { useToolcraftDependencySelector } from "../../app-shell/toolcraft-selectors";
import { createControlsPanelKeyframeActions } from "./controls-panel-keyframes";
import { formatControlValueLabel } from "../values/controls-panel-values";

type CollectionKeyframeSelection = Readonly<{
  enabled: boolean;
  groups: readonly ToolcraftTimelineKeyframeGroup[];
  selectedKeyframeId: string | null;
}>;

function selectionsEqual(
  previous: CollectionKeyframeSelection,
  next: CollectionKeyframeSelection,
): boolean {
  return (
    previous.enabled === next.enabled &&
    previous.selectedKeyframeId === next.selectedKeyframeId &&
    previous.groups.length === next.groups.length &&
    previous.groups.every((group, index) => group === next.groups[index])
  );
}

export function useControlsPanelCollectionKeyframes({
  control,
  dispatchCommand,
  items,
}: {
  control: ToolcraftControlSchema;
  dispatchCommand: (command: ToolcraftCommand) => void;
  items: readonly unknown[];
}): (args: {
  children: React.ReactNode;
  field: ToolcraftCollectionItemControlSchema;
  fieldId: string;
  index: number;
  name: string;
  value: unknown;
}) => React.ReactNode {
  const fieldControls = React.useMemo(
    () =>
      items.flatMap((item, index) =>
        Object.entries(control.itemControls ?? {}).flatMap(([fieldId, field]) => {
          if (field.keyframeable !== true) return [];
          const target = getToolcraftCollectionItemControlAddress(
            control.target,
            getToolcraftCollectionItemIdentity(control, item, index),
            fieldId,
          );
          const value =
            typeof item === "object" && item !== null && !Array.isArray(item)
              ? (item as Record<string, unknown>)[fieldId]
              : field.defaultValue;
          return [[target, field, value] as const];
        }),
      ),
    [control, items],
  );
  const targetSet = React.useMemo(
    () => new Set(fieldControls.map(([target]) => target)),
    [fieldControls],
  );
  const dependencies = React.useMemo<readonly ToolcraftStoreDependency[]>(
    () => [
      { kind: "timeline.expanded" },
      ...fieldControls.flatMap(([target]) => [
        { kind: "keyframeGroup", target } as const,
        { kind: "keyframeSelection", target } as const,
      ]),
    ],
    [fieldControls],
  );
  const selection = useToolcraftDependencySelector(
    React.useCallback(
      (state: ToolcraftState): CollectionKeyframeSelection => {
        const groups = state.timeline.keyframeGroups.filter((group) =>
          targetSet.has(group.controlId),
        );
        return {
          enabled:
            state.timeline.expanded &&
            state.schema.assembly.capabilities.includes("timeline.keyframes"),
          groups,
          selectedKeyframeId: groups.some((group) =>
            group.keyframes.some(
              (keyframe) => keyframe.id === state.timeline.selectedKeyframeId,
            ),
          )
            ? state.timeline.selectedKeyframeId
            : null,
        };
      },
      [targetSet],
    ),
    selectionsEqual,
    dependencies,
  );
  const controlsByTarget = new Map(
    fieldControls.map(([target, field, value]) => [
      target,
      {
        control: {
          ...field,
          applicability: { mode: "always" as const },
          target,
        } as ToolcraftControlSchema,
        value,
      },
    ]),
  );
  const actions = createControlsPanelKeyframeActions({
    dispatchCommand,
    formatValueLabel: formatControlValueLabel,
    getControlName: (_id, label) =>
      typeof label === "string" ? label : "Collection field",
    getControlValue: (fieldControl) => controlsByTarget.get(fieldControl.target)?.value,
    keyframeControlsEnabled: selection.enabled,
    keyframedControlIds: new Set(selection.groups.map((group) => group.controlId)),
    keyframeGroups: selection.groups,
    selectedKeyframeId: selection.selectedKeyframeId,
  });

  return ({ children, field, fieldId, index, name, value }) => {
    if (field.keyframeable !== true) return children;
    const target = getToolcraftCollectionItemControlAddress(
      control.target,
      getToolcraftCollectionItemIdentity(control, items[index], index),
      fieldId,
    );
    return actions.withKeyframeLabelAction({
      children,
      control: {
        ...field,
        applicability: { mode: "always" },
        target,
      } as ToolcraftControlSchema,
      name,
      providerKey: target,
      value,
    });
  };
}
