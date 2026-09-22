import type { ResolvedToolcraftAppSchema } from "./resolved-app-schema";
import type { ResolvedToolcraftControlSchema, ToolcraftCanvasSize } from "./types";
import { isToolcraftRuntimeOwnedTarget } from "./runtime-targets";
import { getToolcraftValueControls, normalizeToolcraftControlValue } from "../state/control-value-normalization";
import { cloneToolcraftJsonValue } from "../state/control-value-codecs";
import { readCanvasSize } from "../state/persistence-reader-primitives";
import { migrateToolcraftAuthoredState } from "../state/authored-state-migration";
import { parseToolcraftWorkspaceDefaults, readToolcraftWorkspaceDefaults, writeToolcraftWorkspaceDefaults } from "../composition/workspace-defaults";
import type { ToolcraftWorkspaceDefaults, ToolcraftDefaultResource } from "./workspace-defaults-types";
export type ToolcraftAppDefaults = ToolcraftParameterDefaults | ToolcraftWorkspaceDefaults;

import type { ToolcraftState } from "../state/types";

type ToolcraftParameterDefaults = Readonly<{
  version: 1;
  appId: string;
  values: Readonly<Record<string, unknown>>;
  canvas: Readonly<{ mode: "finite" | "infinite"; size: ToolcraftCanvasSize }> | null;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function parameterControl(control: ResolvedToolcraftControlSchema): boolean {
  return control.type !== "fileDrop" && control.type !== "sourceCollection" &&
    (!isToolcraftRuntimeOwnedTarget(control.target) || control.target === "canvas.aspectRatio");
}

/** Validate saved source data against the current app, including hidden branches. */
export function parseToolcraftAppDefaults(
  schema: ResolvedToolcraftAppSchema, value: unknown,
): ToolcraftAppDefaults {
  if (isRecord(value) && value.version === 2) return parseToolcraftWorkspaceDefaults(schema, value);
  if (!isRecord(value) || Object.keys(value).sort().join() !== "appId,canvas,values,version" ||
      value.version !== 1 || value.appId !== schema.identity.id || !isRecord(value.values)) {
    throw new Error("Invalid application defaults or application identity.");
  }
  let canvas: ToolcraftParameterDefaults["canvas"] = null;
  if (value.canvas !== null) {
    if (!isRecord(value.canvas) || Object.keys(value.canvas).sort().join() !== "mode,size" ||
        schema.canvas.sizing.mode !== "editable-output" ||
        (value.canvas.mode !== "finite" && value.canvas.mode !== "infinite") ||
        !isRecord(value.canvas.size) || Object.keys(value.canvas.size).sort().join() !== "height,unit,width") {
      throw new Error("Defaults require an editable canvas and valid canvas geometry.");
    }
    const size = readCanvasSize(value.canvas.size);
    if (!size || size.width <= 0 || size.height <= 0) throw new Error("Invalid default canvas size.");
    canvas = { mode: value.canvas.mode, size };
  }
  const migrated = migrateToolcraftAuthoredState(schema, { values: value.values, canvas }, "defaults", value.version);
  const controls = getToolcraftValueControls(schema);
  const migratedAdditionalTargets = new Set(schema.authoredStateMigration ? [
    ...(schema.persistence.storage === "localStorage" ? schema.persistence.additionalValueTargets : []),
    ...schema.settingsTransfer.additionalValueTargets,
  ] : []);
  const values: Record<string, unknown> = {};
  for (const [target, candidate] of Object.entries(migrated.values as Record<string, unknown>)) {
    const control = controls.get(target);
    if (!control && migratedAdditionalTargets.has(target)) {
      values[target] = cloneToolcraftJsonValue(candidate);
      continue;
    }
    if (!control || !parameterControl(control)) throw new Error(`Defaults cannot own ${target}.`);
    const normalized = normalizeToolcraftControlValue(control, candidate);
    if (!normalized.accepted) throw new Error(`Invalid default for ${target}.`);
    values[target] = cloneToolcraftJsonValue(normalized.value);
  }
  return { version: 1, appId: schema.identity.id, values, canvas };
}

export function createToolcraftAppDefaults(
  state: ToolcraftState, resources: readonly ToolcraftDefaultResource[] = [],
  theme: ToolcraftWorkspaceDefaults["theme"] = "dark",
): ToolcraftWorkspaceDefaults {
  return parseToolcraftWorkspaceDefaults(state.schema, {
    version: 2, appId: state.schema.identity.id,
    state: writeToolcraftWorkspaceDefaults(state), resources, theme,
  });
}

/** Apply before freezing the schema, so controls, default markers and Reset agree. */
export function applyToolcraftAppDefaults(
  schema: ResolvedToolcraftAppSchema, source: unknown,
): ResolvedToolcraftAppSchema {
  if (source === undefined || source === null) return schema;
  const parsed = parseToolcraftAppDefaults(schema, source);
  const defaults = parsed.version === 1 ? parsed : { values: parsed.state.values, canvas: parsed.state.canvas };
  const controls = getToolcraftValueControls(schema);
  const additionalDefaults = parsed.version === 1
    ? Object.fromEntries(Object.entries(parsed.values).filter(([target]) => !controls.has(target)))
    : {};
  const sourceDefaults = parsed.version === 2 ? {
    initialState: readToolcraftWorkspaceDefaults(schema, parsed), resources: parsed.resources, theme: parsed.theme,
  } : Object.keys(additionalDefaults).length ? {
    initialState: { values: additionalDefaults }, resources: [], scope: "parameters" as const,
  } : undefined;
  const canvas = defaults.canvas && schema.canvas.sizing.mode === "editable-output"
    ? { ...schema.canvas, size: defaults.canvas.size, sizeSource: "app" as const,
        sizing: { ...schema.canvas.sizing, defaultMode: defaults.canvas.mode } }
    : schema.canvas;
  const updateControl = (control: ResolvedToolcraftControlSchema): ResolvedToolcraftControlSchema => {
    if (Object.hasOwn(defaults.values, control.target)) {
      const range = parsed.version === 2 ? parsed.state.controlRanges?.[control.target] : undefined;
      return { ...control, ...range, defaultValue: defaults.values[control.target] } as ResolvedToolcraftControlSchema;
    }
    if (defaults.canvas) {
      if (control.target === "canvas.size.width") return { ...control, defaultValue: canvas.size.width } as ResolvedToolcraftControlSchema;
      if (control.target === "canvas.size.height") return { ...control, defaultValue: canvas.size.height } as ResolvedToolcraftControlSchema;
    }
    return control;
  };
  return {
    ...schema, canvas, ...(sourceDefaults ? { sourceDefaults } : {}),
    panels: { ...schema.panels, ...(schema.panels.controls ? { controls: {
      ...schema.panels.controls,
      sections: schema.panels.controls.sections.map((section) => ({
        ...section, controls: Object.fromEntries(Object.entries(section.controls).map(([id, control]) => [id, updateControl(control)])),
      })),
    } } : {}) },
  };
}
