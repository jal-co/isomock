"use client";
import * as React from "react";
import { Panel, type ControlChangeMeta } from "@/toolcraft/ui";

import type {
  ResolvedToolcraftControlSectionSchema,
  ResolvedToolcraftControlsPanelSchema,
} from "../../schema/types";
import {
  getToolcraftHistorySourceGeneration,
  type ToolcraftStoreDependency,
} from "../../state/toolcraft-external-store-dependencies";
import { getToolcraftControlsResetHistorySource } from "../../state/history-patch-metadata";
import type {
  ToolcraftCommand,
  ToolcraftPanelState,
  ToolcraftState,
} from "../../state/types";
import { PanelContainer } from "../panel-host/panel-host";
import { useToolcraftPanelBinding } from "../panel-host/use-toolcraft-panel-binding";
import type {
  PanelPlacement,
  PanelStateChange,
} from "../panel-host/panel-host-types";
import { useToolcraftDependencySelector } from "../app-shell/toolcraft-selectors";
import { useToolcraftStore } from "../app-shell/toolcraft-store-context";
import { ToolcraftThemeContext } from "../app-shell/theme-runtime";
import { useToolcraftDispatch } from "../app-shell/use-toolcraft";
import {
  type ToolcraftControlsSceneExport,
  type ToolcraftPanelActionHandler,
  useControlsPanelActions,
} from "./actions/controls-panel-actions";
import { PanelActionFeedback } from "./actions/panel-action-feedback";
import type { ToolcraftControlRendererMap } from "./control-renderers";
import {
  getToolcraftControlVisibilityTargets,
  getToolcraftSectionVisibilityTargets,
  isToolcraftControlVisible,
  isToolcraftSectionVisible,
} from "./conditions/control-conditions";
import { getControlsPanelTargetDependencies } from "./conditions/control-condition-dependencies";
import type { ControlsPanelSetControlValue } from "./layout/controls-panel-control-group";
import { ControlsPanelSectionNavigation } from "./layout/controls-panel-section-navigation";
import { useControlsPanelScroll } from "./layout/use-controls-panel-scroll";
import {
  type ControlEntry,
  countControlsByType,
  getControlsRecord,
  isControlsPanelRenderableControl,
} from "./layout/controls-panel-layout";
import { ControlsPanelSection } from "./layout/controls-panel-section";

export type {
  ToolcraftPanelActionContext,
  ToolcraftPanelActionHandler,
} from "./actions/controls-panel-actions";

export type ControlsPanelProps = {
  className?: string;
  controlRenderers?: ToolcraftControlRendererMap;
  framed?: boolean;
  onPanelAction?: ToolcraftPanelActionHandler;
  onPanelStateChange?: PanelStateChange;
  panelPlacement?: PanelPlacement;
  panelState?: ToolcraftPanelState;
  /** A host presentation selects sections without replacing the canonical schema. */
  sections?: readonly ResolvedToolcraftControlSectionSchema[];
  resetTargets?: readonly string[];
  keyframeControls?: boolean;
  sceneExport?: ToolcraftControlsSceneExport;
};

type VisibleSection = {
  entries: readonly ControlEntry[];
  section: ResolvedToolcraftControlSectionSchema;
};

type ControlsPanelSelection = {
  controlsResetKey: number;
  keyframeControlsEnabled: boolean;
  vectorPadShape: "compact" | "square";
  visibleSections: readonly VisibleSection[];
};

function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
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

function panelSelectionsEqual(
  previous: ControlsPanelSelection,
  next: ControlsPanelSelection,
): boolean {
  return (
    previous.controlsResetKey === next.controlsResetKey &&
    previous.keyframeControlsEnabled === next.keyframeControlsEnabled &&
    previous.vectorPadShape === next.vectorPadShape &&
    previous.visibleSections.length === next.visibleSections.length &&
    previous.visibleSections.every(
      (visibleSection, index) =>
        visibleSection.section === next.visibleSections[index]?.section &&
        entriesEqual(
          visibleSection.entries,
          next.visibleSections[index]?.entries ?? [],
        ),
    )
  );
}

function getPanelDependencies({
  controlsPanel,
  keyframesSupported,
}: {
  controlsPanel: ResolvedToolcraftControlsPanelSchema | undefined;
  keyframesSupported: boolean;
}): ToolcraftStoreDependency[] {
  const visibilityTargets =
    controlsPanel?.sections.flatMap((section) => [
      ...getToolcraftSectionVisibilityTargets(section),
      ...Object.values(section.controls).flatMap((control) =>
        getToolcraftControlVisibilityTargets(control),
      ),
    ]) ?? [];

  return [
    {
      kind: "history.source",
      source: getToolcraftControlsResetHistorySource(),
    },
    ...(keyframesSupported ? [{ kind: "timeline.expanded" } as const] : []),
    ...getControlsPanelTargetDependencies(visibilityTargets),
  ];
}

function selectControlsPanel(
  state: ToolcraftState,
  controlsPanel: ResolvedToolcraftControlsPanelSchema | undefined,
  keyframesSupported: boolean,
): ControlsPanelSelection {
  const visibleSections =
    controlsPanel?.sections
      .map(
        (section): VisibleSection => ({
          entries: Object.entries(section.controls).filter(([, control]) =>
            isToolcraftControlVisible(state, control),
          ),
          section,
        }),
      )
      .filter(
        ({ entries, section }) =>
          (section.id === "runtime.setup" ||
            entries.some(([, control]) => isControlsPanelRenderableControl(control))) &&
          isToolcraftSectionVisible(state, section),
      ) ?? [];
  const visibleControlsPanelSections = visibleSections.map(
    ({ entries, section }) => ({
      ...section,
      controls: getControlsRecord(entries),
    }),
  );
  const vectorControlCount = countControlsByType(
    visibleControlsPanelSections,
    "vector",
  );

  return {
    controlsResetKey: getToolcraftHistorySourceGeneration(
      state.history,
      getToolcraftControlsResetHistorySource(),
    ),
    keyframeControlsEnabled: keyframesSupported && state.timeline.expanded,
    vectorPadShape: vectorControlCount === 1 ? "square" : "compact",
    visibleSections,
  };
}

export function ControlsPanel({
  className,
  controlRenderers,
  framed = true,
  onPanelAction,
  onPanelStateChange,
  panelPlacement,
  panelState,
  sections,
  resetTargets,
  keyframeControls = true,
  sceneExport,
}: ControlsPanelProps): React.JSX.Element | null {
  const dispatch = useToolcraftDispatch();
  const store = useToolcraftStore();
  const theme = React.useContext(ToolcraftThemeContext);
  const contentRef = useControlsPanelScroll();
  const schema = store.getCommittedState().schema;
  const controlsPanel = React.useMemo(
    () => schema.panels.controls && sections
      ? { ...schema.panels.controls, sections }
      : schema.panels.controls,
    [schema.panels.controls, sections],
  );
  const keyframesSupported =
    keyframeControls && schema.assembly.capabilities.includes("timeline.keyframes");
  const dependencies = React.useMemo(
    () => getPanelDependencies({ controlsPanel, keyframesSupported }),
    [controlsPanel, keyframesSupported],
  );
  const selection = useToolcraftDependencySelector(
    React.useCallback(
      (state: ToolcraftState) =>
        selectControlsPanel(state, controlsPanel, keyframesSupported),
      [controlsPanel, keyframesSupported],
    ),
    panelSelectionsEqual,
    dependencies,
  );
  const {
    panelActionFeedback,
    runAction,
    stickyFooterActive,
    stickyFooterProgress,
  } =
    useControlsPanelActions({
      dispatch,
      getState: store.getState,
      onPanelAction,
      sceneExport,
    });
  const runActionRef = React.useRef(runAction);
  runActionRef.current = runAction;
  const stableRunAction = React.useCallback<typeof runAction>(
    (action, options) => {
      runActionRef.current(action, options);
    },
    [],
  );
  const panelBinding = useToolcraftPanelBinding({
    onPanelStateChange,
    panelId: "controls",
    panelState,
  });
  const resolvedPanelState = panelBinding.panelState;
  const collapsedSectionByKey = resolvedPanelState.collapsedSections ?? {};
  const [navigationRootElement, setNavigationRootElement] =
    React.useState<HTMLDivElement | null>(null);

  const dispatchCommand = React.useCallback(
    (command: ToolcraftCommand): void => {
      dispatch(command.type === "controls.resetTargets" && resetTargets
        ? { ...command, targets: command.targets.filter((target) => resetTargets.includes(target)) }
        : command);
    },
    [dispatch, resetTargets],
  );
  const setControlValue = React.useCallback<ControlsPanelSetControlValue>(
    (target, value, label, meta?: ControlChangeMeta): void => {
      dispatchCommand({
        history: meta?.history,
        historyGroup: meta?.historyGroup,
        label,
        target,
        type: "controls.setValue",
        value,
      });
    },
    [dispatchCommand],
  );
  const handleSectionCollapsedChange = React.useCallback(
    (sectionId: string, collapsed: boolean): void => {
      dispatch({ collapsed, sectionId, type: "panels.setSectionCollapsed" });
    },
    [dispatch],
  );

  if (!controlsPanel || resolvedPanelState.hidden) {
    return null;
  }

  const placement = panelPlacement ?? (framed ? "frame" : "surface");
  const renderedSections = selection.visibleSections
    .map(({ entries, section }) => ({
      entries,
      navigationId: `toolcraft-controls-section-${section.id}`,
      section,
      sectionCollapseKey: section.id,
    }));
  const navigationItems = renderedSections.flatMap(
    ({ navigationId, section }) =>
      section.actionGroup === undefined && section.title
        ? [{ id: navigationId, title: section.title }]
        : [],
  );
  const panel = (
    <div
      className="relative w-fit shrink-0"
      data-toolcraft-controls-panel-shell=""
      ref={setNavigationRootElement}
    >
      <Panel
        className={cn(
          "shrink-0",
          placement === "frame" && "max-h-none",
          className,
        )}
        collapsed={resolvedPanelState.collapsed}
        contentRef={contentRef}
        contentTransitionSuppressionKey={
          selection.keyframeControlsEnabled ? "keyframes" : "plain"
        }
        key={selection.controlsResetKey}
        onCollapsedChange={(collapsed) =>
          panelBinding.onPanelStateChange({ collapsed })
        }
        onResetControls={() => {
          const savedTheme = store.getCommittedState().schema.sourceDefaults?.theme;
          if (!resetTargets && savedTheme) theme?.setThemePreference(savedTheme);
          dispatchCommand(resetTargets
            ? { type: "controls.resetTargets", targets: [...resetTargets] }
            : { type: "controls.reset" });
        }}
        stickyFooterActive={stickyFooterActive}
        stickyFooterProgress={stickyFooterProgress}
        title={controlsPanel.title}
      >
        {renderedSections.map(
          ({
            entries,
            navigationId,
            section,
            sectionCollapseKey,
          }) => (
            <ControlsPanelSection
              data-toolcraft-panel-section=""
              actionGroup={section.actionGroup}
              collapsed={collapsedSectionByKey[sectionCollapseKey] === true}
              controlRenderers={controlRenderers}
              dispatch={dispatch}
              dispatchCommand={dispatchCommand}
              entries={entries}
              key={section.id}
              keyframesSupported={keyframesSupported}
              onCollapsedChange={handleSectionCollapsedChange}
              runAction={stableRunAction}
              section={section}
              sectionCollapseKey={sectionCollapseKey}
              sectionNavigationId={navigationId}
              setControlValue={setControlValue}
              vectorPadShape={selection.vectorPadShape}
            />
          ),
        )}
      </Panel>
      <PanelActionFeedback feedback={panelActionFeedback} />
      {/* Reset replaces Panel; discard its navigation listeners and hover timers too. */}
      <ControlsPanelSectionNavigation
        items={navigationItems}
        key={`navigation-${selection.controlsResetKey}`}
        rootElement={navigationRootElement}
      />
    </div>
  );

  if (placement === "surface") {
    return panel;
  }

  return (
    <PanelContainer
      onPanelStateChange={panelBinding.onPanelStateChange}
      panelState={resolvedPanelState}
      panelType="controls"
      placement={placement}
    >
      {panel}
    </PanelContainer>
  );
}
