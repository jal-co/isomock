import type { ToolcraftAuthoredStateMigrationInput } from "../schema/authored-state-migration";
import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import { getToolcraftDefaultCanvasMode } from "./canvas-frame";
import { getInvalidToolcraftKeyedCollectionTarget, getToolcraftValueControls } from "./control-value-normalization";
import { readCanvasSize } from "./persistence-reader-primitives";
import { isToolcraftPersistenceRecord as isRecord } from "./persistence-shared";

/** Copy only finite plain data. App callbacks cannot mutate the admitted input or retain live state. */
function copyFrozenJson(value: unknown, parents = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean" ||
      typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || parents.has(value) ||
      !Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new Error("Authored state migration requires finite JSON data.");
  }
  parents.add(value);
  const copy = Array.isArray(value)
    ? value.map(child => copyFrozenJson(child, parents))
    : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copyFrozenJson(child, parents)]));
  parents.delete(value);
  return Object.freeze(copy);
}

function canvasContext(schema: ResolvedToolcraftAppSchema, candidate: unknown): ToolcraftAuthoredStateMigrationInput["canvas"] {
  if (candidate !== undefined && candidate !== null && !isRecord(candidate)) {
    throw new Error("Invalid authored canvas context.");
  }
  const canvas = isRecord(candidate) ? candidate : {};
  const size = canvas.size === undefined ? schema.canvas.size : readCanvasSize(canvas.size);
  const mode = canvas.mode ?? getToolcraftDefaultCanvasMode(schema.canvas);
  if (!size || size.width <= 0 || size.height <= 0 || mode !== "finite" && mode !== "infinite") {
    throw new Error("Invalid authored canvas context.");
  }
  return Object.freeze({ mode, size: Object.freeze({ ...size }) });
}

/** Called only after the owning reader admits its envelope; its canonical reader still owns decoding. */
export function migrateToolcraftAuthoredState(
  schema: ResolvedToolcraftAppSchema,
  state: Record<string, unknown>,
  source: ToolcraftAuthoredStateMigrationInput["source"],
  sourceVersion: number,
): Record<string, unknown> {
  if (!schema.authoredStateMigration || !Object.hasOwn(state, "values")) return state;
  if (!isRecord(state.values) || state.timeline !== undefined && !isRecord(state.timeline)) {
    throw new Error("Invalid authored state migration input.");
  }
  const input: ToolcraftAuthoredStateMigrationInput = Object.freeze({
    source,
    sourceVersion,
    values: copyFrozenJson(state.values) as Readonly<Record<string, unknown>>,
    canvas: canvasContext(schema, state.canvas),
    timeline: state.timeline === undefined ? undefined : copyFrozenJson(state.timeline) as Readonly<Record<string, unknown>>,
  });
  const result = schema.authoredStateMigration(input);
  if (!isRecord(result) || !isRecord(result.values) ||
      Object.keys(result).some(key => key !== "values" && key !== "timeline") ||
      result.timeline !== undefined && !isRecord(result.timeline)) {
    throw new Error("Invalid authored state migration result.");
  }
  const values = copyFrozenJson(result.values) as Record<string, unknown>;
  const invalidCollection = getInvalidToolcraftKeyedCollectionTarget(getToolcraftValueControls(schema), values);
  if (invalidCollection) throw new Error(`Invalid migrated value: ${invalidCollection}.`);
  return {
    ...state,
    values,
    ...(result.timeline === undefined ? {} : { timeline: copyFrozenJson(result.timeline) }),
  };
}
