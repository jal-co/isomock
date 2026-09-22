"use client";
import * as React from "react";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import {
  Button,
  PanelSection,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/toolcraft/ui";

import type { ResolvedToolcraftControlSectionSchema } from "../../../schema/types";
import { toolcraftRuntimeDefaultsSectionId } from "../../../schema/runtime-defaults-section";
import type { ToolcraftStoreDependency } from "../../../state/toolcraft-external-store-dependencies";
import type {
  ToolcraftCommand,
  ToolcraftState,
  ToolcraftTimelineKeyframeGroup,
} from "../../../state/types";
import { useToolcraftDependencySelector } from "../../app-shell/toolcraft-selectors";
import type { ToolcraftControlRendererMap } from "../control-renderers";
import { getControlsPanelTargetDependencies } from "../conditions/control-condition-dependencies";
import { getToolcraftTargetValue } from "../conditions/control-conditions";
import {
  createControlsPanelKeyframeActions,
  getControlsPanelSectionHeaderKeyframeEntry,
} from "../keyframes/controls-panel-keyframes";
import type { ActionControlRunAction } from "../renderers/controls-panel-action-renderer";
import { formatControlValueLabel } from "../values/controls-panel-values";
import {
  ControlsPanelControlGroup,
  type ControlsPanelSetControlValue,
} from "./controls-panel-control-group";
import {
  getInlineLayoutGroupByControlId,
  renderControlLayoutGroups,
  shouldHideToggleParameterControlLabel,
} from "./controls-panel-inline-layout";
import {
  type ControlEntry,
  getControlName,
  getControlRenderGroupIds,
  getControlRenderGroups,
  getControlsPanelRenderableEntries,
  getControlsRecord,
  getRenderedControlsSectionTitle,
  isColorOnlySection,
} from "./controls-panel-layout";

export type ControlsPanelSectionGroupsArgs = {
  controlRenderers?: ToolcraftControlRendererMap;
  dispatch: React.Dispatch<ToolcraftCommand>;
  dispatchCommand: (command: ToolcraftCommand) => void;
  entries: readonly ControlEntry[];
  headerKeyframeTarget: string | null;
  keyframesSupported: boolean;
  runAction: ActionControlRunAction;
  section: ResolvedToolcraftControlSectionSchema;
  setControlValue: ControlsPanelSetControlValue;
  vectorPadShape: "compact" | "square";
};

export type ControlsPanelSectionProps = Omit<
  ControlsPanelSectionGroupsArgs,
  "headerKeyframeTarget"
> & {
  "data-toolcraft-panel-section": "";
  actionGroup: ResolvedToolcraftControlSectionSchema["actionGroup"];
  collapsed: boolean;
  onCollapsedChange: (sectionCollapseKey: string, collapsed: boolean) => void;
  sectionCollapseKey: string;
  sectionNavigationId?: string;
};

type ControlsPanelSectionHeaderActionProps = {
  dispatchCommand: (command: ToolcraftCommand) => void;
  entries: readonly ControlEntry[];
  headerKeyframeTarget: string | null;
  keyframesSupported: boolean;
  renderedSectionTitle: React.ReactNode;
  resetEnabled: boolean;
  sectionControls: ResolvedToolcraftControlSectionSchema["controls"];
};

type SectionKeyframeSelection = {
  group: ToolcraftTimelineKeyframeGroup | undefined;
  keyframeControlsEnabled: boolean;
  selectedKeyframeId: string | null;
  value: unknown;
};

function sectionKeyframeSelectionsEqual(
  previous: SectionKeyframeSelection,
  next: SectionKeyframeSelection,
): boolean {
  return (
    Object.is(previous.group, next.group) &&
    previous.keyframeControlsEnabled === next.keyframeControlsEnabled &&
    previous.selectedKeyframeId === next.selectedKeyframeId &&
    Object.is(previous.value, next.value)
  );
}

function getHeaderKeyframeDependencies(
  target: string | null,
): ToolcraftStoreDependency[] {
  if (!target) {
    return [];
  }

  return [
    ...getControlsPanelTargetDependencies([target]),
    { kind: "keyframeGroup", target },
    { kind: "keyframeSelection", target },
    { kind: "timeline.expanded" },
  ];
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

function sectionPropsEqual(
  previous: ControlsPanelSectionProps,
  next: ControlsPanelSectionProps,
): boolean {
  return (
    previous.actionGroup === next.actionGroup &&
    previous.collapsed === next.collapsed &&
    previous.controlRenderers === next.controlRenderers &&
    previous.dispatch === next.dispatch &&
    previous.dispatchCommand === next.dispatchCommand &&
    entriesEqual(previous.entries, next.entries) &&
    previous.keyframesSupported === next.keyframesSupported &&
    previous.onCollapsedChange === next.onCollapsedChange &&
    previous.runAction === next.runAction &&
    previous.section === next.section &&
    previous.sectionCollapseKey === next.sectionCollapseKey &&
    previous.sectionNavigationId === next.sectionNavigationId &&
    previous.setControlValue === next.setControlValue &&
    previous.vectorPadShape === next.vectorPadShape
  );
}

export const ControlsPanelSectionHeaderAction = React.memo(
  function ControlsPanelSectionHeaderAction({
    dispatchCommand,
    entries,
    headerKeyframeTarget,
    keyframesSupported,
    renderedSectionTitle,
    resetEnabled,
    sectionControls,
  }: ControlsPanelSectionHeaderActionProps): React.JSX.Element | null {
    const headerKeyframeEntry =
      keyframesSupported && headerKeyframeTarget
        ? getControlsPanelSectionHeaderKeyframeEntry(
            entries,
            renderedSectionTitle,
          )
        : null;
    const dependencies = React.useMemo(
      () => getHeaderKeyframeDependencies(headerKeyframeTarget),
      [headerKeyframeTarget],
    );
    const selection = useToolcraftDependencySelector(
      React.useCallback(
        (state: ToolcraftState): SectionKeyframeSelection => {
          const group = headerKeyframeTarget
            ? state.timeline.keyframeGroups.find(
                (candidate) => candidate.controlId === headerKeyframeTarget,
              )
            : undefined;

          return {
            group,
            keyframeControlsEnabled:
              headerKeyframeTarget !== null && state.timeline.expanded,
            selectedKeyframeId:
              group?.keyframes.some(
                (keyframe) => keyframe.id === state.timeline.selectedKeyframeId,
              ) === true
                ? state.timeline.selectedKeyframeId
                : null,
            value: headerKeyframeTarget
              ? getToolcraftTargetValue(state, headerKeyframeTarget)
              : undefined,
          };
        },
        [headerKeyframeTarget],
      ),
      sectionKeyframeSelectionsEqual,
      dependencies,
    );
    const getControlValue = (): unknown =>
      selection.value ?? headerKeyframeEntry?.[1].defaultValue;
    const keyframeActions = createControlsPanelKeyframeActions({
      dispatchCommand,
      formatValueLabel: formatControlValueLabel,
      getControlName,
      getControlValue,
      keyframeControlsEnabled: selection.keyframeControlsEnabled,
      keyframedControlIds: new Set(
        selection.group ? [selection.group.controlId] : [],
      ),
      keyframeGroups: selection.group ? [selection.group] : [],
      selectedKeyframeId: selection.selectedKeyframeId,
    });
    const keyframeAction = headerKeyframeEntry
      ? keyframeActions.getSectionHeaderKeyframeAction(headerKeyframeEntry)
      : null;
    const resetLabel = `Reset ${
      typeof renderedSectionTitle === "string"
        ? renderedSectionTitle
        : "section"
    } section`;

    if (!keyframeAction && !resetEnabled) {
      return null;
    }

    return (
      <>
        {keyframeAction}
        {resetEnabled ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={resetLabel}
                  data-control-section-reset-button=""
                  onClick={() => {
                    dispatchCommand({
                      label: resetLabel,
                      targets: Array.from(
                        new Set(Object.values(sectionControls).map((control) => control.target)),
                      ),
                      type: "controls.resetTargets",
                    });
                  }}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                />
              }
            >
              <ArrowCounterClockwiseIcon />
            </TooltipTrigger>
            <TooltipContent side="top">{resetLabel}</TooltipContent>
          </Tooltip>
        ) : null}
      </>
    );
  },
);

export const ControlsPanelSection = React.memo(function ControlsPanelSection({
  actionGroup,
  collapsed,
  controlRenderers,
  dispatch,
  dispatchCommand,
  entries,
  keyframesSupported,
  onCollapsedChange,
  runAction,
  section,
  sectionCollapseKey,
  sectionNavigationId,
  setControlValue,
  vectorPadShape,
}: ControlsPanelSectionProps): React.JSX.Element {
  const renderableEntries = getControlsPanelRenderableEntries(entries);
  const isDefaultsSection = section.id === toolcraftRuntimeDefaultsSectionId;
  const renderedSectionTitle = isDefaultsSection
    ? undefined
    : getRenderedControlsSectionTitle(section);
  const isSectionCollapsible = renderedSectionTitle !== undefined;
  const headerKeyframeEntry = keyframesSupported
    ? getControlsPanelSectionHeaderKeyframeEntry(entries, section.title)
    : null;
  const headerKeyframeTarget = headerKeyframeEntry?.[1].target ?? null;

  return (
    <PanelSection
      data-toolcraft-controls-section-anchor={sectionNavigationId}
      action={
        isSectionCollapsible || headerKeyframeTarget ? (
          <ControlsPanelSectionHeaderAction
            dispatchCommand={dispatchCommand}
            entries={entries}
            headerKeyframeTarget={headerKeyframeTarget}
            keyframesSupported={keyframesSupported}
            renderedSectionTitle={section.title}
            resetEnabled={isSectionCollapsible}
            sectionControls={section.controls}
          />
        ) : undefined
      }
      actionGroup={actionGroup}
      allowCompoundDividers={renderableEntries.length > 1}
      collapsed={isSectionCollapsible && collapsed}
      collapsible={isSectionCollapsible}
      description={section.description}
      onCollapsedChange={(nextCollapsed) => {
        onCollapsedChange(sectionCollapseKey, nextCollapsed);
      }}
      spacing={isDefaultsSection ? "technical" : "default"}
      title={renderedSectionTitle}
    >
      {getControlsPanelSectionGroups({
        controlRenderers,
        dispatch,
        dispatchCommand,
        entries,
        headerKeyframeTarget,
        keyframesSupported,
        runAction,
        section,
        setControlValue,
        vectorPadShape,
      })}
    </PanelSection>
  );
}, sectionPropsEqual);

export function getControlsPanelSectionGroups({
  controlRenderers,
  dispatch,
  dispatchCommand,
  entries,
  headerKeyframeTarget,
  keyframesSupported,
  runAction,
  section,
  setControlValue,
  vectorPadShape,
}: ControlsPanelSectionGroupsArgs): React.ReactNode[] {
  const renderableEntries = getControlsPanelRenderableEntries(entries);
  const visibleControls = getControlsRecord(renderableEntries);
  const sectionHasOnlyColorFields = isColorOnlySection(renderableEntries);
  const inlineLayoutGroupByControlId = getInlineLayoutGroupByControlId({
    controlsById: visibleControls,
    layoutGroups: section.layoutGroups,
  });
  const renderedGroups = getControlRenderGroups(
    renderableEntries,
    sectionHasOnlyColorFields,
  ).map(
    (group) => {
      const ids = getControlRenderGroupIds(group);
      const groupEntries =
        group.kind === "colorGroup" ? group.entries : [group.entry];
      const singleEntry = group.kind === "control" ? group.entry : undefined;
      const inlineLayoutGroup = singleEntry
        ? inlineLayoutGroupByControlId.get(singleEntry[0])
        : undefined;
      const hasVisibleInlinePeer = inlineLayoutGroup?.controls.some(
        (id) => id !== singleEntry?.[0] && visibleControls[id],
      ) ?? false;

      return {
        ids,
        node: (
          <ControlsPanelControlGroup
            plainColorFullWidth={group.kind === "control" && (
              group.plainColorFullWidth === true || hasVisibleInlinePeer
            )}
            controlRenderers={controlRenderers}
            dispatch={dispatch}
            dispatchCommand={dispatchCommand}
            entries={groupEntries}
            headerKeyframeTarget={headerKeyframeTarget}
            hideControlLabel={
              singleEntry
                ? shouldHideToggleParameterControlLabel({
                    control: singleEntry[1],
                    controlsById: visibleControls,
                    layoutGroup: inlineLayoutGroup,
                  })
                : false
            }
            key={ids.join("|")}
            keyframesSupported={keyframesSupported}
            runAction={runAction}
            sectionHasOnlyColorFields={sectionHasOnlyColorFields}
            sectionTitle={section.title}
            setControlValue={setControlValue}
            vectorPadShape={vectorPadShape}
          />
        ),
      };
    },
  );

  return renderControlLayoutGroups({
    controlsById: visibleControls,
    layoutGroups: section.layoutGroups,
    renderedGroups,
  });
}
