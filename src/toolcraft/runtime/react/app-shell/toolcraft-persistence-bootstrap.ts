import type { ResolvedToolcraftAppSchema } from "../../schema/resolved-app-schema";
import {
  getToolcraftPersistenceKey,
  parseToolcraftPersistenceSnapshotResult,
  type ToolcraftPersistenceCheckpoint,
} from "../../composition/public-persistence";
import type { ToolcraftInitialState } from "../../state/types";

export type ToolcraftPersistenceBootstrap = {
  blockedReason?: "incompatible-version";
  initialState?: ToolcraftInitialState;
  checkpoint?: ToolcraftPersistenceCheckpoint;
};

const emptyBootstrap: ToolcraftPersistenceBootstrap = {};

export function readToolcraftPersistenceBootstrap(
  schema: ResolvedToolcraftAppSchema,
  storageKind: "localStorage" | "sessionStorage" = "localStorage",
): ToolcraftPersistenceBootstrap {
  const storageKey = getToolcraftPersistenceKey(schema.persistence);

  if (!storageKey || typeof window === "undefined") {
    return emptyBootstrap;
  }

  try {
    const snapshot = window[storageKind].getItem(storageKey);
    const checkpoint = { current: { snapshot } };
    const parsed = parseToolcraftPersistenceSnapshotResult(schema, snapshot);

    if (parsed.kind === "incompatible-version") {
      return {
        blockedReason: "incompatible-version",
        checkpoint,
      };
    }
    return parsed.kind === "current" ? { checkpoint, initialState: parsed.state } : { checkpoint };
  } catch {
    return { checkpoint: { current: { status: "failed", reason: "unavailable" } } };
  }
}
