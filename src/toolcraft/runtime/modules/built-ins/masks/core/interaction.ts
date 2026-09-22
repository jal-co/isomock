import type { ToolcraftExternalInteractionPort, ToolcraftExternalInteractionSnapshot } from "../../../../schema/external-interaction";
import type { ToolcraftAuthoredEdit } from "../../../../state/authored-edit";
import type { ToolcraftCommand, ToolcraftState } from "../../../../state/types";
import { toolcraftMaskTargets, type ToolcraftMaskReferenceFrame } from "../contracts";
import { getToolcraftEvaluatedMasks, readToolcraftMaskItems } from "./geometry";
import { maskHandleId, maskHandles, maskHandleValue, type ToolcraftMaskHandleOperation } from "./handles";

/** App-owned command binding; the host receives only neutral geometry and never mask values. */
export function createToolcraftMaskInteraction(port: {
  readLive(): ToolcraftState;
  reference(state: ToolcraftState): ToolcraftMaskReferenceFrame;
  subscribeLive(listener: () => void): () => void;
  isEditing(): boolean;
  beginEdit(): ToolcraftAuthoredEdit;
  dispatch(command: ToolcraftCommand): void;
}): ToolcraftExternalInteractionPort<ToolcraftState> {
  let disposed = false;
  let gesture: { id: string; handleId: string; sequence: number; edit: ToolcraftAuthoredEdit; apply(point: { x: number; y: number }): void } | undefined;
  let previous: ToolcraftState | undefined;
  let snapshot: ToolcraftExternalInteractionSnapshot<ToolcraftState> = { handles: [], guides: [], preview: null };
  const cancel = () => { const current = gesture; gesture = undefined; current?.edit.cancel(); previous = undefined; };
  const getSnapshot = (): ToolcraftExternalInteractionSnapshot<ToolcraftState> => {
    const state = port.readLive();
    if (previous === state && Boolean(snapshot.preview) === port.isEditing()) return snapshot;
    previous = state;
    const visible = !disposed && state.values[toolcraftMaskTargets.show] === true;
    const evaluated = visible ? getToolcraftEvaluatedMasks(state, port.reference(state)) : null;
    const selected = state.values[toolcraftMaskTargets.selection];
    snapshot = {
      handles: evaluated?.items.flatMap(item => selected === item.id ? maskHandles(item) : maskHandles(item).slice(0, 1)) ?? [],
      guides: evaluated?.items.map(({ id, center, radiusX, radiusY, rotationDegrees }) => ({ id, center, radiusX, radiusY, rotationDegrees })) ?? [],
      preview: port.isEditing() ? state : null,
    };
    return snapshot;
  };
  return {
    getSnapshot,
    subscribe: port.subscribeLive,
    dispose() { disposed = true; cancel(); },
    dispatch(event) {
      if (disposed) throw new Error("Mask interaction has retired.");
      if (gesture && !port.isEditing()) gesture = undefined;
      if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) throw new Error("Invalid gesture sequence.");
      if (event.phase === "begin") {
        if (gesture) throw new Error("A mask gesture is already active.");
        if (!getSnapshot().handles.some(handle => handle.id === event.handleId)) throw new Error("The requested handle is not visible.");
        const state = port.readLive(), reference = port.reference(state);
        const item = readToolcraftMaskItems(state.values[toolcraftMaskTargets.items]).find(item => (["move", "radius", "stretch", "rotate"] as const).some(op => maskHandleId(item.id, op) === event.handleId));
        if (!item) throw new Error("The requested mask no longer exists.");
        const operation = event.handleId.slice(item.id.length + 1) as ToolcraftMaskHandleOperation;
        const ellipse = getToolcraftEvaluatedMasks(state, reference).items.find(ellipse => ellipse.id === item.id)!;
        port.dispatch({ type: "controls.setValue", target: toolcraftMaskTargets.selection, value: item.id, history: "skip" });
        const edit = port.beginEdit();
        gesture = { id: event.gestureId, handleId: event.handleId, sequence: event.sequence, edit, apply(point) {
          const { field, value } = maskHandleValue(operation, item, ellipse, reference, event.point, point);
          edit.update({ type: "controls.setCollectionItemField", target: toolcraftMaskTargets.items, itemId: item.id, fieldId: field, value, label: `Edit mask ${field}` });
        } };
        return;
      }
      if (!gesture || gesture.id !== event.gestureId || gesture.handleId !== event.handleId || event.sequence <= gesture.sequence) throw new Error("This mask gesture has retired.");
      gesture.sequence = event.sequence;
      if (event.phase === "cancel") { cancel(); return; }
      if (!port.isEditing()) { cancel(); throw new Error("This authored edit has retired."); }
      gesture.apply(event.point);
      if (event.phase === "end") { const completed = gesture; gesture = undefined; completed.edit.end(); previous = undefined; }
    },
  };
}
