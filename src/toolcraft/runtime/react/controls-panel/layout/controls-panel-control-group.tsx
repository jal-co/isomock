"use client";

import * as React from "react";
import type { ControlChangeMeta } from "@/toolcraft/ui";

import { getToolcraftControlKeyframeCapability } from "../../../schema/keyframe-capability";
import type { ToolcraftControlSchema } from "../../../schema/types";
import type { ToolcraftStoreDependency } from "../../../state/toolcraft-external-store-dependencies";
import type {
  ToolcraftCanvasState,
  ToolcraftCommand,
  ToolcraftMediaAsset,
  ToolcraftState,
  ToolcraftTimelineKeyframeGroup,
} from "../../../state/types";
import { useToolcraftDependencySelector } from "../../app-shell/toolcraft-selectors";
import { useToolcraftSourceAssetCoordinator } from "../../app-shell/toolcraft-source-asset-context";
import { useToolcraftStore } from "../../app-shell/toolcraft-store-context";
import type { ToolcraftControlRendererMap } from "../control-renderers";
import {
  getToolcraftControlConditionTargets,
  getToolcraftTargetValue,
  isToolcraftControlDisabled,
  isToolcraftControlVisible,
} from "../conditions/control-conditions";
import { getControlsPanelTargetDependencies } from "../conditions/control-condition-dependencies";
import { createControlsPanelKeyframeActions } from "../keyframes/controls-panel-keyframes";
import { LiveCustomControl } from "../live-custom-control";
import type { ActionControlRunAction } from "../renderers/controls-panel-action-renderer";
import { renderActionControl } from "../renderers/controls-panel-action-renderer";
import { renderBasicControl } from "../renderers/controls-panel-basic-renderers";
import { renderCollectionControl } from "../renderers/controls-panel-collection-renderer";
import {
  renderCompoundColorGroup,
  renderCompoundControl,
} from "../renderers/controls-panel-compound-renderers";
import { renderFileDropControl } from "../renderers/controls-panel-media-renderer";
import {
  getToolcraftControlRendererKind,
  getToolcraftControlRendererStateDependencies,
} from "../renderers/controls-panel-renderer-registry";
import { renderSettingsTransferControl } from "../renderers/controls-panel-settings-transfer-renderer";
import { formatControlValueLabel } from "../values/controls-panel-values";
import { withControlLabelHelp } from "./controls-panel-help";
import {
  type ControlEntry,
  getControlName,
  shouldShowColorFieldLabel,
  withCompoundControlSectionDivider,
} from "./controls-panel-layout";

export type ControlsPanelSetControlValue = (
  target: string,
  value: unknown,
  label?: string,
  meta?: ControlChangeMeta,
) => void;

export type ControlsPanelControlGroupProps = {
  controlRenderers?: ToolcraftControlRendererMap;
  dispatch: React.Dispatch<ToolcraftCommand>;
  dispatchCommand: (command: ToolcraftCommand) => void;
  entries: readonly ControlEntry[];
  headerKeyframeTarget: string | null;
  hideControlLabel: boolean;
  keyframesSupported: boolean;
  plainColorFullWidth: boolean;
  runAction: ActionControlRunAction;
  sectionHasOnlyColorFields: boolean;
  sectionTitle: string | undefined;
  setControlValue: ControlsPanelSetControlValue;
  vectorPadShape: "compact" | "square";
};

type ControlGroupSelection = {
  canvasSize: ToolcraftCanvasState["size"] | null;
  disabledById: Readonly<Record<string, boolean>>;
  keyframeControlsEnabled: boolean;
  keyframeGroups: readonly ToolcraftTimelineKeyframeGroup[];
  mediaAssets: readonly ToolcraftMediaAsset[] | null;
  selectedKeyframeId: string | null;
  valuesByTarget: Readonly<Record<string, unknown>>;
  visible: boolean;
};

function recordValuesEqual(
  previous: Readonly<Record<string, unknown>>,
  next: Readonly<Record<string, unknown>>,
): boolean {
  const keys = Object.keys(previous);

  return (
    keys.length === Object.keys(next).length &&
    keys.every((key) => Object.is(previous[key], next[key]))
  );
}

function controlGroupSelectionsEqual(
  previous: ControlGroupSelection,
  next: ControlGroupSelection,
): boolean {
  return (
    Object.is(previous.canvasSize, next.canvasSize) &&
    recordValuesEqual(previous.disabledById, next.disabledById) &&
    previous.keyframeControlsEnabled === next.keyframeControlsEnabled &&
    previous.keyframeGroups.length === next.keyframeGroups.length &&
    previous.keyframeGroups.every((group, index) =>
      Object.is(group, next.keyframeGroups[index]),
    ) &&
    Object.is(previous.mediaAssets, next.mediaAssets) &&
    previous.selectedKeyframeId === next.selectedKeyframeId &&
    recordValuesEqual(previous.valuesByTarget, next.valuesByTarget) &&
    previous.visible === next.visible
  );
}

function entriesEqual(
  previous: readonly ControlEntry[],
  next: readonly ControlEntry[],
): boolean {
  return (
    previous.length === next.length &&
    previous.every(
      ([id, control], index) =>
        id === next[index]?.[0] && Object.is(control, next[index]?.[1]),
    )
  );
}

function controlGroupPropsEqual(
  previous: ControlsPanelControlGroupProps,
  next: ControlsPanelControlGroupProps,
): boolean {
  return (
    entriesEqual(previous.entries, next.entries) &&
    previous.controlRenderers === next.controlRenderers &&
    previous.dispatch === next.dispatch &&
    previous.dispatchCommand === next.dispatchCommand &&
    previous.headerKeyframeTarget === next.headerKeyframeTarget &&
    previous.hideControlLabel === next.hideControlLabel &&
    previous.keyframesSupported === next.keyframesSupported &&
    previous.plainColorFullWidth === next.plainColorFullWidth &&
    previous.runAction === next.runAction &&
    previous.sectionHasOnlyColorFields === next.sectionHasOnlyColorFields &&
    previous.sectionTitle === next.sectionTitle &&
    previous.setControlValue === next.setControlValue &&
    previous.vectorPadShape === next.vectorPadShape
  );
}

function getSelectedKeyframeId(
  state: ToolcraftState,
  targets: ReadonlySet<string>,
): string | null {
  const selectedKeyframeId = state.timeline.selectedKeyframeId;

  if (!selectedKeyframeId) {
    return null;
  }

  return state.timeline.keyframeGroups.some(
    (group) =>
      targets.has(group.controlId) &&
      group.keyframes.some((keyframe) => keyframe.id === selectedKeyframeId),
  )
    ? selectedKeyframeId
    : null;
}

function getControlGroupDependencies({
  entries,
  keyframeTargets,
  mediaPreviewEnabled,
}: {
  entries: readonly ControlEntry[];
  keyframeTargets: readonly string[];
  mediaPreviewEnabled: boolean;
}): ToolcraftStoreDependency[] {
  const conditionTargets = entries.flatMap(([, control]) =>
    getToolcraftControlConditionTargets(control),
  );
  const valueTargets = entries.flatMap(([, control]) =>
    getToolcraftControlRendererStateDependencies(control.type).includes(
      "value",
    ) || keyframeTargets.includes(control.target)
      ? [
          control.target,
          ...(control.type === "collectionActions" && control.selectionTarget
            ? [control.selectionTarget]
            : []),
        ]
      : [],
  );
  const rendererDependencies = entries.flatMap(([, control]) =>
    getToolcraftControlRendererStateDependencies(control.type),
  );

  return [
    ...getControlsPanelTargetDependencies([
      ...conditionTargets,
      ...valueTargets,
    ]),
    ...(rendererDependencies.includes("canvas.size")
      ? [{ kind: "canvas.size" } as const]
      : []),
    ...(mediaPreviewEnabled && rendererDependencies.includes("mediaAssets")
      ? [{ kind: "mediaAssets" } as const]
      : []),
    ...(keyframeTargets.length > 0
      ? [{ kind: "timeline.expanded" } as const]
      : []),
    ...keyframeTargets.flatMap((target) => [
      { kind: "keyframeGroup", target } as const,
      { kind: "keyframeSelection", target } as const,
    ]),
  ];
}

function withControlTargetBoundary({
  entries,
  node,
}: {
  entries: readonly ControlEntry[];
  node: React.ReactNode;
}): React.ReactNode {
  const controlIds = [...new Set(entries.map(([id]) => id))];
  const targets = [...new Set(entries.map(([, control]) => control.target))];

  return (
    <div
      className="contents"
      data-toolcraft-control-id={
        controlIds.length === 1 ? controlIds[0] : undefined
      }
      data-toolcraft-control-ids={
        controlIds.length > 1 ? JSON.stringify(controlIds) : undefined
      }
      data-toolcraft-control-target={
        targets.length === 1 ? targets[0] : undefined
      }
      data-toolcraft-control-targets={
        targets.length > 1 ? JSON.stringify(targets) : undefined
      }
    >
      {node}
    </div>
  );
}

export const ControlsPanelControlGroup = React.memo(
  function ControlsPanelControlGroup({
    controlRenderers,
    dispatch,
    dispatchCommand,
    entries,
    headerKeyframeTarget,
    hideControlLabel,
    keyframesSupported,
    plainColorFullWidth,
    runAction,
    sectionHasOnlyColorFields,
    sectionTitle,
    setControlValue,
    vectorPadShape,
  }: ControlsPanelControlGroupProps): React.JSX.Element | null {
    const store = useToolcraftStore();
    const sourceAssetCoordinator = useToolcraftSourceAssetCoordinator();
    const mediaPreviewEnabled = !store.getCommittedState().schema.panels.layers;
    const keyframeTargets = React.useMemo(
      () =>
        keyframesSupported
          ? entries.flatMap(([, control]) =>
              getToolcraftControlKeyframeCapability(control).capable
                ? [control.target]
                : [],
            )
          : [],
      [entries, keyframesSupported],
    );
    const keyframeTargetSet = React.useMemo(
      () => new Set(keyframeTargets),
      [keyframeTargets],
    );
    const dependencies = React.useMemo(
      () =>
        getControlGroupDependencies({
          entries,
          keyframeTargets,
          mediaPreviewEnabled,
        }),
      [entries, keyframeTargets, mediaPreviewEnabled],
    );
    const selection = useToolcraftDependencySelector(
      React.useCallback(
        (state: ToolcraftState): ControlGroupSelection => {
          const rendererDependencies = entries.flatMap(([, control]) =>
            getToolcraftControlRendererStateDependencies(control.type),
          );

          return {
            canvasSize: rendererDependencies.includes("canvas.size")
              ? state.canvas.size
              : null,
            disabledById: Object.fromEntries(
              entries.map(([id, control]) => [
                id,
                isToolcraftControlDisabled(state, control),
              ]),
            ),
            keyframeControlsEnabled:
              keyframeTargets.length > 0 && state.timeline.expanded,
            keyframeGroups: state.timeline.keyframeGroups.filter((group) =>
              keyframeTargetSet.has(group.controlId),
            ),
            mediaAssets:
              mediaPreviewEnabled &&
              rendererDependencies.includes("mediaAssets")
                ? state.mediaAssets
                : null,
            selectedKeyframeId: getSelectedKeyframeId(state, keyframeTargetSet),
            valuesByTarget: Object.fromEntries(
              entries.flatMap(([, control]) => [
                [
                  control.target,
                  getToolcraftTargetValue(state, control.target) ??
                    control.defaultValue,
                ],
                ...(control.type === "collectionActions" && control.selectionTarget
                  ? [[control.selectionTarget, state.values[control.selectionTarget]]]
                  : []),
              ]),
            ),
            visible: entries.every(([, control]) =>
              isToolcraftControlVisible(state, control),
            ),
          };
        },
        [
          entries,
          keyframeTargetSet,
          keyframeTargets.length,
          mediaPreviewEnabled,
        ],
      ),
      controlGroupSelectionsEqual,
      dependencies,
    );

    if (!selection.visible) {
      return null;
    }

    const getControlValue = (control: ToolcraftControlSchema): unknown =>
      selection.valuesByTarget[control.target] ?? control.defaultValue;
    const keyframeActions = createControlsPanelKeyframeActions({
      dispatchCommand,
      formatValueLabel: formatControlValueLabel,
      getControlName,
      getControlValue,
      keyframeControlsEnabled: selection.keyframeControlsEnabled,
      keyframedControlIds: new Set(
        selection.keyframeGroups.map((group) => group.controlId),
      ),
      keyframeGroups: selection.keyframeGroups,
      selectedKeyframeId: selection.selectedKeyframeId,
    });

    if (entries.length > 1) {
      return withControlTargetBoundary({
        entries,
        node: renderCompoundColorGroup({
          entries,
          getControlName,
          getControlValue,
          headerKeyframeTarget,
          maybeUpsertControlKeyframe:
            keyframeActions.maybeUpsertControlKeyframe,
          sectionHasOnlyColorFields,
          setControlValue,
          shouldShowColorFieldLabel,
          withKeyframeLabelAction: keyframeActions.withKeyframeLabelAction,
        }),
      }) as React.JSX.Element;
    }

    const entry = entries[0];

    if (!entry) {
      return null;
    }

    const [id, declaredControl] = entry;
    const rawControl = declaredControl;
    const disabled = selection.disabledById[id] === true;
    const resolvedControl =
      disabled === Boolean(rawControl.disabled)
        ? rawControl
        : { ...rawControl, disabled };
    const control =
      hideControlLabel && resolvedControl.label !== false
        ? { ...resolvedControl, label: false }
        : resolvedControl;
    const name = getControlName(id, resolvedControl.label);
    const value = getControlValue(control);
    const usesHeaderKeyframeAction = control.target === headerKeyframeTarget;
    const commitWithLabel =
      (label: string) =>
      (nextValue: unknown, meta?: ControlChangeMeta): void => {
        setControlValue(control.target, nextValue, label, meta);
        keyframeActions.maybeUpsertControlKeyframe(control, label, nextValue);
      };
    const commit = commitWithLabel(name);
    const rendererKind = getToolcraftControlRendererKind(control.type);
    let node: React.ReactNode = null;

    switch (rendererKind) {
      case "action":
        node = renderActionControl({ control, id, name, runAction });
        break;
      case "basic":
        node = renderBasicControl({
          commit,
          control,
          id,
          name,
          usesHeaderKeyframeAction,
          value,
          vectorPadShape,
          withKeyframeLabelAction: keyframeActions.withKeyframeLabelAction,
        });
        break;
      case "canvas-handle":
        node = null;
        break;
      case "collection":
        node = renderCollectionControl({
          control,
          dispatchCommand,
          name,
          selectedIndex:
            control.type === "collectionActions" && control.selectionTarget
              ? (selection.valuesByTarget[control.selectionTarget] as number | null)
              : null,
          setControlValue,
          value,
        });
        break;
      case "compound":
        node = renderCompoundControl({
          plainColorFullWidth,
          commit,
          commitWithLabel,
          control,
          id,
          name,
          sectionHasOnlyColorFields,
          shouldShowColorFieldLabel,
          usesHeaderKeyframeAction,
          value,
          withKeyframeLabelAction: keyframeActions.withKeyframeLabelAction,
        });
        break;
      case "media":
        node = renderFileDropControl({
          canvasSize: selection.canvasSize ?? store.getState().canvas.size,
          control,
          dispatchCommand,
          id,
          layerSelectionEnabled: !mediaPreviewEnabled,
          mediaAssets: mediaPreviewEnabled ? (selection.mediaAssets ?? []) : [],
          name,
          setControlValue,
          sourceAssetCoordinator,
          value,
        });
        break;
      case "settings":
        node = renderSettingsTransferControl({
          getState: store.getState,
          id,
        });
        break;
      case null: {
        const CustomControl = controlRenderers?.[control.type];

        if (CustomControl) {
          node = keyframeActions.withKeyframeLabelAction({
            children: (
              <LiveCustomControl
                control={control}
                controlId={id}
                dispatch={dispatch}
                getKeyframeAction={(liveValue) =>
                  keyframeActions.getKeyframeLabelAction(
                    control,
                    name,
                    liveValue,
                  )
                }
                name={name}
                renderer={CustomControl}
                setValue={commit}
              />
            ),
            control,
            disableAction: usesHeaderKeyframeAction,
            name,
            providerKey: id,
            value,
          });
        }
        break;
      }
    }

    return withControlTargetBoundary({
      entries,
      node: withCompoundControlSectionDivider({
        children: withControlLabelHelp({
          children: node,
          control,
          label: name,
          providerKey: id,
          sectionTitle,
        }),
        control,
      }),
    }) as React.JSX.Element;
  },
  controlGroupPropsEqual,
);
