import type { ToolcraftCommand, ToolcraftState } from "./types";
import { validateToolcraftAuthoredEdit } from "./authored-edit-validation";

/** Absolute authored updates only: relative commands cannot be replayed as previews. */
export type ToolcraftAuthoredEditCommand = Extract<ToolcraftCommand, {
  type: "controls.setValue" | "controls.apply" | "controls.setCollectionItemField" |
    "canvas.applySettings";
}>;

export type ToolcraftAuthoredEdit = {
  update(command: ToolcraftAuthoredEditCommand): void;
  end(): boolean;
  cancel(): void;
};

export type ToolcraftAuthoredEdits = {
  begin(): ToolcraftAuthoredEdit;
  isActive(): boolean;
  cancel(): void;
};

const commandTypes = new Set<ToolcraftCommand["type"]>([
  "controls.setValue", "controls.apply", "controls.setCollectionItemField", "canvas.applySettings",
]);

function assertFiniteValues(value: unknown, ancestors = new Set<object>()): void {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Authored edits require finite numeric values.");
  if (value && typeof value === "object") {
    if (ancestors.has(value)) throw new Error("Authored edits require acyclic values.");
    ancestors.add(value);
    Object.values(value).forEach(child => assertFiniteValues(child, ancestors));
    ancestors.delete(value);
  }
}

/** One lease projects through the canonical reducer; it never owns another state store. */
export function createAuthoredEditOverlay(ports: {
  read(): ToolcraftState;
  reduce(state: ToolcraftState, command: ToolcraftCommand): ToolcraftState;
  commit(command: ToolcraftCommand): void;
  publish(): void;
  admit(): void;
}): ToolcraftAuthoredEdits & { project(state: ToolcraftState): ToolcraftState } {
  let active: { command?: ToolcraftAuthoredEditCommand } | undefined;

  const projectCommand = (state: ToolcraftState, command: ToolcraftAuthoredEditCommand) => {
    const next = ports.reduce(state, { ...command, history: "skip", historyGroup: undefined });
    return next === state ? state : { ...next, history: state.history };
  };

  const cancel = () => {
    if (!active) return;
    active = undefined;
    ports.publish();
  };

  return {
    cancel,
    isActive: () => active !== undefined,
    project: (state) => active?.command ? projectCommand(state, active.command) : state,
    begin() {
      ports.admit();
      if (active) throw new Error("An authored edit is already active");
      const lease: { command?: ToolcraftAuthoredEditCommand } = {};
      active = lease;
      ports.publish();
      return {
        update(command) {
          if (active !== lease) throw new Error("This authored edit has retired");
          if (!commandTypes.has(command.type)) throw new Error("Unsupported authored edit command");
          const owned = structuredClone(command);
          assertFiniteValues(owned);
          validateToolcraftAuthoredEdit(ports.read(), owned);
          // Validate before changing the live lease; a failed update preserves the last preview.
          projectCommand(ports.read(), owned);
          lease.command = owned;
          ports.publish();
        },
        end() {
          if (active !== lease) return false;
          active = undefined;
          if (lease.command) {
            try { ports.commit({ ...lease.command, history: "record", historyGroup: undefined }); }
            catch (error) { ports.publish(); throw error; }
          } else ports.publish();
          return true;
        },
        cancel() { if (active === lease) cancel(); },
      };
    },
  };
}
