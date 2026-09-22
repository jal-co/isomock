import type {
  ToolcraftControlDecisionCatalog,
  ToolcraftLabelPolicy,
  ToolcraftPanelPlacement,
  ToolcraftPanelSnapEdge,
  ToolcraftSectionLayout,
} from "./types";

export function decisionCatalog(
  catalog: ToolcraftControlDecisionCatalog,
): ToolcraftControlDecisionCatalog {
  return catalog;
}

export function control<
  const Id extends string,
  const VisualComponent extends string,
  const SectionLayout extends ToolcraftSectionLayout,
  const LabelPolicy extends ToolcraftLabelPolicy,
>(
  id: Id,
  visualComponent: VisualComponent,
  defaultSectionLayout: SectionLayout,
  labelPolicy: LabelPolicy,
): {
  readonly defaultSectionLayout: SectionLayout;
  readonly historyPolicy: "patch";
  readonly id: Id;
  readonly kind: "control";
  readonly labelPolicy: LabelPolicy;
  readonly schemaType: Id;
  readonly stateMode: "controlled";
  readonly visualComponent: VisualComponent;
} {
  return {
    defaultSectionLayout,
    historyPolicy: "patch",
    id,
    kind: "control",
    labelPolicy,
    schemaType: id,
    stateMode: "controlled",
    visualComponent,
  };
}

export function panel<
  const Id extends string,
  const VisualComponent extends string,
  const Placement extends ToolcraftPanelPlacement,
  const SnapEdges extends readonly ToolcraftPanelSnapEdge[],
  const DragMode extends "handle" | "panel",
>(
  id: Id,
  visualComponent: VisualComponent,
  defaultPlacement: Placement,
  snapEdges: SnapEdges,
  dragMode: DragMode,
): {
  readonly aiUsageRules: readonly [`Render ${VisualComponent} only through PanelHost.`];
  readonly capabilities: readonly [
    "draggable",
    "snap",
    "doubleClickReset",
    `dragMode:${DragMode}`,
  ];
  readonly defaultPlacement: Placement;
  readonly historyPolicy: "optional";
  readonly id: Id;
  readonly kind: "panel";
  readonly requiredWrapper: "PanelHost";
  readonly schemaType: Id;
  readonly snapEdges: SnapEdges;
  readonly stateMode: "runtime-owned";
  readonly visualComponent: VisualComponent;
} {
  return {
    aiUsageRules: [`Render ${visualComponent} only through PanelHost.`],
    capabilities: [
      "draggable",
      "snap",
      "doubleClickReset",
      `dragMode:${dragMode}` as const,
    ],
    defaultPlacement,
    historyPolicy: "optional",
    id,
    kind: "panel",
    requiredWrapper: "PanelHost",
    schemaType: id,
    snapEdges,
    stateMode: "runtime-owned",
    visualComponent,
  };
}
