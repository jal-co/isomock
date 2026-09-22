"use client";
import * as React from "react";
import { TimelineSurface } from "../../modules/built-ins/timeline/react/timeline-surface";
import { LayersPanel } from "../layers/layers-panel";
import type { ResolvedToolcraftAppSchema } from "../../schema/resolved-app-schema";
import { resolveToolcraftModuleBindings } from "../../modules/contract/module-bindings";
import type { ToolcraftProductModuleContribution } from "../../modules/contract/contribution";

type ModulePanelId = Extract<ToolcraftProductModuleContribution, { kind: "panel-surface"; }>["surface"];
type ModulePanelAdapter = Readonly<{
  slot: "before-controls" | "after-controls";
  render: () => React.JSX.Element;
}>;

const panelAdapters = Object.freeze({
  layers: Object.freeze({ slot: "before-controls", render: () => <LayersPanel panelPlacement="floating" /> }),
  timeline: Object.freeze({ slot: "after-controls", render: () => <TimelineSurface /> }),
} as const satisfies Record<ModulePanelId, ModulePanelAdapter>);
const panelIds = Object.keys(panelAdapters) as (keyof typeof panelAdapters)[];

export function resolveToolcraftModulePanels(surfaces: ResolvedToolcraftAppSchema["assembly"]["surfaces"]) {
  return resolveToolcraftModuleBindings(
    panelIds.filter(id => surfaces.panels[id]?.enabled).map(id => ({ id })), panelAdapters,
  );
}
