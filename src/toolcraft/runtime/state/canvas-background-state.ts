import { getToolcraftRuntimeSetupBackgroundControls } from "../schema/runtime-setup-background";
import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import type {
  ReadonlyToolcraftState,
  ToolcraftReadonly,
} from "./readonly-state";

export type ToolcraftCanvasBackgroundState = Readonly<{
  color: string | undefined;
  enabled: boolean;
}>;

export function getToolcraftCanvasBackgroundState({
  schema,
  values,
}: {
  schema: ToolcraftReadonly<ResolvedToolcraftAppSchema>;
  values: Readonly<Record<string, unknown>>;
}): ToolcraftCanvasBackgroundState {
  const background = getToolcraftRuntimeSetupBackgroundControls(schema);

  if (!background) {
    return { color: undefined, enabled: false };
  }

  const colorValue =
    values[background.color.target] ?? background.color.defaultValue;
  const includeValue =
    values[background.include.target] ?? background.include.defaultValue;

  return {
    color:
      typeof colorValue === "string"
        ? colorValue
        : typeof background.color.defaultValue === "string"
          ? background.color.defaultValue
          : undefined,
    enabled: includeValue !== false,
  };
}

export function hasToolcraftRuntimeSetupBackground(
  schema: ToolcraftReadonly<ResolvedToolcraftAppSchema>,
): boolean {
  return getToolcraftRuntimeSetupBackgroundControls(schema) !== undefined;
}

export function isToolcraftRuntimeBackgroundEnabled({
  schema,
  values,
}: {
  schema: ToolcraftReadonly<ResolvedToolcraftAppSchema>;
  values: Readonly<Record<string, unknown>>;
}): boolean {
  if (!hasToolcraftRuntimeSetupBackground(schema)) {
    return true;
  }

  return getToolcraftCanvasBackgroundState({ schema, values }).enabled;
}

export function normalizeToolcraftCanvasModeForBackground({
  mode,
  schema,
  values,
}: {
  mode: ReadonlyToolcraftState["canvas"]["mode"];
  schema: ToolcraftReadonly<ResolvedToolcraftAppSchema>;
  values: Readonly<Record<string, unknown>>;
}): ReadonlyToolcraftState["canvas"]["mode"] {
  return mode === "infinite" &&
    schema.canvas.infinityBackgroundPolicy !== "optional" &&
    !isToolcraftRuntimeBackgroundEnabled({ schema, values })
    ? "finite"
    : mode;
}

export function getToolcraftInfiniteCanvasBackgroundColor(
  state: ReadonlyToolcraftState,
): string | undefined {
  const background = getToolcraftCanvasBackgroundState(state);

  if (state.canvas.mode !== "infinite" || !background.enabled) {
    return undefined;
  }

  return background.color;
}

export function getToolcraftRuntimeBackgroundColor(
  state: ReadonlyToolcraftState,
): string | undefined {
  return getToolcraftCanvasBackgroundState(state).color;
}
