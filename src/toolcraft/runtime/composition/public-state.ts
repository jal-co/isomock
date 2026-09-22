import { reduceToolcraftSliderEdit } from "../state/slider-edit-reducer";
import type { ToolcraftCommandHandlers } from "../modules/contract/command-handlers";
import { createToolcraftExternalStore as createStore } from "../state/toolcraft-external-store";
import { reduceToolcraftCanvasCommand } from "../state/canvas-reducer";
import { reduceToolcraftControlsCommand } from "../state/controls-reducer";
import { reduceToolcraftCollectionCommand } from "../state/collection-control-state";
import { redoToolcraftHistory, undoToolcraftHistory } from "../state/history-patches";
import { layersCommandHandlers } from "../modules/built-ins/layers/core/layers-commands";
import { reduceToolcraftMediaCommand } from "../state/media-reducer";
import { applyToolcraftSettingsState } from "../state/settings-import";
import { reduceToolcraftPanelsCommand } from "../state/panels-reducer";
import { timelineCommandHandlers } from "../modules/built-ins/timeline/core/timeline-commands";
import type { ToolcraftCommand, ToolcraftState } from "../state/types";

import {
  assertUniqueToolcraftCommandOwners,
  createToolcraftCommandRouter,
} from "../modules/contract/command-handlers";

const collectionHandlers = Object.freeze({
  "controls.addCollectionItem": reduceToolcraftCollectionCommand,
  "controls.removeCollectionItem": reduceToolcraftCollectionCommand,
  "controls.selectCollectionItem": reduceToolcraftCollectionCommand,
  "controls.setCollectionItemField": reduceToolcraftCollectionCommand,
} satisfies ToolcraftCommandHandlers<
  ToolcraftState,
  Parameters<typeof reduceToolcraftCollectionCommand>[1]
>);
const controlsHandlers = Object.freeze({
  "controls.apply": reduceToolcraftControlsCommand,
  "controls.reset": reduceToolcraftControlsCommand,
  "controls.resetTargets": reduceToolcraftControlsCommand,
  "controls.setValue": reduceToolcraftControlsCommand,
} satisfies ToolcraftCommandHandlers<
  ToolcraftState,
  Parameters<typeof reduceToolcraftControlsCommand>[1]
>);
const canvasHandlers = Object.freeze({
  "canvas.center": reduceToolcraftCanvasCommand,
  "canvas.applySettings": reduceToolcraftCanvasCommand,
  "canvas.panBy": reduceToolcraftCanvasCommand,
  "canvas.setOffset": reduceToolcraftCanvasCommand,
  "canvas.setSize": reduceToolcraftCanvasCommand,
  "canvas.setViewport": reduceToolcraftCanvasCommand,
  "canvas.zoomIn": reduceToolcraftCanvasCommand,
  "canvas.zoomOut": reduceToolcraftCanvasCommand,
  "canvas.zoomReset": reduceToolcraftCanvasCommand,
} satisfies ToolcraftCommandHandlers<
  ToolcraftState,
  Parameters<typeof reduceToolcraftCanvasCommand>[1]
>);
const panelsHandlers = Object.freeze({
  "panels.resetOffset": reduceToolcraftPanelsCommand,
  "panels.setHidden": reduceToolcraftPanelsCommand,
  "panels.setOffset": reduceToolcraftPanelsCommand,
  "panels.setSectionCollapsed": reduceToolcraftPanelsCommand,
  "panels.update": reduceToolcraftPanelsCommand,
} satisfies ToolcraftCommandHandlers<
  ToolcraftState,
  Parameters<typeof reduceToolcraftPanelsCommand>[1]
>);
const mediaHandlers = Object.freeze({
  "media.delete": reduceToolcraftMediaCommand,
  "media.commitCanonicalImportAllocation": reduceToolcraftMediaCommand,
  "media.commitModelRepair": reduceToolcraftMediaCommand,
  "media.hydrateDefaultModel": reduceToolcraftMediaCommand,
  "media.hydrateModel": reduceToolcraftMediaCommand,
  "media.importBatch": reduceToolcraftMediaCommand,
  "media.reorder": reduceToolcraftMediaCommand,
  "media.setModelRepairError": reduceToolcraftMediaCommand,
  "media.setBinaryResourceState": reduceToolcraftMediaCommand,
  "media.transform": reduceToolcraftMediaCommand,
} satisfies ToolcraftCommandHandlers<
  ToolcraftState,
  Parameters<typeof reduceToolcraftMediaCommand>[1]
>);
const documentHandlers = {
  "controls.editSlider": reduceToolcraftSliderEdit,
  "settings.apply": (
    state: ToolcraftState,
    command: Extract<ToolcraftCommand, { type: "settings.apply" }>,
  ) => applyToolcraftSettingsState(state, command.settings),
  "history.undo": undoToolcraftHistory,
  "history.redo": redoToolcraftHistory,
};
const owners = {
  document: documentHandlers,
  layers: layersCommandHandlers,
  timeline: timelineCommandHandlers,
  collectionHandlers,
  controlsHandlers,
  canvasHandlers,
  panelsHandlers,
  mediaHandlers,
};
assertUniqueToolcraftCommandOwners(owners);

const reduceBase = createToolcraftCommandRouter<ToolcraftState, ToolcraftCommand>({
  ...documentHandlers,
  ...layersCommandHandlers,
  ...timelineCommandHandlers,
  ...collectionHandlers,
  ...controlsHandlers,
  ...canvasHandlers,
  ...panelsHandlers,
  ...mediaHandlers,
});

export function toolcraftReducer(state: ToolcraftState, command: ToolcraftCommand): ToolcraftState {
  return reduceBase(state, command);
}

export { createToolcraftState } from "../state/create-template-state";
export { decodeToolcraftCollectionFieldValue } from "../state/collection-control-state";

export function createToolcraftExternalStore(state: ToolcraftState) {
  return createStore(state, toolcraftReducer);
}
