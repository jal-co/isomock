import type { ToolcraftState } from "../state/types";
import type { ReadonlyToolcraftState, ToolcraftReadonly } from "../state/readonly-state";
import { ToolcraftArtifactExportError } from "./export-error";

export type ToolcraftArtifactReadonly<T> = ToolcraftReadonly<T>;

export type ToolcraftArtifactSnapshot = ReadonlyToolcraftState;

function invalidMetadata(message: string): never {
  throw new ToolcraftArtifactExportError({ code: "export-snapshot-invalid", message });
}

function validateMetadata(
  value: unknown,
  ancestors: WeakSet<object>,
  validated: WeakSet<object>,
): void {
  if (value === null || value === undefined) return;
  if (typeof value !== "object") {
    if (!["string", "number", "boolean"].includes(typeof value)) {
      invalidMetadata("Export state must contain plain metadata, not functions or non-data values.");
    }
    return;
  }
  if (ancestors.has(value)) invalidMetadata("Export state must not contain cyclic metadata.");
  if (validated.has(value)) return;
  const prototype = Object.getPrototypeOf(value);
  const plainContainer = Array.isArray(value)
    ? prototype === Array.prototype
    : prototype === Object.prototype || prototype === null;
  if (!plainContainer) {
    invalidMetadata("Export state supports plain objects and arrays; binary resources belong behind resource references.");
  }
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key === "symbol" || !descriptor || !("value" in descriptor)) {
      invalidMetadata("Export metadata cannot contain symbol keys or accessors.");
    }
    if (!descriptor.enumerable && !(Array.isArray(value) && key === "length")) {
      invalidMetadata("Export metadata cannot contain hidden properties.");
    }
    validateMetadata(descriptor.value, ancestors, validated);
  }
  ancestors.delete(value);
  validated.add(value);
}

/** Only used on owned, validated metadata, never on live runtime objects. */
export function freezeToolcraftArtifactMetadata(value: unknown, visited = new WeakSet<object>()): void {
  if (value === null || typeof value !== "object" || visited.has(value)) return;
  visited.add(value);
  for (const child of Object.values(value)) freezeToolcraftArtifactMetadata(child, visited);
  Object.freeze(value);
}

/** Capture render state at admission; the command journal is not renderer input. */
export function createToolcraftArtifactSnapshot(state: ToolcraftState): ToolcraftArtifactSnapshot {
  try {
    // Preserve descriptors so projection cannot invoke or hide invalid metadata.
    const renderState: ToolcraftState = Object.create(Object.getPrototypeOf(state), {
      ...Object.getOwnPropertyDescriptors(state),
      history: {
        configurable: true,
        enumerable: true,
        value: { undo: [], redo: [] },
        writable: true,
      },
    });
    validateMetadata(renderState, new WeakSet(), new WeakSet());
    const snapshot = structuredClone(renderState);
    freezeToolcraftArtifactMetadata(snapshot);
    return snapshot;
  } catch (error) {
    if (error instanceof ToolcraftArtifactExportError) throw error;
    throw new ToolcraftArtifactExportError({
      code: "export-snapshot-invalid",
      message: "The current state could not be isolated for export.",
    }, { cause: error });
  }
}
