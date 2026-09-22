import { getToolcraftCollectionControl } from "./collection-control-state";
import type { ToolcraftCommand, ToolcraftState } from "./types";

/** Supply nondeterministic identity before entering the pure reducer. */
export function prepareToolcraftCollectionCommand(state: Pick<ToolcraftState, "schema">, command: ToolcraftCommand, idFactory: () => string = () => crypto.randomUUID()): ToolcraftCommand {
  if (command.type !== "controls.addCollectionItem" || command.itemId !== undefined) return command;
  return getToolcraftCollectionControl(state, command.target)?.identityField
    ? { ...command, itemId: idFactory() } : command;
}
