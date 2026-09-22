import { createToolcraftPersistenceController as createController } from "../state/persistence-controller";
import type { ToolcraftLocalStoragePersistenceSchema } from "../schema/types";
import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import { readMediaAssets } from "../state/persistence-reader-media";
import { workspacePersistenceCodec } from "./workspace-persistence-codec";
import { isToolcraftPersistenceRecord } from "../state/persistence-shared";
import { migrateToolcraftAuthoredState } from "../state/authored-state-migration";
import type { ToolcraftInitialState } from "../state/types";

export type { ToolcraftPersistencePayload } from "../state/persistence-shared";
export { mergeToolcraftInitialState } from "../state/persistence-merge";
import type { ToolcraftState } from "../state/types";
import type { ToolcraftPersistencePayload } from "../state/persistence-shared";

export type ToolcraftPersistenceSnapshotParseResult =
  | { kind: "absent" | "incompatible-version" | "invalid"; }
  | {
    kind: "current";
    state: ToolcraftInitialState;
  };

export function parseToolcraftPersistenceSnapshotResult(
  schema: ResolvedToolcraftAppSchema,
  rawValue: string | null,
): ToolcraftPersistenceSnapshotParseResult {
  const persistence = schema.persistence;

  if (persistence.storage !== "localStorage" || !rawValue) {
    return { kind: "absent" };
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawValue);
  } catch {
    return { kind: "invalid" };
  }

  if (
    !isToolcraftPersistenceRecord(payload) ||
    typeof payload.version !== "number" ||
    !Number.isInteger(payload.version)
  ) {
    return { kind: "invalid" };
  }
  if (payload.version !== persistence.version) {
    return { kind: "incompatible-version" };
  }
  if (!isToolcraftPersistenceRecord(payload.state)) {
    return { kind: "invalid" };
  }
  if (
    persistence.include.includes("media") &&
    Object.hasOwn(payload.state, "mediaAssets") &&
    readMediaAssets(payload.state.mediaAssets) === undefined
  ) {
    return { kind: "invalid" };
  }

  let candidate: Record<string, unknown>;
  try {
    candidate = migrateToolcraftAuthoredState(schema, payload.state, "persistence", payload.version);
  } catch {
    return { kind: "invalid" };
  }
  const state =
    workspacePersistenceCodec.read(
      schema,
      candidate,
      new Set(persistence.include),
    ) ?? {};

  return { kind: "current", state };
}

export function parseToolcraftPersistenceSnapshot(
  schema: ResolvedToolcraftAppSchema,
  rawValue: string | null,
): ToolcraftInitialState | undefined {
  const result = parseToolcraftPersistenceSnapshotResult(schema, rawValue);

  return result.kind === "current" ? result.state : undefined;
}

export function getToolcraftPersistenceKey(
  persistence: ResolvedToolcraftAppSchema["persistence"],
): ToolcraftLocalStoragePersistenceSchema["key"] | undefined {
  return persistence.storage === "localStorage" ? persistence.key : undefined;
}

export function createToolcraftPersistenceSnapshot(state: ToolcraftState, persistence: ResolvedToolcraftAppSchema["persistence"]): ToolcraftPersistencePayload | undefined {
  if (persistence.storage !== "localStorage") return undefined;
  return {
    state: workspacePersistenceCodec.write(state, { ...state.schema, persistence }, new Set(persistence.include)),
    version: persistence.version,
  };
}

export function createToolcraftPersistenceController(options: Omit<Parameters<typeof createController>[0], "createSnapshot">) {
  return createController({ ...options, createSnapshot: createToolcraftPersistenceSnapshot });
}
export type { ToolcraftPersistenceCheckpoint, ToolcraftPersistenceController, ToolcraftPersistenceStatus, ToolcraftPersistenceStorage, ToolcraftPersistenceWriteResult } from "../state/persistence-controller";
