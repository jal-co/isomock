import type { ToolcraftInitialState, ToolcraftPanelId } from "./types";

export type ToolcraftPersistencePayload = {
  state: ToolcraftInitialState;
  version: number;
};

export const toolcraftPersistedPanelIds = [
  "controls",
  "layers",
  "timeline",
  "toolbar",
] as const satisfies readonly ToolcraftPanelId[];

export function isToolcraftPersistenceRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isToolcraftFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
