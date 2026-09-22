"use client";

import * as React from "react";

import type {
  ToolcraftPanelId,
  ToolcraftPanelsState,
  ToolcraftPanelState,
  ToolcraftState,
} from "../../state/types";
import { useToolcraftCommittedSelector } from "../app-shell/toolcraft-selectors";
import { useToolcraftDispatch } from "../app-shell/use-toolcraft";
import type { PanelStateChange } from "./panel-host-types";

export type ToolcraftPanelBinding<PanelId extends ToolcraftPanelId> = {
  onPanelStateChange: PanelStateChange;
  panelState: NonNullable<ToolcraftPanelsState[PanelId]>;
};

export function useToolcraftPanelBinding<PanelId extends ToolcraftPanelId>({
  onPanelStateChange,
  panelId,
  panelState,
}: {
  onPanelStateChange?: PanelStateChange;
  panelId: PanelId;
  panelState?: ToolcraftPanelState;
}): ToolcraftPanelBinding<PanelId> {
  const dispatch = useToolcraftDispatch();
  const selectPanelState = React.useCallback(
    (state: ToolcraftState) => state.panels[panelId],
    [panelId],
  );
  const runtimePanelState = useToolcraftCommittedSelector(selectPanelState);
  if (!runtimePanelState) throw new Error(`Panel ${panelId} requires its enabled module.`);
  const controlled = panelState !== undefined;
  const handlePanelStateChange = React.useCallback<PanelStateChange>(
    (patch) => {
      onPanelStateChange?.(patch);

      if (!controlled) {
        dispatch({ panelId, patch, type: "panels.update" });
      }
    },
    [controlled, dispatch, onPanelStateChange, panelId],
  );
  const resolvedPanelState: NonNullable<ToolcraftPanelsState[PanelId]> =
    panelState === undefined
      ? runtimePanelState
      : { ...runtimePanelState, ...panelState };

  return {
    onPanelStateChange: handlePanelStateChange,
    panelState: resolvedPanelState,
  };
}
