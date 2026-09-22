import { TOOLCRAFT_COMPONENT_CONTRACTS } from "../contracts/component-contracts";
import type { ResolvedToolcraftAppCapabilities } from "./app-capabilities";
import type {
  ResolvedToolcraftPanelsSchema,
  ToolcraftAssemblyCapability,
  ToolcraftAssemblyCommand,
  ToolcraftAssemblyComponentId,
  ToolcraftAssemblyContract,
  ToolcraftAssemblyPanelContract,
  ToolcraftToolbarSchema,
} from "./types";
import type { ResolvedToolcraftAppSchema } from "./resolved-app-schema";

type PanelContract = {
  capabilities?: readonly string[];
  defaultPlacement: ToolcraftAssemblyPanelContract["defaultPlacement"];
  snapEdges: ToolcraftAssemblyPanelContract["snapEdges"];
  visualComponent: string;
};

function unique<const Value extends string>(values: readonly Value[]): Value[] {
  return Array.from(new Set(values));
}

function getPanelDragMode(contract: {
  capabilities?: readonly string[];
}): ToolcraftAssemblyPanelContract["dragMode"] {
  return contract.capabilities?.includes("dragMode:handle")
    ? "handle"
    : "panel";
}

function createPanelAssemblyContract({
  capabilities = [],
  commands = [],
  contract,
  enabled,
}: {
  capabilities?: readonly ToolcraftAssemblyCapability[];
  commands?: readonly ToolcraftAssemblyCommand[];
  contract: PanelContract;
  enabled: boolean;
}): ToolcraftAssemblyPanelContract {
  const panelCapabilities = enabled
    ? unique<ToolcraftAssemblyCapability>([
        "panels.draggable",
        "panels.snap",
        "panels.doubleClickReset",
        ...capabilities,
      ])
    : [];
  const panelCommands = enabled
    ? unique<ToolcraftAssemblyCommand>([
        "panels.setOffset",
        "panels.setHidden",
        "panels.update",
        "panels.resetOffset",
        ...commands,
      ])
    : [];

  return {
    capabilities: panelCapabilities,
    commands: panelCommands,
    defaultPlacement: contract.defaultPlacement,
    dragMode: getPanelDragMode(contract),
    enabled,
    requiredWrapper: "PanelHost",
    snapEdges: contract.snapEdges,
    visualComponent: contract.visualComponent,
  };
}

export function createToolcraftAssemblyContract({
  appCapabilities,
  canvas,
  panels,
  toolbar,
}: {
  appCapabilities: ResolvedToolcraftAppCapabilities;
  canvas: ResolvedToolcraftAppSchema["canvas"];
  panels: ResolvedToolcraftPanelsSchema;
  toolbar: Required<ToolcraftToolbarSchema>;
}): ToolcraftAssemblyContract {
  const components: ToolcraftAssemblyComponentId[] = [];
  const capabilities: ToolcraftAssemblyCapability[] = [];
  const commands: ToolcraftAssemblyCommand[] = [];
  const toolbarEnabled =
    toolbar.history || toolbar.radar || toolbar.theme || toolbar.zoom;
  const canvasEditableSize = canvas.sizing.mode === "editable-output";

  if (canvas.enabled) {
    components.push("canvas");

    if (canvasEditableSize) {
      capabilities.push("canvas.editableSize", "canvas.infinity");
      commands.push("canvas.setSize");
    }

    if (canvas.renderScale.enabled) {
      capabilities.push("canvas.renderScale");
    }

    if (canvas.draggable) {
      capabilities.push("canvas.draggable");
      commands.push("canvas.panBy", "canvas.setOffset", "canvas.setViewport");
    }

    if (canvas.upload) {
      capabilities.push("canvas.upload");
    }
  }

  if (appCapabilities.hasMedia) {
    commands.push(
      "media.delete",
      "media.importBatch",
      "media.reorder",
      "media.transform",
    );
  }

  const controlsPanel = panels.controls
    ? createPanelAssemblyContract({
        capabilities: ["controls.panel", "controls.defaults"],
        commands: [
          "controls.addCollectionItem",
          "controls.apply",
          "controls.removeCollectionItem",
          "controls.reset",
          "controls.resetTargets",
          "controls.selectCollectionItem",
          "controls.setCollectionItemField",
          "controls.setValue",
          "panels.setSectionCollapsed",
        ],
        contract: TOOLCRAFT_COMPONENT_CONTRACTS.controlsPanel,
        enabled: true,
      })
    : undefined;

  if (controlsPanel) {
    components.push("controlsPanel");
    capabilities.push(...controlsPanel.capabilities);
    commands.push(...controlsPanel.commands);
  }

  const layersPanel = panels.layers
    ? createPanelAssemblyContract({
        capabilities: [
          "layers.groups",
          "layers.panel",
          "layers.selection",
          "layers.visibility",
        ],
        commands: [
          "layers.add",
          "layers.delete",
          "layers.moveToGroup",
          "layers.rename",
          "layers.reorder",
          "layers.select",
          "layers.toggleCollapsed",
          "layers.toggleVisibility",
        ],
        contract: TOOLCRAFT_COMPONENT_CONTRACTS.layersPanel,
        enabled: true,
      })
    : undefined;

  if (layersPanel) {
    components.push("layersPanel");
    capabilities.push(...layersPanel.capabilities);
    commands.push(...layersPanel.commands);
  }

  const timelineKeyframesEnabled = panels.timeline?.mode === "keyframes";
  const timelinePanel = panels.timeline?.enabled
    ? createPanelAssemblyContract({
        capabilities: [
          "timeline.duration",
          "timeline.panel",
          "timeline.playback",
          ...(timelineKeyframesEnabled
            ? (["timeline.keyframes"] as const)
            : []),
        ],
        commands: [
          "timeline.setCurrentTime",
          "timeline.setDuration",
          "timeline.setPlaying",
          "timeline.toggleLoop",
          "timeline.togglePlayback",
          ...(timelineKeyframesEnabled
            ? ([
                "timeline.changeKeyframeEasing",
                "timeline.deleteControlKeyframes",
                "timeline.deleteKeyframe",
                "timeline.moveKeyframe",
                "timeline.selectKeyframe",
                "timeline.setExpanded",
                "timeline.toggleControlKeyframes",
                "timeline.toggleExpanded",
              ] as const)
            : []),
        ],
        contract: TOOLCRAFT_COMPONENT_CONTRACTS.timelinePanel,
        enabled: true,
      })
    : undefined;

  if (timelinePanel) {
    components.push("timelinePanel");
    capabilities.push(...timelinePanel.capabilities);
    commands.push(...timelinePanel.commands);
  }

  const toolbarCommands: ToolcraftAssemblyCommand[] = [];
  const toolbarCapabilities: ToolcraftAssemblyCapability[] = [];

  if (toolbar.history) {
    toolbarCapabilities.push("history.undoRedo", "toolbar.history");
    toolbarCommands.push("history.redo", "history.undo");
  }

  if (toolbar.radar) {
    toolbarCapabilities.push("toolbar.radar");
    toolbarCommands.push("canvas.center");
  }

  if (toolbar.theme) {
    toolbarCapabilities.push("toolbar.theme");
  }

  if (toolbar.zoom) {
    toolbarCapabilities.push("toolbar.zoom");
    toolbarCommands.push("canvas.zoomIn", "canvas.zoomOut", "canvas.zoomReset");
  }

  const toolbarPanel = createPanelAssemblyContract({
    capabilities: toolbarCapabilities,
    commands: toolbarCommands,
    contract: TOOLCRAFT_COMPONENT_CONTRACTS.toolbar,
    enabled: toolbarEnabled,
  });

  if (toolbarEnabled) {
    components.push("toolbar");
    capabilities.push(...toolbarPanel.capabilities);
    commands.push(...toolbarPanel.commands);
  }

  return {
    capabilities: unique(capabilities),
    commands: unique(commands),
    components: unique(components),
    surfaces: {
      canvas: {
        capabilities: canvas.enabled
          ? unique<ToolcraftAssemblyCapability>([
              ...(canvasEditableSize ? (["canvas.editableSize"] as const) : []),
              ...(canvasEditableSize ? (["canvas.infinity"] as const) : []),
              ...(canvas.draggable ? (["canvas.draggable"] as const) : []),
              ...(canvas.upload ? (["canvas.upload"] as const) : []),
            ])
          : [],
        commands: canvas.enabled
          ? unique<ToolcraftAssemblyCommand>([
              ...(canvasEditableSize ? (["canvas.setSize"] as const) : []),
              ...(canvas.draggable
                ? ([
                    "canvas.panBy",
                    "canvas.setOffset",
                    "canvas.setViewport",
                  ] as const)
                : []),
              ...(canvas.upload
                ? ([
                    "media.delete",
                    "media.importBatch",
                    "media.reorder",
                    "media.transform",
                  ] as const)
                : []),
            ])
          : [],
        enabled: canvas.enabled,
        visualComponent: "CanvasShell",
      },
      panels: {
        controls: controlsPanel,
        layers: layersPanel,
        timeline: timelinePanel,
        toolbar: toolbarPanel,
      },
    },
  };
}
