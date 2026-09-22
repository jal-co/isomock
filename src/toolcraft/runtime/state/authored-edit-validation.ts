import { decodeToolcraftCollectionFieldValue, getToolcraftCollectionControl, getToolcraftCollectionItems } from "./collection-control-state";
import { resolveToolcraftCollectionItemIndex } from "../schema/collection-identity";
import { getToolcraftValueControls, normalizeToolcraftLiveControlValue } from "./control-value-normalization";
import type { ToolcraftAuthoredEditCommand } from "./authored-edit";
import type { ToolcraftState } from "./types";

/** A rejected value must retain the last valid preview instead of becoming a reducer no-op. */
export function validateToolcraftAuthoredEdit(state: ToolcraftState, command: ToolcraftAuthoredEditCommand): void {
  if (command.type === "controls.setCollectionItemField") {
    const control = getToolcraftCollectionControl(state, command.target);
    if (!control || !decodeToolcraftCollectionFieldValue(control, command.fieldId, command.value).accepted) throw new Error("Invalid authored collection field.");
    const items = getToolcraftCollectionItems(state, control);
    if (!items || resolveToolcraftCollectionItemIndex(control, items, command) < 0) throw new Error("This authored collection item has retired.");
    return;
  }
  if (command.type === "controls.setValue" || command.type === "controls.apply") {
    const controls = getToolcraftValueControls(state.schema);
    const values = command.type === "controls.setValue" ? { [command.target]: command.value } : command.values ?? {};
    for (const [target, value] of Object.entries(values)) {
      const control = controls.get(target);
      if (!control || !normalizeToolcraftLiveControlValue(control, value).accepted) throw new Error(`Invalid authored value for "${target}".`);
    }
  }
}
