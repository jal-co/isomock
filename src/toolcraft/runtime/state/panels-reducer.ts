import type {
  ToolcraftCommand,
  ToolcraftPanelId,
  ToolcraftPanelPatch,
  ToolcraftState,
} from "./types";

type ToolcraftPanelsCommand = Extract<
  ToolcraftCommand,
  {
    type:
      | "panels.resetOffset"
      | "panels.setHidden"
      | "panels.setOffset"
      | "panels.setSectionCollapsed"
      | "panels.update";
  }
>;

function panelPatchesEqual(
  panel: NonNullable<ToolcraftState["panels"][keyof ToolcraftState["panels"]]>,
  patch: ToolcraftPanelPatch,
): boolean {
  const scalarKeys = [
    "collapsed", "extended", "hidden", "scrollTop", "snapEdge",
  ] as const;

  return (
    (!patch.offset ||
      (panel.offset.x === patch.offset.x &&
        panel.offset.y === patch.offset.y)) &&
    scalarKeys.every(
      (key) => !Object.hasOwn(patch, key) || Object.is(panel[key], patch[key]),
    )
  );
}

function updatePanel(
  state: ToolcraftState,
  panelId: ToolcraftPanelId,
  patch: ToolcraftPanelPatch,
): ToolcraftState {
  const panel = state.panels[panelId];
  if (!panel) return state;

  if (
    patch.scrollTop !== undefined &&
    (!Number.isFinite(patch.scrollTop) || patch.scrollTop < 0)
  ) {
    return state;
  }

  if (panelPatchesEqual(panel, patch)) {
    return state;
  }

  return {
    ...state,
    panels: {
      ...state.panels,
      [panelId]: {
        ...panel,
        ...patch,
      },
    },
  };
}

export function reduceToolcraftPanelsCommand(
  state: ToolcraftState,
  command: ToolcraftPanelsCommand,
): ToolcraftState {
  switch (command.type) {
    case "panels.update":
      return updatePanel(state, command.panelId, command.patch);

    case "panels.setSectionCollapsed": {
      const sections = state.schema.panels.controls?.sections ?? [];

      if (!sections.some((section) => section.id === command.sectionId)) {
        return state;
      }

      const current = state.panels.controls.collapsedSections;

      if ((current[command.sectionId] === true) === command.collapsed) {
        return state;
      }

      const collapsedSections = { ...current };

      if (command.collapsed) {
        collapsedSections[command.sectionId] = true;
      } else {
        delete collapsedSections[command.sectionId];
      }

      return {
        ...state,
        panels: {
          ...state.panels,
          controls: {
            ...state.panels.controls,
            collapsedSections,
          },
        },
      };
    }

    case "panels.setOffset":
      return updatePanel(state, command.panelId, { offset: command.offset });

    case "panels.setHidden":
      return updatePanel(state, command.panelId, { hidden: command.hidden });

    case "panels.resetOffset":
      return updatePanel(state, command.panelId, {
        offset: { x: 0, y: 0 },
        snapEdge: undefined,
      });
  }
}
