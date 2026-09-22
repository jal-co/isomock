"use client";
import * as React from "react";
import { TimelinePanel } from "../../../../react/timeline/timeline-panel";
import { useToolcraftCommittedSelector } from "../../../../react/app-shell/toolcraft-selectors";
import type { ToolcraftState } from "../../../../state/types";

const selectExtended = (state: ToolcraftState) => state.panels.timeline.extended === true;

export function TimelineSurface(): React.JSX.Element {
  const extended = useToolcraftCommittedSelector(selectExtended);
  return <TimelinePanel panelPlacement="floating" variant={extended ? "extended" : "compact"} />;
}
