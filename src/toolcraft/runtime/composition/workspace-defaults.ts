import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import type { ToolcraftPersistableStateSlice } from "../schema/types";
import type { ToolcraftWorkspaceDefaults } from "../schema/workspace-defaults-types";
import { parseToolcraftDefaultResources } from "../source-assets/default-resource-manifest";
import { createToolcraftState } from "../state/create-template-state";
import { migrateToolcraftAuthoredState } from "../state/authored-state-migration";
import { areToolcraftControlValuesEqual } from "../state/control-value-codecs";
import { isToolcraftPersistenceRecord as isRecord } from "../state/persistence-shared";
import type { ToolcraftState } from "../state/types";
import { workspacePersistenceCodec } from "./workspace-persistence-codec";

const slices = new Set<ToolcraftPersistableStateSlice>(["values", "canvas", "panels", "layers", "media", "timeline"]);
const fields = "canvas,layers,mediaAssets,panels,selectedLayerId,timeline,values";

function assertSerializable(value: unknown, parents = new Set<object>()): void {
  if (value === null || value === undefined || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || parents.has(value) ||
      (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new Error("Defaults require finite JSON values; a runtime value cannot be saved losslessly.");
  }
  parents.add(value);
  for (const child of Object.values(value)) assertSerializable(child, parents);
  parents.delete(value);
}

function context(schema: ResolvedToolcraftAppSchema, values: Record<string, unknown>): ResolvedToolcraftAppSchema {
  return { ...schema, persistence: {
    storage: "localStorage", key: "toolcraft:source-defaults:state:v1", version: 1,
    include: [...slices], additionalValueTargets: Object.keys(values),
  } };
}

/** Source defaults never inherit local persistence slice exclusions. */
export function writeToolcraftWorkspaceDefaults(state: ToolcraftState): ToolcraftWorkspaceDefaults["state"] {
  const snapshot = {
    ...workspacePersistenceCodec.write(state, context(state.schema, state.values), slices),
    values: state.values,
  };
  assertSerializable(snapshot);
  const serialized: ToolcraftWorkspaceDefaults["state"] = JSON.parse(JSON.stringify(snapshot));
  if (!areToolcraftControlValuesEqual(serialized.values, state.values)) {
    throw new Error("Defaults require finite JSON values; a runtime value cannot be saved losslessly.");
  }
  return serialized;
}

export function parseToolcraftWorkspaceDefaults(schema: ResolvedToolcraftAppSchema, input: unknown): ToolcraftWorkspaceDefaults {
  if (!isRecord(input) || Object.keys(input).sort().join() !== "appId,resources,state,theme,version" ||
      input.version !== 2 || input.appId !== schema.identity.id || !isRecord(input.state) ||
      ![fields, "canvas,controlRanges,layers,mediaAssets,panels,selectedLayerId,timeline,values"].includes(Object.keys(input.state).sort().join()) || !isRecord(input.state.values) ||
      typeof input.theme !== "string" || !["dark", "light", "system"].includes(input.theme)) {
    throw new Error("Invalid complete application defaults or application identity.");
  }
  const state = migrateToolcraftAuthoredState(schema, input.state, "defaults", input.version);
  const decoded = workspacePersistenceCodec.read(context(schema, state.values as Record<string, unknown>), state, slices);
  if (!decoded || !decoded.mediaAssets || !decoded.layers || !decoded.timeline) throw new Error("Incomplete workspace defaults.");
  // Readers intentionally tolerate old local workspaces. Authoring is stricter:
  // no invalid field, keyframe, selection or control may silently disappear.
  const restored = createToolcraftState({ ...schema, sourceDefaults: undefined }, decoded);
  const canonical = writeToolcraftWorkspaceDefaults(restored);
  const candidate = { ...state, mediaAssets: canonical.mediaAssets };
  const withoutLifecycle = (assets: unknown) => Array.isArray(assets) ? assets.map(asset => {
    if (!isRecord(asset)) return asset;
    const { lifecycle: _lifecycle, ...fields } = asset;
    return fields;
  }) : assets;
  if (!areToolcraftControlValuesEqual(candidate, canonical) ||
      !areToolcraftControlValuesEqual(withoutLifecycle(state.mediaAssets), withoutLifecycle(canonical.mediaAssets)) ||
      !areToolcraftControlValuesEqual(decoded.mediaAssets, restored.mediaAssets)) {
    throw new Error("Workspace defaults contain invalid or incomplete state.");
  }
  const resources = parseToolcraftDefaultResources(input.resources, canonical.mediaAssets);
  return { version: 2, appId: schema.identity.id, state: canonical, resources, theme: input.theme as ToolcraftWorkspaceDefaults["theme"] };
}

export function readToolcraftWorkspaceDefaults(schema: ResolvedToolcraftAppSchema, defaults: ToolcraftWorkspaceDefaults) {
  return workspacePersistenceCodec.read(context(schema, defaults.state.values), defaults.state, slices)!;
}
